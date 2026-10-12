import { and, asc, desc, eq, inArray, isNull, ne, or } from "drizzle-orm";
import type { DB } from "@/db/client";
import {
  attachments,
  buildings,
  cheques,
  contracts,
  maintenanceEvents,
  maintenanceRequests,
  organisations,
  payments,
  receipts,
  scheduleItems,
  units,
} from "@/db/schema";
import { todayISO } from "@/lib/dates";
import { NotFoundError } from "./errors";
import { tenantScheduleStatus, type TenantScheduleStatus } from "./finance";
import type { MaintenanceStatus } from "./machines";

/**
 * Tenant portal read model. Every query is anchored on (orgId, tenantId) from the SESSION, never from the
 * request, so a tenant has no route to another tenant's data even by editing the address (CR-5.4, CR-14.10).
 * It never selects maintenance costs, owner data, internal notes, security deposits or bank level cheque states.
 */
export interface TenantScope {
  orgId: string;
  tenantId: string;
}

/** Status vocabulary shown to the tenant for a maintenance request (CR-5.6). */
export type TenantRequestStatus = "received" | "assigned" | "in_progress" | "completed";

export function tenantRequestStatus(status: MaintenanceStatus): TenantRequestStatus {
  switch (status) {
    case "submitted":
    case "seen":
      return "received";
    case "assigned":
      return "assigned";
    case "in_progress":
      return "in_progress";
    default:
      return "completed";
  }
}

export async function tenantContract(q: DB, t: TenantScope) {
  const rows = await q
    .select({
      id: contracts.id,
      reference: contracts.reference,
      startDate: contracts.startDate,
      endDate: contracts.endDate,
      monthlyRentBaisa: contracts.monthlyRentBaisa,
      paymentFrequency: contracts.paymentFrequency,
      status: contracts.status,
      unitLabel: units.label,
      unitLabelAr: units.labelAr,
      unitType: units.type,
      bedrooms: units.bedrooms,
      buildingName: buildings.nameEn,
      buildingNameAr: buildings.nameAr,
      area: buildings.area,
    })
    .from(contracts)
    .innerJoin(units, eq(units.id, contracts.unitId))
    .innerJoin(buildings, eq(buildings.id, units.buildingId))
    .where(and(eq(contracts.orgId, t.orgId), eq(contracts.tenantId, t.tenantId), or(isNull(contracts.outcome), ne(contracts.outcome, "cancelled"))))
    .orderBy(desc(contracts.startDate));
  const live = rows.find((r) => r.status === "active") ?? rows.find((r) => r.status === "pending") ?? rows[0] ?? null;
  return { current: live, history: rows.filter((r) => r !== live) };
}

export interface TenantScheduleRow {
  id: string;
  seq: number;
  dueDate: string;
  amountBaisa: number;
  status: TenantScheduleStatus;
  receiptId: string | null;
  receiptNumber: string | null;
  canPayOnline: boolean;
}

export async function tenantSchedule(q: DB, t: TenantScope, today = todayISO()): Promise<{ visible: boolean; items: TenantScheduleRow[] }> {
  const [org] = await q.select().from(organisations).where(eq(organisations.id, t.orgId));
  if (!org?.tenantScheduleVisible) return { visible: false, items: [] };
  const items = await q
    .select()
    .from(scheduleItems)
    .where(and(eq(scheduleItems.orgId, t.orgId), eq(scheduleItems.tenantId, t.tenantId), ne(scheduleItems.status, "cancelled")))
    .orderBy(asc(scheduleItems.dueDate));
  if (items.length === 0) return { visible: true, items: [] };
  const ids = items.map((i) => i.id);
  const chq = await q
    .select({ itemId: cheques.scheduleItemId, status: cheques.status })
    .from(cheques)
    .where(and(eq(cheques.orgId, t.orgId), inArray(cheques.scheduleItemId, ids), inArray(cheques.status, ["received", "due", "deposited", "collected", "bounced", "follow_up"])));
  const chequeByItem = new Map(chq.map((c) => [c.itemId, c.status]));
  const receiptList = await q
    .select({ itemId: payments.scheduleItemId, id: receipts.id, display: receipts.displayNumber })
    .from(receipts)
    .innerJoin(payments, eq(payments.id, receipts.paymentId))
    .where(and(eq(receipts.orgId, t.orgId), eq(payments.tenantId, t.tenantId), eq(receipts.kind, 'receipt'), eq(receipts.status, 'issued')));
  const receiptByItem = new Map(receiptList.map((r) => [r.itemId, r]));

  const rows: TenantScheduleRow[] = items.map((i) => {
    const chequeStatus = chequeByItem.get(i.id) ?? null;
    const status = tenantScheduleStatus({ itemStatus: i.status, chequeStatus, dueDate: i.dueDate, today });
    const covered = chequeStatus === "received" || chequeStatus === "due" || chequeStatus === "deposited";
    return {
      id: i.id,
      seq: i.seq,
      dueDate: i.dueDate,
      amountBaisa: i.amountBaisa,
      status,
      receiptId: receiptByItem.get(i.id)?.id ?? null,
      receiptNumber: receiptByItem.get(i.id)?.display ?? null,
      canPayOnline: org.onlinePaymentsEnabled && i.status === "open" && !covered && i.dueDate <= today,
    };
  });
  return { visible: true, items: rows };
}

export async function tenantReceipts(q: DB, t: TenantScope) {
  return q
    .select({ id: receipts.id, displayNumber: receipts.displayNumber, amountBaisa: receipts.amountBaisa, paidOn: payments.paidOn })
    .from(receipts)
    .innerJoin(payments, eq(payments.id, receipts.paymentId))
    .where(and(eq(receipts.orgId, t.orgId), eq(payments.tenantId, t.tenantId), eq(receipts.kind, 'receipt'), eq(receipts.status, 'issued')))
    .orderBy(desc(payments.paidOn), desc(receipts.number));
}

export async function tenantRequests(q: DB, t: TenantScope) {
  const rows = await q
    .select({
      id: maintenanceRequests.id,
      reference: maintenanceRequests.reference,
      title: maintenanceRequests.title,
      status: maintenanceRequests.status,
      priority: maintenanceRequests.priority,
      createdAt: maintenanceRequests.createdAt,
      updatedAt: maintenanceRequests.updatedAt,
      unitLabel: units.label,
    })
    .from(maintenanceRequests)
    .innerJoin(units, eq(units.id, maintenanceRequests.unitId))
    .where(and(eq(maintenanceRequests.orgId, t.orgId), eq(maintenanceRequests.tenantId, t.tenantId)))
    .orderBy(desc(maintenanceRequests.createdAt));
  return rows.map((r) => ({ ...r, tenantStatus: tenantRequestStatus(r.status as MaintenanceStatus) }));
}

export async function tenantRequestDetail(q: DB, t: TenantScope, requestId: string) {
  const [r] = await q
    .select({
      id: maintenanceRequests.id,
      reference: maintenanceRequests.reference,
      title: maintenanceRequests.title,
      description: maintenanceRequests.description,
      status: maintenanceRequests.status,
      priority: maintenanceRequests.priority,
      createdAt: maintenanceRequests.createdAt,
      unitLabel: units.label,
    })
    .from(maintenanceRequests)
    .innerJoin(units, eq(units.id, maintenanceRequests.unitId))
    .where(and(eq(maintenanceRequests.id, requestId), eq(maintenanceRequests.orgId, t.orgId), eq(maintenanceRequests.tenantId, t.tenantId)));
  if (!r) throw new NotFoundError("maintenance_request");
  const events = await q
    .select({ status: maintenanceEvents.status, at: maintenanceEvents.at })
    .from(maintenanceEvents)
    .where(and(eq(maintenanceEvents.requestId, r.id), eq(maintenanceEvents.internal, false)))
    .orderBy(asc(maintenanceEvents.at));
  // Collapse internal steps into the four statuses the tenant understands.
  const timeline: { status: TenantRequestStatus; at: Date }[] = [];
  for (const e of events) {
    const st = tenantRequestStatus(e.status as MaintenanceStatus);
    if (!timeline.some((x) => x.status === st)) timeline.push({ status: st, at: e.at });
  }
  const photos = await q
    .select({ fileId: attachments.fileId })
    .from(attachments)
    .where(and(eq(attachments.orgId, t.orgId), eq(attachments.entityType, "maintenance_request"), eq(attachments.entityId, r.id), eq(attachments.internal, false)));
  return { ...r, tenantStatus: tenantRequestStatus(r.status as MaintenanceStatus), timeline, photoFileIds: photos.map((p) => p.fileId) };
}
