import { beforeAll, describe, expect, it } from "vitest";
import { and, desc, eq, sql } from "drizzle-orm";
import * as s from "@/db/schema";
import { DomainError } from "@/domain/errors";
import { bounceCheque, collectCheque, depositCheque, recoverCheque, startFollowUp, writeOffCheque } from "@/domain/cheques";
import { createContract, completeMoveOut, giveNotice, updateContractDocs } from "@/domain/contracts";
import { createTenant } from "@/domain/tenants";
import { completePaymentIntent, createPaymentIntent, recordManualPayment, voidReceipt } from "@/domain/payments";
import { completeRequest, decideInspection, performInspection, putOnHold, setCost, startWork, submitRequest } from "@/domain/maintenance";
import { signupOrganisation } from "@/domain/organisation";
import { createBuilding, createOwner, createUnit } from "@/domain/portfolio";
import * as portal from "@/domain/portal";
import { buildStatementData, generateStatement } from "@/domain/statements";
import * as dash from "@/domain/dashboard";
import { notifyTenant } from "@/domain/notifications";
import { setProviderForTests } from "@/integrations/providers";
import { addMonths, todayISO } from "@/lib/dates";
import { parseOMR } from "@/lib/money";
import { transitionUnit } from "@/domain/portfolio";
import { buildWorld, type World } from "./fixtures";

let w: World;
const today = todayISO();

beforeAll(async () => {
  w = await buildWorld();
});

async function dueCheque(ownerPrefix?: string) {
  const rows = await w.db
    .select({ c: s.cheques, prefix: s.owners.receiptPrefix })
    .from(s.cheques)
    .innerJoin(s.owners, eq(s.owners.id, s.cheques.ownerId))
    .where(and(eq(s.cheques.orgId, w.orgId), eq(s.cheques.status, "due")));
  return rows.filter((r) => !ownerPrefix || r.prefix === ownerPrefix).map((r) => r.c);
}

describe("cheque collection and receipts (CR-6.4, CR-14.2)", () => {
  it("collecting a due cheque issues the next receipt number and notifies the tenant", async () => {
    const [c] = await dueCheque();
    const before = await w.db.select().from(s.receiptCounters).where(eq(s.receiptCounters.ownerId, c.ownerId));
    const res = await collectCheque(w.db, w.ctx.accounts, c.id);
    expect(res.cheque.status).toBe("collected");
    expect(res.receipt.number).toBe(before[0].lastNumber + 1);
    expect(res.receipt.displayNumber).toMatch(/^[A-Z]+-\d{5}$/);
    expect(res.payment.amountBaisa).toBe(c.amountBaisa);
    const [item] = await w.db.select().from(s.scheduleItems).where(eq(s.scheduleItems.id, c.scheduleItemId));
    expect(item.status).toBe("paid");
    const sent = await w.db.select().from(s.notifications).where(and(eq(s.notifications.template, "receipt_issued"), eq(s.notifications.relatedId, res.receipt.id)));
    expect(sent.length).toBeGreaterThanOrEqual(2); // in-app copy + delivery record
  });

  it("refuses to collect the same cheque twice", async () => {
    const collected = (await w.db.select().from(s.cheques).where(and(eq(s.cheques.orgId, w.orgId), eq(s.cheques.status, "collected"))).limit(1))[0];
    await expect(collectCheque(w.db, w.ctx.accounts, collected.id)).rejects.toMatchObject({ code: "invalid_transition" });
  });

  it("two staff issuing receipts at the same moment get consecutive numbers (CR-12.3)", async () => {
    const same = (await dueCheque()).slice(0, 4);
    const byOwner = new Map<string, typeof same>();
    for (const c of same) byOwner.set(c.ownerId, [...(byOwner.get(c.ownerId) ?? []), c]);
    const group = [...byOwner.values()].sort((a, b) => b.length - a.length)[0];
    if (group.length < 2) return; // not enough due cheques for one owner in this data set
    const before = (await w.db.select().from(s.receiptCounters).where(eq(s.receiptCounters.ownerId, group[0].ownerId)))[0].lastNumber;
    const results = await Promise.all([collectCheque(w.db, w.ctx.accounts, group[0].id), collectCheque(w.db, w.ctx.manager, group[1].id)]);
    const numbers = results.map((r) => r.receipt.number).sort((a, b) => a - b);
    expect(numbers).toEqual([before + 1, before + 2]);
  });

  it("a rolled back transaction does not consume a receipt number (no gaps)", async () => {
    const [c] = await dueCheque();
    const before = (await w.db.select().from(s.receiptCounters).where(eq(s.receiptCounters.ownerId, c.ownerId)))[0].lastNumber;
    await expect(
      w.db.transaction(async (tx) => {
        await collectCheque(tx as never, w.ctx.accounts, c.id);
        throw new Error("simulated failure after the number was taken");
      }),
    ).rejects.toThrow("simulated failure");
    const after = (await w.db.select().from(s.receiptCounters).where(eq(s.receiptCounters.ownerId, c.ownerId)))[0].lastNumber;
    expect(after).toBe(before);
    const [still] = await w.db.select().from(s.cheques).where(eq(s.cheques.id, c.id));
    expect(still.status).toBe("due");
  });

  it("the whole series per owner has no gaps and no duplicates", async () => {
    const all = await w.db.select().from(s.receipts);
    const grouped = new Map<string, number[]>();
    for (const r of all) grouped.set(r.ownerId, [...(grouped.get(r.ownerId) ?? []), r.number]);
    for (const nums of grouped.values()) {
      const sorted = [...nums].sort((a, b) => a - b);
      expect(new Set(sorted).size).toBe(sorted.length);
      expect(sorted).toEqual(sorted.map((_, i) => i + 1));
    }
  });
});

describe("void and credit note (proposal 2.3.1)", () => {
  it("voiding keeps the number, issues a credit note in the same series and reopens the cheque", async () => {
    const [c] = await dueCheque();
    const { receipt, payment } = await collectCheque(w.db, w.ctx.accounts, c.id);
    await expect(voidReceipt(w.db, w.ctx.accounts, receipt.id, "wrong amount")).rejects.toMatchObject({ code: "forbidden" });
    const { creditNote } = await voidReceipt(w.db, w.ctx.manager, receipt.id, "Recorded against the wrong tenant");
    expect(creditNote.kind).toBe("credit_note");
    expect(creditNote.number).toBe(receipt.number + 1);
    const [original] = await w.db.select().from(s.receipts).where(eq(s.receipts.id, receipt.id));
    expect(original.status).toBe("voided");
    expect(original.number).toBe(receipt.number);
    const [pay] = await w.db.select().from(s.payments).where(eq(s.payments.id, payment.id));
    expect(pay.status).toBe("voided");
    const [item] = await w.db.select().from(s.scheduleItems).where(eq(s.scheduleItems.id, c.scheduleItemId));
    expect(item.status).toBe("open");
    const [chq] = await w.db.select().from(s.cheques).where(eq(s.cheques.id, c.id));
    expect(chq.status).toBe("deposited");
    await expect(voidReceipt(w.db, w.ctx.manager, receipt.id, "again")).rejects.toMatchObject({ code: "already_voided" });
    // The cheque can be collected again and gets a fresh number.
    const again = await collectCheque(w.db, w.ctx.accounts, c.id);
    expect(again.receipt.number).toBe(creditNote.number + 1);
  });

  it("issued receipts are immutable at the database level", async () => {
    const [r] = await w.db.select().from(s.receipts).limit(1);
    await expect(w.db.update(s.receipts).set({ amountBaisa: 1 }).where(eq(s.receipts.id, r.id))).rejects.toThrow();
    await expect(w.db.update(s.receipts).set({ number: 999 }).where(eq(s.receipts.id, r.id))).rejects.toThrow();
    await expect(w.db.delete(s.receipts).where(eq(s.receipts.id, r.id))).rejects.toThrow();
  });
});

describe("bounced cheque handling (CR-6.3, CR-14.3)", () => {
  it("bouncing alerts the manager at once and shows on the dashboard", async () => {
    const [c] = await dueCheque();
    await depositCheque(w.db, w.ctx.accounts, c.id);
    const before = (await dash.manager(w.db, w.orgId)).bounced.length;
    await bounceCheque(w.db, w.ctx.accounts, c.id, "Account closed");
    const d = await dash.manager(w.db, w.orgId);
    expect(d.bounced.length).toBe(before + 1);
    const alerts = await w.db
      .select()
      .from(s.notifications)
      .where(and(eq(s.notifications.template, "cheque_bounced"), eq(s.notifications.relatedId, c.id), eq(s.notifications.recipientId, w.ctx.manager.actor.id!)));
    expect(alerts).toHaveLength(1);
    expect(alerts[0].urgent).toBe(true);
    expect(alerts[0].channel).toBe("in_app");
  });

  it("follow up, recover with another payment method, or write off", async () => {
    const bounced = (await w.db.select().from(s.cheques).where(and(eq(s.cheques.orgId, w.orgId), eq(s.cheques.status, "bounced"))))[0];
    await expect(writeOffCheque(w.db, w.ctx.manager, bounced.id, "uncollectable")).rejects.toMatchObject({ code: "invalid_transition" });
    await startFollowUp(w.db, w.ctx.accounts, bounced.id, "Tenant visiting the office on Sunday");
    await expect(writeOffCheque(w.db, w.ctx.accounts, bounced.id, "uncollectable")).rejects.toMatchObject({ code: "forbidden" });
    const rec = await recoverCheque(w.db, w.ctx.accounts, bounced.id, { method: "cash", reference: "Cash at counter" });
    expect(rec.cheque.status).toBe("collected");
    expect(rec.payment.method).toBe("cash");
    const [other] = await w.db.select().from(s.cheques).where(and(eq(s.cheques.orgId, w.orgId), eq(s.cheques.status, "follow_up"))).limit(1);
    if (other) {
      await writeOffCheque(w.db, w.ctx.manager, other.id, "Tenant left the country");
      const [item] = await w.db.select().from(s.scheduleItems).where(eq(s.scheduleItems.id, other.scheduleItemId));
      expect(item.status).toBe("written_off");
    }
  });
});

describe("security cheque exclusion (CR-4.4, CR-12.2)", () => {
  it("never appears in collected rent, payments, receipts or owner statements", async () => {
    const deposits = await w.db.select().from(s.securityDeposits).where(eq(s.securityDeposits.orgId, w.orgId));
    expect(deposits.length).toBeGreaterThan(10);
    const depositTotal = deposits.reduce((a, d) => a + d.amountBaisa, 0);
    expect(depositTotal).toBeGreaterThan(0);

    // Every payment is tied to a rent schedule item; payments sum to exactly the schedule items marked paid.
    const [paid] = await w.db.select({ v: sql<number>`coalesce(sum(amount_baisa),0)::bigint`.mapWith(Number) }).from(s.payments).where(and(eq(s.payments.orgId, w.orgId), eq(s.payments.status, "posted")));
    const [items] = await w.db.select({ v: sql<number>`coalesce(sum(amount_baisa),0)::bigint`.mapWith(Number) }).from(s.scheduleItems).where(and(eq(s.scheduleItems.orgId, w.orgId), eq(s.scheduleItems.status, "paid")));
    expect(paid.v).toBe(items.v);

    const [owner] = await w.db.select().from(s.owners).where(and(eq(s.owners.orgId, w.orgId), eq(s.owners.receiptPrefix, "SH")));
    const data = await buildStatementData(w.db, w.orgId, owner.id, addMonths(today, -24), today);
    const rentLinesTotal = data.rentLines.reduce((a, l) => a + l.amountBaisa, 0);
    expect(data.totals.rentCollectedBaisa).toBe(rentLinesTotal);
    const ownerPayments = await w.db.select().from(s.payments).where(and(eq(s.payments.ownerId, owner.id), eq(s.payments.status, "posted")));
    expect(rentLinesTotal).toBe(ownerPayments.reduce((a, p) => a + p.amountBaisa, 0));
  });

  it("a security deposit id can never be paid through the payment path", async () => {
    const [dep] = await w.db.select().from(s.securityDeposits).where(eq(s.securityDeposits.orgId, w.orgId)).limit(1);
    await expect(recordManualPayment(w.db, w.ctx.accounts, { scheduleItemId: dep.id, method: "cash" })).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("online payments (CR-15.1, simulated gateway)", () => {
  let tenantCtxLike: { orgId: string; tenantId: string };
  let itemIds: string[] = [];
  let unitId: string;

  beforeAll(async () => {
    const t = await createTenant(w.db, w.ctx.contracts, {
      nameEn: "Online Payer",
      phone: "9988 0001",
      idNumber: "20202020",
      locale: "en",
      consent: true,
    });
    await w.db.update(s.tenants).set({ activatedAt: new Date() }).where(eq(s.tenants.id, t.id));
    const unit = await w.unit("A-106");
    unitId = unit.id;
    const c = await createContract(w.db, w.ctx.contracts, {
      unitId: unit.id,
      tenantId: t.id,
      startDate: addMonths(today, -2),
      endDate: addMonths(today, 10),
      monthlyRentBaisa: parseOMR("320")!,
      paymentFrequency: "monthly",
      cheques: [],
      security: { amountBaisa: parseOMR("320")! },
    });
    const items = await w.db.select().from(s.scheduleItems).where(eq(s.scheduleItems.contractId, c.id)).orderBy(s.scheduleItems.seq);
    itemIds = items.map((i) => i.id);
    tenantCtxLike = { orgId: w.orgId, tenantId: t.id };
  });

  it("success marks the item paid, issues a receipt, records the fee and audits", async () => {
    const intent = await createPaymentIntent(w.db, tenantCtxLike, itemIds[0]);
    expect(intent.feeBaisa).toBe(6_400); // 2% of 320.000
    const res = await completePaymentIntent(w.db, tenantCtxLike, intent.id, { result: "success" });
    expect(res.status).toBe("succeeded");
    if (res.status !== "succeeded") return;
    expect(res.payment.method).toBe("online");
    expect(res.payment.gatewayFeeBaisa).toBe(6_400);
    expect(res.receipt.number).toBeGreaterThan(0);
    const [item] = await w.db.select().from(s.scheduleItems).where(eq(s.scheduleItems.id, itemIds[0]));
    expect(item.status).toBe("paid");
    const audits = await w.db.select().from(s.auditLog).where(and(eq(s.auditLog.action, "payment.online_succeeded"), eq(s.auditLog.entityId, intent.id)));
    expect(audits).toHaveLength(1);
    await expect(completePaymentIntent(w.db, tenantCtxLike, intent.id, { result: "success" })).rejects.toMatchObject({ code: "intent_closed" });
  });

  it("failure leaves everything unpaid and tells the tenant", async () => {
    const intent = await createPaymentIntent(w.db, tenantCtxLike, itemIds[1]);
    const res = await completePaymentIntent(w.db, tenantCtxLike, intent.id, { result: "failure", reason: "card_declined" });
    expect(res.status).toBe("failed");
    const [item] = await w.db.select().from(s.scheduleItems).where(eq(s.scheduleItems.id, itemIds[1]));
    expect(item.status).toBe("open");
    const payments = await w.db.select().from(s.payments).where(eq(s.payments.scheduleItemId, itemIds[1]));
    expect(payments).toHaveLength(0);
    const msgs = await w.db.select().from(s.notifications).where(and(eq(s.notifications.template, "payment_failed"), eq(s.notifications.recipientId, tenantCtxLike.tenantId)));
    expect(msgs.length).toBeGreaterThan(0);
    // The tenant can try again.
    const retry = await createPaymentIntent(w.db, tenantCtxLike, itemIds[1]);
    expect((await completePaymentIntent(w.db, tenantCtxLike, retry.id, { result: "success" })).status).toBe("succeeded");
  });

  it("refuses to pay an item that is not due yet or covered by a cheque", async () => {
    await expect(createPaymentIntent(w.db, tenantCtxLike, itemIds[6])).rejects.toMatchObject({ code: "not_due_yet" });
    const chequeItem = (await w.db.select().from(s.cheques).where(and(eq(s.cheques.orgId, w.orgId), eq(s.cheques.status, "received"))).limit(1))[0];
    const [item] = await w.db.select().from(s.scheduleItems).where(eq(s.scheduleItems.id, chequeItem.scheduleItemId));
    await expect(createPaymentIntent(w.db, { orgId: w.orgId, tenantId: item.tenantId }, item.id)).rejects.toMatchObject({ code: "covered_by_cheque" });
  });

  it("the unit stays occupied and the online payment shows in owner figures", async () => {
    const [u] = await w.db.select().from(s.units).where(eq(s.units.id, unitId));
    expect(u.status).toBe("occupied");
    const [owner] = await w.db.select().from(s.owners).where(eq(s.owners.id, u.ownerId));
    const data = await buildStatementData(w.db, w.orgId, owner.id, addMonths(today, -1), today);
    expect(data.rentLines.some((l) => l.method === "online")).toBe(true);
  });
});

describe("maintenance flow: submitted, in progress, waiting, completed", () => {
  async function tenantAndTech() {
    const [tenant] = await w.db.select().from(s.tenants).where(and(eq(s.tenants.orgId, w.orgId), eq(s.tenants.idNumber, "12345678")));
    const [cat] = await w.db.select().from(s.maintenanceCategories).where(and(eq(s.maintenanceCategories.orgId, w.orgId), eq(s.maintenanceCategories.key, "plumbing")));
    return { tenant, cat };
  }

  it("a tenant request reaches the manager and the maintenance team", async () => {
    const { tenant } = await tenantAndTech();
    const req = await submitRequest(w.db, { orgId: w.orgId, actor: { kind: "tenant", id: tenant.id, name: tenant.nameEn, role: "tenant" } }, { title: "Dripping tap in the kitchen", description: "The kitchen tap drips constantly.", priority: "normal" });
    expect(req.status).toBe("submitted");
    expect(req.reference).toMatch(/^MR-\d{4}-\d{4}$/);
    const alerts = await w.db.select().from(s.notifications).where(and(eq(s.notifications.template, "maintenance_new"), eq(s.notifications.relatedId, req.id)));
    const who = new Set((await w.db.select().from(s.users).where(eq(s.users.orgId, w.orgId))).filter((u) => alerts.some((a) => a.recipientId === u.id)).map((u) => u.role));
    expect(who.has("manager")).toBe(true);
    expect(who.has("maintenance")).toBe(true);
  });

  it("when the office has no maintenance accounts the manager still receives and can work the request", async () => {
    const orgNoTeam = (await signupOrganisation(w.db, { orgName: "Solo Office", adminName: "Solo Manager", email: "solo@example.om", phone: "9944 5566", password: "Sturdy-Pass-2026", locale: "en" })).org;
    const [mgr] = await w.db.select().from(s.users).where(eq(s.users.email, "solo@example.om"));
    const ctx = { orgId: orgNoTeam.id, actor: { kind: "user" as const, id: mgr.id, name: mgr.name, role: "manager" as const } };
    const owner = await createOwner(w.db, ctx, { nameEn: "Solo Owner", commissionBp: 500, payoutFrequency: "monthly", receiptPrefix: "SO" });
    const b = await createBuilding(w.db, ctx, { ownerId: owner.id, nameEn: "Solo Tower" });
    const u = await createUnit(w.db, ctx, { buildingId: b.id, label: "1", type: "apartment", rentBaisa: 200_000 });
    const [cat] = await w.db.select().from(s.maintenanceCategories).where(eq(s.maintenanceCategories.orgId, orgNoTeam.id)).limit(1);
    const req = await submitRequest(w.db, ctx, { unitId: u.id, title: "Door handle loose", description: "The front door handle is loose.", priority: "normal" });
    const alerts = await w.db.select().from(s.notifications).where(and(eq(s.notifications.relatedId, req.id), eq(s.notifications.template, "maintenance_new")));
    expect(alerts.some((a) => a.recipientId === mgr.id)).toBe(true);
    await startWork(w.db, ctx, req.id);
    await completeRequest(w.db, ctx, req.id, { categoryId: cat.id, workPerformed: "Tightened the handle screws" });
    const [row] = await w.db.select().from(s.maintenanceRequests).where(eq(s.maintenanceRequests.id, req.id));
    expect(row.status).toBe("completed");
  });

  it("start, put on hold with a note the tenant can read, resume, complete with no cost: nothing reaches the owner", async () => {
    const { tenant, cat } = await tenantAndTech();
    const unit = await w.unit("A-101");
    const [owner] = await w.db.select().from(s.owners).where(eq(s.owners.id, unit.ownerId));
    const before = await buildStatementData(w.db, w.orgId, owner.id, today, today);
    const tenantCtx = { orgId: w.orgId, actor: { kind: "tenant" as const, id: tenant.id, name: tenant.nameEn, role: "tenant" as const } };
    const req = await submitRequest(w.db, tenantCtx, { title: "Bathroom fan is noisy", description: "The fan rattles loudly.", priority: "normal" });
    expect(req.unitId).toBe(unit.id); // derived from the contract, not from the client

    await expect(putOnHold(w.db, w.ctx.maintenance, req.id, "waiting for part")).rejects.toMatchObject({ code: "invalid_transition" }); // must start first
    await startWork(w.db, w.ctx.maintenance, req.id);
    await expect(putOnHold(w.db, w.ctx.maintenance, req.id, "x")).rejects.toMatchObject({ code: "note_required" });
    await putOnHold(w.db, w.ctx.maintenance, req.id, "Waiting for a replacement fan, back on Thursday");
    let detail = await portal.tenantRequestDetail(w.db, { orgId: w.orgId, tenantId: tenant.id }, req.id);
    expect(detail.tenantStatus).toBe("waiting");
    expect(detail.timeline.some((e) => e.note?.includes("replacement fan"))).toBe(true);
    await startWork(w.db, w.ctx.maintenance, req.id);
    await completeRequest(w.db, w.ctx.maintenance, req.id, { categoryId: cat.id, workPerformed: "Replaced the fan; tenant arranged and paid for the new unit" });

    detail = await portal.tenantRequestDetail(w.db, { orgId: w.orgId, tenantId: tenant.id }, req.id);
    expect(detail.tenantStatus).toBe("completed");
    const [row] = await w.db.select().from(s.maintenanceRequests).where(eq(s.maintenanceRequests.id, req.id));
    expect(row.costBaisa).toBeNull();
    const after = await buildStatementData(w.db, w.orgId, owner.id, today, today);
    expect(after.maintenanceLines.find((l) => l.reference === req.reference)).toBeUndefined();
    expect(after.totals.maintenanceBaisa).toBe(before.totals.maintenanceBaisa);
    expect(JSON.stringify(detail)).not.toMatch(/cost|technicianNotes|internal/i);
  });

  it("a cost entered by the office reaches the owner statement and the manager figures without a second entry", async () => {
    const unit = await w.unit("A-104");
    const [owner] = await w.db.select().from(s.owners).where(eq(s.owners.id, unit.ownerId));
    const [cat] = await w.db.select().from(s.maintenanceCategories).where(and(eq(s.maintenanceCategories.orgId, w.orgId), eq(s.maintenanceCategories.key, "ac")));
    const before = await buildStatementData(w.db, w.orgId, owner.id, today, today);
    const req = await submitRequest(w.db, w.ctx.manager, { unitId: unit.id, title: "AC leaking water", description: "Water drips from the indoor unit.", priority: "urgent" });
    await startWork(w.db, w.ctx.maintenance, req.id);
    await completeRequest(w.db, w.ctx.maintenance, req.id, { categoryId: cat.id, workPerformed: "Cleared the drain and recharged", costBaisa: 45_500 });
    const after = await buildStatementData(w.db, w.orgId, owner.id, today, today);
    expect(after.totals.maintenanceBaisa - before.totals.maintenanceBaisa).toBe(45_500);
    expect(after.totals.netToOwnerBaisa).toBe(before.totals.netToOwnerBaisa - 45_500);
    const st = await generateStatement(w.db, w.ctx.manager, { ownerId: owner.id, from: today, to: today, locale: "en" });
    expect(st.netBaisa).toBe(after.totals.netToOwnerBaisa);
    await expect(generateStatement(w.db, w.ctx.maintenance, { ownerId: owner.id, from: today, to: today, locale: "en" })).rejects.toMatchObject({ code: "forbidden" });
  });

  it("the team can add a missing cost later; only a manager can change it, with a reason", async () => {
    const unit = await w.unit("A-102");
    const [cat] = await w.db.select().from(s.maintenanceCategories).where(and(eq(s.maintenanceCategories.orgId, w.orgId), eq(s.maintenanceCategories.key, "plumbing")));
    const req = await submitRequest(w.db, w.ctx.manager, { unitId: unit.id, title: "Shower head replaced", description: "Replace the shower head.", priority: "normal" });
    await startWork(w.db, w.ctx.manager, req.id);
    await completeRequest(w.db, w.ctx.manager, req.id, { categoryId: cat.id, workPerformed: "Replaced the shower head" });
    await setCost(w.db, w.ctx.maintenance, req.id, 9_000);
    await expect(setCost(w.db, w.ctx.maintenance, req.id, 12_000, "typo")).rejects.toMatchObject({ code: "forbidden" });
    await expect(setCost(w.db, w.ctx.manager, req.id, 12_000)).rejects.toMatchObject({ code: "reason_required" });
    await setCost(w.db, w.ctx.manager, req.id, 12_000, "Supplier invoice was higher");
    const [row] = await w.db.select().from(s.maintenanceRequests).where(eq(s.maintenanceRequests.id, req.id));
    expect(row.costBaisa).toBe(12_000);
    const audit = await w.db.select().from(s.auditLog).where(and(eq(s.auditLog.action, "maintenance.cost_changed"), eq(s.auditLog.entityId, req.id)));
    expect(audit.length).toBe(2);
  });

  it("any maintenance team member can work any request, but not a role without the permission", async () => {
    const unit = await w.unit("Q-201");
    const req = await submitRequest(w.db, w.ctx.manager, { unitId: unit.id, title: "Squeaky wardrobe door", description: "The door squeaks and rubs.", priority: "normal" });
    await expect(startWork(w.db, w.ctx.accounts, req.id)).rejects.toMatchObject({ code: "forbidden" });
    await expect(startWork(w.db, w.ctx.contracts, req.id)).rejects.toMatchObject({ code: "forbidden" });
    const started = await startWork(w.db, w.ctx.maintenance, req.id);
    expect(started.status).toBe("in_progress");
    expect(started.assignedToUserId).toBe(w.ctx.maintenance.actor.id);
  });
});

describe("move-out, inspection and approval (CR-14.5)", () => {
  it("the unit only becomes available after maintenance inspects and the manager approves", async () => {
    const unit = await w.unit("A-105"); // notice given in the seed
    expect(unit.status).toBe("notice_given");
    const [contract] = await w.db.select().from(s.contracts).where(and(eq(s.contracts.unitId, unit.id), eq(s.contracts.status, "active")));
    const { inspection } = await completeMoveOut(w.db, w.ctx.contracts, contract.id);
    let [u] = await w.db.select().from(s.units).where(eq(s.units.id, unit.id));
    expect(u.status).toBe("under_inspection");

    await expect(transitionUnit(w.db, w.ctx.manager, unit.id, "available")).rejects.toMatchObject({ code: "invalid_transition" });
    await expect(transitionUnit(w.db, w.ctx.manager, unit.id, "inspected")).rejects.toMatchObject({ code: "transition_role" });
    await expect(decideInspection(w.db, w.ctx.manager, inspection.id, "approve")).rejects.toMatchObject({ code: "inspection_not_ready" });
    await expect(performInspection(w.db, w.ctx.contracts, inspection.id, { condition: "good", findings: "All fine" })).rejects.toMatchObject({ code: "forbidden" });

    await performInspection(w.db, w.ctx.maintenance, inspection.id, { condition: "good", findings: "Clean, no damage, keys returned" });
    [u] = await w.db.select().from(s.units).where(eq(s.units.id, unit.id));
    expect(u.status).toBe("inspected");
    await expect(decideInspection(w.db, w.ctx.maintenance, inspection.id, "approve")).rejects.toMatchObject({ code: "forbidden" });

    await decideInspection(w.db, w.ctx.manager, inspection.id, "approve");
    [u] = await w.db.select().from(s.units).where(eq(s.units.id, unit.id));
    expect(u.status).toBe("available");
    const [tenantRow] = await w.db.select().from(s.tenants).where(eq(s.tenants.id, contract.tenantId));
    expect(tenantRow.status).toBe("former");
  });

  it("unit under inspection is visible to the manager dashboard", async () => {
    const d = await dash.manager(w.db, w.orgId);
    expect(d.underInspection.length).toBeGreaterThan(0);
  });
});

describe("utility account numbers on the contract", () => {
  it("are saved by the office and visible to that tenant only", async () => {
    const hamad = await w.tenantCtx("12345678");
    const other = await w.tenantCtx("11527772");
    const [c] = await w.db.select().from(s.contracts).where(and(eq(s.contracts.tenantId, hamad.actor.id!), eq(s.contracts.status, "active")));
    await updateContractDocs(w.db, w.ctx.contracts, c.id, { electricityAccount: "ELEC-2345-678", waterAccount: "W 99/1204" });
    const mine = await portal.tenantContract(w.db, { orgId: w.orgId, tenantId: hamad.actor.id! });
    expect(mine.current?.electricityAccount).toBe("ELEC-2345-678");
    expect(mine.current?.waterAccount).toBe("W 99/1204");
    const theirs = await portal.tenantContract(w.db, { orgId: w.orgId, tenantId: other.actor.id! });
    expect(JSON.stringify(theirs)).not.toContain("ELEC-2345-678");
    await expect(updateContractDocs(w.db, w.ctx.contracts, c.id, { electricityAccount: "bad<script>" })).rejects.toMatchObject({ code: "invalid_account" });
    await expect(updateContractDocs(w.db, w.ctx.maintenance, c.id, { waterAccount: "123" })).rejects.toMatchObject({ code: "forbidden" });
    await updateContractDocs(w.db, w.ctx.contracts, c.id, { waterAccount: "" });
    const cleared = await portal.tenantContract(w.db, { orgId: w.orgId, tenantId: hamad.actor.id! });
    expect(cleared.current?.waterAccount).toBeNull();
  });
});

describe("contracts, renewal and duplicates", () => {
  it("the same tenant cannot be created twice under two phone formats (CR-12.4)", async () => {
    await expect(
      createTenant(w.db, w.ctx.contracts, { nameEn: "Hamad Again", phone: "+968 91500000", idNumber: "99990001", locale: "en", consent: true }),
    ).rejects.toMatchObject({ code: "duplicate_tenant_phone" });
    await expect(
      createTenant(w.db, w.ctx.contracts, { nameEn: "Hamad Again", phone: "00968 9150 0000", idNumber: "99990002", locale: "en", consent: true }),
    ).rejects.toMatchObject({ code: "duplicate_tenant_phone" });
    await expect(
      createTenant(w.db, w.ctx.contracts, { nameEn: "Other", phone: "9977 1122", idNumber: "12345678", locale: "en", consent: true }),
    ).rejects.toMatchObject({ code: "duplicate_tenant_id" });
  });

  it("renewal above the cap needs a reason and writes the override to the audit trail", async () => {
    const unit = await w.unit("A-103");
    const [prev] = await w.db.select().from(s.contracts).where(and(eq(s.contracts.unitId, unit.id), eq(s.contracts.status, "active")));
    const start = new Date(prev.endDate);
    start.setUTCDate(start.getUTCDate() + 1);
    const startDate = start.toISOString().slice(0, 10);
    const input = {
      unitId: unit.id,
      tenantId: prev.tenantId,
      startDate,
      endDate: addMonths(startDate, 12),
      monthlyRentBaisa: Math.round(prev.monthlyRentBaisa * 1.2),
      paymentFrequency: "monthly" as const,
      cheques: [],
      previousContractId: prev.id,
    };
    await expect(createContract(w.db, w.ctx.contracts, input)).rejects.toMatchObject({ code: "cap_override_required" });
    const created = await createContract(w.db, w.ctx.manager, input, { capOverrideReason: "Unit fully refurbished" });
    expect(created.status).toBe("pending");
    const [audit] = await w.db.select().from(s.auditLog).where(and(eq(s.auditLog.action, "contract.renewal_cap_overridden"), eq(s.auditLog.entityId, created.id)));
    expect(audit.meta).toMatchObject({ capLevel: "organisation", exceedsCap: true, reason: "Unit fully refurbished" });
    const [oldRow] = await w.db.select().from(s.contracts).where(eq(s.contracts.id, prev.id));
    expect(oldRow.renewedToId).toBe(created.id);
  });

  it("move-out gives back future cheques and closes the schedule", async () => {
    const unit = await w.unit("P-301");
    const [c] = await w.db.select().from(s.contracts).where(and(eq(s.contracts.unitId, unit.id), eq(s.contracts.status, "active")));
    await giveNotice(w.db, w.ctx.contracts, c.id, { noticeGivenOn: today, moveOutDate: today });
    await expect(giveNotice(w.db, w.ctx.contracts, c.id, { noticeGivenOn: today, moveOutDate: today })).rejects.toMatchObject({ code: "notice_already_given" });
    await completeMoveOut(w.db, w.ctx.contracts, c.id);
    const returned = await w.db.select().from(s.cheques).where(and(eq(s.cheques.contractId, c.id), eq(s.cheques.status, "returned")));
    expect(returned.length).toBeGreaterThan(0);
    const open = await w.db.select().from(s.scheduleItems).where(and(eq(s.scheduleItems.contractId, c.id), eq(s.scheduleItems.status, "open")));
    for (const item of open) expect(item.dueDate <= today).toBe(true);
  });

  it("cheque set size must match the generated schedule", async () => {
    const unit = await w.unit("V-05");
    const [t] = await w.db.select().from(s.tenants).where(and(eq(s.tenants.orgId, w.orgId), eq(s.tenants.status, "former"))).orderBy(desc(s.tenants.createdAt)).limit(1);
    await w.db.update(s.tenants).set({ status: "active" }).where(eq(s.tenants.id, t.id));
    await expect(
      createContract(w.db, w.ctx.contracts, {
        unitId: unit.id,
        tenantId: t.id,
        startDate: addMonths(today, 1),
        endDate: addMonths(today, 13),
        monthlyRentBaisa: 780_000,
        paymentFrequency: "quarterly",
        cheques: [{ seq: 1, chequeNumber: "000001", bank: "Bank Muscat", chequeDate: addMonths(today, 1), amountBaisa: 2_340_000 }],
      }),
    ).rejects.toMatchObject({ code: "cheque_count_mismatch" });
  });
});

describe("messaging (CR-9.4)", () => {
  it("the same message is never sent twice", async () => {
    const [t] = await w.db.select().from(s.tenants).where(and(eq(s.tenants.orgId, w.orgId), eq(s.tenants.idNumber, "12345678")));
    const msg = { orgId: w.orgId, tenantId: t.id, template: "rent_reminder", vars: { org: "Al Sahil", amount: "OMR 280.000", unit: "A-101", date: "01 Jan 2027" }, idempotencyKey: "test:dedupe:1" };
    const first = await notifyTenant(w.db, msg);
    const second = await notifyTenant(w.db, msg);
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.id).toBe(first.id);
    const rows = await w.db.select().from(s.notifications).where(eq(s.notifications.idempotencyKey, "test:dedupe:1"));
    expect(rows).toHaveLength(1);
  });

  it("with WhatsApp switched off every tenant message still arrives by SMS", async () => {
    const [org] = await w.db.select().from(s.organisations).where(eq(s.organisations.id, w.orgId));
    await w.db.update(s.organisations).set({ notificationPrefs: { ...org.notificationPrefs, channels: { whatsapp: false, sms: true, email: true } } }).where(eq(s.organisations.id, w.orgId));
    const [t] = await w.db.select().from(s.tenants).where(and(eq(s.tenants.orgId, w.orgId), eq(s.tenants.idNumber, "12345678")));
    const res = await notifyTenant(w.db, { orgId: w.orgId, tenantId: t.id, template: "payment_link", vars: { org: "Al Sahil", amount: "OMR 1.000", date: "x", link: "/portal" }, idempotencyKey: "test:fallback:1" });
    expect(res.channel).toBe("sms");
    const [row] = await w.db.select().from(s.notifications).where(eq(s.notifications.id, res.id));
    expect(row.attempts[0]).toMatchObject({ channel: "whatsapp", status: "skipped", reason: "channel_disabled" });
    expect(row.status).toBe("delivered");
  });

  it("falls back to the next channel when a provider fails hard", async () => {
    const [org] = await w.db.select().from(s.organisations).where(eq(s.organisations.id, w.orgId));
    await w.db.update(s.organisations).set({ notificationPrefs: { ...org.notificationPrefs, channels: { whatsapp: true, sms: true, email: true } } }).where(eq(s.organisations.id, w.orgId));
    setProviderForTests("whatsapp", { channel: "whatsapp", send: async () => ({ ok: false, reason: "template_not_approved" }) });
    try {
      const [t] = await w.db.select().from(s.tenants).where(and(eq(s.tenants.orgId, w.orgId), eq(s.tenants.idNumber, "12345678")));
      const res = await notifyTenant(w.db, { orgId: w.orgId, tenantId: t.id, template: "payment_link", vars: { org: "Al Sahil", amount: "OMR 1.000", date: "x", link: "/portal" }, idempotencyKey: "test:fallback:2" });
      expect(res.channel).toBe("sms");
      const [row] = await w.db.select().from(s.notifications).where(eq(s.notifications.id, res.id));
      expect(row.attempts.map((a) => `${a.channel}:${a.status}`)).toEqual(["whatsapp:failed", "sms:sent"]);
    } finally {
      setProviderForTests("whatsapp", null);
    }
  });
});

describe("DomainError", () => {
  it("carries a code for translated messages", () => {
    const e = new DomainError("x", { a: 1 }, "field");
    expect(e.code).toBe("x");
    expect(e.field).toBe("field");
  });
});
