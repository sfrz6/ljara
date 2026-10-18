import { beforeAll, describe, expect, it } from "vitest";
import { and, eq, getTableColumns } from "drizzle-orm";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import * as s from "@/db/schema";
import { collectCheque, depositCheque } from "@/domain/cheques";
import { createContract } from "@/domain/contracts";
import { createPaymentIntent } from "@/domain/payments";
import { archiveOwner, createBuilding, createOwner, createUnit, transitionUnit, updateOwner } from "@/domain/portfolio";
import { createTenant, updateTenant } from "@/domain/tenants";
import { addPhotos, assignRequest, submitRequest } from "@/domain/maintenance";
import { buildStatementData, generateStatement } from "@/domain/statements";
import { voidReceipt } from "@/domain/payments";
import { commitImport, validateImport } from "@/domain/imports";
import * as dash from "@/domain/dashboard";
import * as portal from "@/domain/portal";
import { PERMISSIONS, can, type Permission, type Role } from "@/domain/permissions";
import { addMonths, todayISO } from "@/lib/dates";
import { buildWorld, type World } from "./fixtures";

let w: World;
const today = todayISO();

beforeAll(async () => {
  w = await buildWorld();
});

describe("schema level organisation scoping (M-01)", () => {
  it("every business table carries an organisation reference", () => {
    const exempt = new Set(["organisations", "users", "sessions", "otps", "rate_limits", "file_blobs", "files", "audit_log", "sequences"]);
    const missing: string[] = [];
    for (const value of Object.values(s)) {
      if (typeof value !== "object" || value === null || !("getSQL" in value === false)) continue;
      try {
        const cfg = getTableConfig(value as unknown as PgTable);
        if (!cfg.name || exempt.has(cfg.name)) continue;
        if (!(cfg.columns.some((c) => c.name === "org_id") || cfg.name === "receipt_counters")) missing.push(cfg.name);
      } catch {
        /* not a table */
      }
    }
    expect(missing).toEqual([]);
    void getTableColumns;
  });
});

describe("organisation isolation (CR-3.2, CR-14.10)", () => {
  it("another office cannot read or change this office's records through any service", async () => {
    const [owner] = await w.db.select().from(s.owners).where(eq(s.owners.orgId, w.orgId)).limit(1);
    const [building] = await w.db.select().from(s.buildings).where(eq(s.buildings.orgId, w.orgId)).limit(1);
    const unit = await w.unit("A-101");
    const [tenant] = await w.db.select().from(s.tenants).where(eq(s.tenants.orgId, w.orgId)).limit(1);
    const [cheque] = await w.db.select().from(s.cheques).where(and(eq(s.cheques.orgId, w.orgId), eq(s.cheques.status, "due"))).limit(1);
    const [receipt] = await w.db.select().from(s.receipts).where(eq(s.receipts.orgId, w.orgId)).limit(1);
    const [request] = await w.db.select().from(s.maintenanceRequests).where(eq(s.maintenanceRequests.orgId, w.orgId)).limit(1);
    const [techB] = await w.db.select().from(s.users).where(eq(s.users.orgId, w.orgBId)).limit(1);

    const attempts: [string, () => Promise<unknown>][] = [
      ["updateOwner", () => updateOwner(w.db, w.ctxB, owner.id, { nameEn: "Hijacked" })],
      ["archiveOwner", () => archiveOwner(w.db, w.ctxB, owner.id)],
      ["createBuilding", () => createBuilding(w.db, w.ctxB, { ownerId: owner.id, nameEn: "Injected" })],
      ["createUnit", () => createUnit(w.db, w.ctxB, { buildingId: building.id, label: "X-1", type: "apartment", rentBaisa: 1000 })],
      ["transitionUnit", () => transitionUnit(w.db, w.ctxB, unit.id, "reserved")],
      ["updateTenant", () => updateTenant(w.db, w.ctxB, tenant.id, { nameEn: "Hijacked" })],
      ["createContract", () => createContract(w.db, w.ctxB, { unitId: unit.id, tenantId: tenant.id, startDate: today, endDate: addMonths(today, 12), monthlyRentBaisa: 1000, paymentFrequency: "monthly", cheques: [] })],
      ["depositCheque", () => depositCheque(w.db, w.ctxB, cheque.id)],
      ["collectCheque", () => collectCheque(w.db, w.ctxB, cheque.id)],
      ["voidReceipt", () => voidReceipt(w.db, w.ctxB, receipt.id, "attack")],
      ["buildStatement", () => buildStatementData(w.db, w.orgBId, owner.id, addMonths(today, -12), today)],
      ["generateStatement", () => generateStatement(w.db, w.ctxB, { ownerId: owner.id, from: addMonths(today, -12), to: today, locale: "en" })],
      ["assignRequest", () => assignRequest(w.db, w.ctxB, request.id, techB.id)],
      ["submitRequest", () => submitRequest(w.db, w.ctxB, { unitId: unit.id, title: "Intrusion", description: "Cross organisation attempt", priority: "normal" })],
    ];
    for (const [name, fn] of attempts) {
      await expect(fn(), name).rejects.toMatchObject({ code: expect.stringMatching(/^(not_found|forbidden)$/) });
    }
    const [after] = await w.db.select().from(s.owners).where(eq(s.owners.id, owner.id));
    expect(after.nameEn).toBe(owner.nameEn);
  });

  it("dashboards of another office show none of this office's numbers", async () => {
    const mine = await dash.manager(w.db, w.orgId);
    const theirs = await dash.manager(w.db, w.orgBId);
    expect(mine.collectedBaisa).toBeGreaterThan(0);
    expect(theirs.collectedBaisa).toBe(0);
    expect(theirs.bounced).toHaveLength(0);
    expect(theirs.totalUnits).toBe(3);
    expect((await dash.accounts(w.db, w.orgBId)).due).toHaveLength(0);
  });

  it("an import cannot reference rows of another office", async () => {
    const [ownerA] = await w.db.select().from(s.owners).where(eq(s.owners.orgId, w.orgId)).limit(1);
    const res = await validateImport(w.db, w.ctxB, {
      entity: "buildings",
      mapping: { owner_name: "owner", name_en: "name" },
      rows: [{ owner: ownerA.nameEn, name: "Stolen Tower" }],
    });
    expect(res.issues.some((i) => i.code === "owner_not_found")).toBe(true);
    await expect(
      commitImport(w.db, w.ctxB, { entity: "buildings", mapping: { owner_name: "owner", name_en: "name" }, rows: [{ owner: ownerA.nameEn, name: "Stolen Tower" }], fileName: "x.csv", skipDuplicates: false }),
    ).rejects.toMatchObject({ code: "import_has_errors" });
  });

  it("receipt numbering is independent per office and per owner", async () => {
    const ownerB = await createOwner(w.db, w.ctxB, { nameEn: "Another Owner", commissionBp: 0, payoutFrequency: "monthly", receiptPrefix: "SH" });
    expect(ownerB.receiptPrefix).toBe("SH"); // the same prefix is fine in a different organisation
    const [counter] = await w.db.select().from(s.receiptCounters).where(eq(s.receiptCounters.ownerId, ownerB.id));
    expect(counter.lastNumber).toBe(0);
  });
});

describe("tenant isolation (CR-5.4, CR-14.9)", () => {
  it("a tenant can only see their own contract, schedule, receipts and requests", async () => {
    const hamad = await w.tenantCtx("12345678");
    const salimCtx = await w.tenantCtx("10200417");
    const scopeH = { orgId: hamad.orgId, tenantId: hamad.actor.id! };
    const scopeS = { orgId: salimCtx.orgId, tenantId: salimCtx.actor.id! };

    const cH = await portal.tenantContract(w.db, scopeH);
    const cS = await portal.tenantContract(w.db, scopeS);
    expect(cH.current?.unitLabel).toBe("A-101");
    expect(cS.current?.unitLabel).not.toBe("A-101");

    const schedH = await portal.tenantSchedule(w.db, scopeH);
    const schedS = await portal.tenantSchedule(w.db, scopeS);
    const idsH = new Set(schedH.items.map((i) => i.id));
    expect(schedS.items.some((i) => idsH.has(i.id))).toBe(false);

    const rH = await portal.tenantReceipts(w.db, scopeH);
    const rS = await portal.tenantReceipts(w.db, scopeS);
    expect(rH.some((r) => rS.some((x) => x.id === r.id))).toBe(false);
  });

  it("reading another tenant's request by id is refused", async () => {
    const hamad = await w.tenantCtx("12345678");
    const other = await w.tenantCtx("11527772");
    const [req] = await w.db.select().from(s.maintenanceRequests).where(eq(s.maintenanceRequests.tenantId, hamad.actor.id!)).limit(1);
    expect(req).toBeDefined();
    await expect(portal.tenantRequestDetail(w.db, { orgId: other.orgId, tenantId: other.actor.id! }, req.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(addPhotos(w.db, other, req.id, [])).rejects.toMatchObject({ code: "not_found" });
  });

  it("a tenant cannot start a payment for someone else's schedule item", async () => {
    const hamad = await w.tenantCtx("12345678");
    const other = await w.tenantCtx("11527772");
    const [item] = await w.db.select().from(s.scheduleItems).where(eq(s.scheduleItems.tenantId, hamad.actor.id!)).limit(1);
    await expect(createPaymentIntent(w.db, { orgId: other.orgId, tenantId: other.actor.id! }, item.id)).rejects.toMatchObject({ code: "not_found" });
  });

  it("the request detail exposes neither costs nor internal notes", async () => {
    const [done] = await w.db.select().from(s.maintenanceRequests).where(and(eq(s.maintenanceRequests.status, "completed"), eq(s.maintenanceRequests.orgId, w.orgId))).limit(1);
    const [t] = await w.db.select().from(s.tenants).where(eq(s.tenants.id, done.tenantId!));
    const detail = await portal.tenantRequestDetail(w.db, { orgId: w.orgId, tenantId: t.id }, done.id);
    expect(JSON.stringify(detail)).not.toMatch(/cost|technician|internal|assigned_to|ownerId/i);
    expect(detail.tenantStatus).toBe("completed");
    expect(detail.timeline.map((e) => e.status)).toEqual(["received", "in_progress", "completed"]);
  });

  it("security cheques are never part of what a tenant is shown (14.2)", async () => {
    const hamad = await w.tenantCtx("12345678");
    const sched = await portal.tenantSchedule(w.db, { orgId: hamad.orgId, tenantId: hamad.actor.id! });
    const [contract] = await w.db.select().from(s.contracts).where(eq(s.contracts.tenantId, hamad.actor.id!));
    const [dep] = await w.db.select().from(s.securityDeposits).where(eq(s.securityDeposits.contractId, contract.id));
    expect(dep).toBeDefined();
    const items = await w.db.select().from(s.scheduleItems).where(eq(s.scheduleItems.contractId, contract.id));
    expect(sched.items).toHaveLength(items.length);
    for (const row of sched.items) expect(["upcoming", "due", "paid", "action_needed"]).toContain(row.status);
  });
});

describe("role authorization (CR-2, CR-14.8)", () => {
  const sample: Record<string, Permission[]> = {
    maintenance: ["cheques:view", "cheques:process", "payments:view", "payments:record", "receipts:view", "receipts:void", "statements:view", "statements:generate", "owners:manage", "users:manage", "settings:manage", "tenants:manage", "contracts:manage", "audit:view", "maintenance:costs"],
    accounts: ["users:manage", "settings:manage", "owners:manage", "tenants:manage", "contracts:manage", "maintenance:view", "maintenance:work", "statements:generate", "receipts:void", "imports:manage", "audit:view"],
    contracts: ["cheques:process", "payments:record", "receipts:view", "statements:generate", "users:manage", "maintenance:view", "owners:manage", "audit:view", "settings:manage"],
  };

  for (const [role, denied] of Object.entries(sample)) {
    it(`${role} cannot ${denied.length} restricted operations`, () => {
      for (const p of denied) expect(can(role as Role, p), `${role} should not have ${p}`).toBe(false);
    });
  }

  it("the platform administrator holds no operational permission at all", () => {
    expect([...PERMISSIONS.platform_admin]).toEqual(["platform:manage"]);
  });

  it("services refuse the wrong role even when called directly", async () => {
    const [owner] = await w.db.select().from(s.owners).where(eq(s.owners.orgId, w.orgId)).limit(1);
    await expect(createOwner(w.db, w.ctx.accounts, { nameEn: "Nope", commissionBp: 0, payoutFrequency: "monthly", receiptPrefix: "NP" })).rejects.toMatchObject({ code: "forbidden" });
    await expect(createTenant(w.db, w.ctx.maintenance, { nameEn: "Nope", phone: "9977 0000", idNumber: "55555555", locale: "en", consent: true })).rejects.toMatchObject({ code: "forbidden" });
    await expect(generateStatement(w.db, w.ctx.contracts, { ownerId: owner.id, from: today, to: today, locale: "en" })).rejects.toMatchObject({ code: "forbidden" });
    await expect(depositCheque(w.db, w.ctx.maintenance, "00000000-0000-0000-0000-000000000000")).rejects.toMatchObject({ code: "forbidden" });
    await expect(depositCheque(w.db, w.ctx.contracts, "00000000-0000-0000-0000-000000000000")).rejects.toMatchObject({ code: "forbidden" });
  });
});
