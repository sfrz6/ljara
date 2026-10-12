import { and, eq, lt } from "drizzle-orm";
import type { DB } from "@/db/client";
import { organisations, scheduleItems, tenants, units } from "@/db/schema";
import { addDays, todayISO } from "@/lib/dates";
import { formatDate } from "@/lib/dates";
import { formatOMR } from "@/lib/money";
import { activateDueContracts, alertExpiringContracts } from "./contracts";
import { promoteDueCheques } from "./cheques";
import { flushQueued, notifyTenant, orgPrefs } from "./notifications";
import { writeAudit } from "./audit";
import { systemCtx } from "./context";

export interface DailyJobResult {
  orgId: string;
  chequesDue: number;
  contractsActivated: number;
  expiryAlerts: number;
  reminders: number;
  flushed: number;
  archivedTenants: number;
}

/** Rent reminders before each due date (CR-6.2). Idempotent per schedule item and lead time. */
export async function sendRentReminders(q: DB, orgId: string, today = todayISO()): Promise<number> {
  const prefs = await orgPrefs(q, orgId);
  const [org] = await q.select().from(organisations).where(eq(organisations.id, orgId));
  let sent = 0;
  for (const days of prefs.reminderDaysBefore) {
    const target = addDays(today, days);
    const items = await q
      .select({ item: scheduleItems, tenant: tenants, unit: units.label })
      .from(scheduleItems)
      .innerJoin(tenants, eq(tenants.id, scheduleItems.tenantId))
      .innerJoin(units, eq(units.id, scheduleItems.unitId))
      .where(and(eq(scheduleItems.orgId, orgId), eq(scheduleItems.status, "open"), eq(scheduleItems.dueDate, target)));
    for (const r of items) {
      if (r.tenant.status === "archived") continue;
      const res = await notifyTenant(q, {
        orgId,
        tenantId: r.tenant.id,
        template: "rent_reminder",
        vars: {
          org: r.tenant.locale === "ar" ? (org.nameAr ?? org.name) : org.name,
          amount: formatOMR(r.item.amountBaisa, r.tenant.locale),
          unit: r.unit,
          date: formatDate(r.item.dueDate, r.tenant.locale),
        },
        idempotencyKey: `reminder:${r.item.id}:${days}`,
        link: "/portal/schedule",
        related: { type: "schedule_item", id: r.item.id },
      });
      if (!res.duplicate) sent += 1;
    }
  }
  return sent;
}

export async function archiveExpiredFormerTenants(q: DB, orgId: string, today = todayISO()): Promise<number> {
  const res = await q
    .update(tenants)
    .set({ status: "archived" })
    .where(and(eq(tenants.orgId, orgId), eq(tenants.status, "former"), lt(tenants.portalAccessUntil, today)))
    .returning({ id: tenants.id });
  return res.length;
}

export async function runDailyJobs(db: DB, orgId: string, today = todayISO()): Promise<DailyJobResult> {
  const chequesDue = await promoteDueCheques(db, orgId, today);
  const contractsActivated = await activateDueContracts(db, orgId, today);
  const expiryAlerts = await alertExpiringContracts(db, orgId, today);
  const reminders = await sendRentReminders(db, orgId, today);
  const flushed = await flushQueued(db, orgId);
  const archivedTenants = await archiveExpiredFormerTenants(db, orgId, today);
  await writeAudit(db, systemCtx(orgId, "Daily job"), {
    action: "job.daily_run",
    entityType: "organisation",
    entityId: orgId,
    after: { chequesDue, contractsActivated, expiryAlerts, reminders, flushed, archivedTenants },
  });
  return { orgId, chequesDue, contractsActivated, expiryAlerts, reminders, flushed, archivedTenants };
}

export async function runDailyJobsForAll(db: DB, today = todayISO()): Promise<DailyJobResult[]> {
  const orgs = await db.select({ id: organisations.id }).from(organisations).where(eq(organisations.status, "active"));
  const out: DailyJobResult[] = [];
  for (const o of orgs) out.push(await runDailyJobs(db, o.id, today));
  return out;
}

