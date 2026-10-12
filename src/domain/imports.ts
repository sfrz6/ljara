import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import {
  buildings,
  cheques,
  contracts,
  imports,
  owners,
  receiptCounters,
  scheduleItems,
  securityDeposits,
  tenants,
  units,
} from "@/db/schema";
import { isValidISO } from "@/lib/dates";
import { parseOMR, parsePercentToBp } from "@/lib/money";
import { normalisePhone } from "@/lib/phone";
import { writeAudit } from "./audit";
import type { Ctx } from "./context";
import { DomainError, NotFoundError } from "./errors";
import { addChequeToItem } from "./cheques";
import { createContract } from "./contracts";
import { assertCan, type Role } from "./permissions";
import { createBuilding, createOwner, createUnit } from "./portfolio";
import { createTenant, findDuplicateTenant } from "./tenants";

import type { ImportEntity } from "./imports-fields";
export type { ImportEntity } from "./imports-fields";
export const IMPORT_ORDER: ImportEntity[] = ["owners", "buildings", "units", "tenants", "contracts", "cheques"];

export { ENTITY_FIELDS, templateCsv, suggestMapping, type FieldDef } from "./imports-fields";
import { ENTITY_FIELDS } from "./imports-fields";

/* ------------------------------ Parsing helpers ------------------------------ */

function cell(row: Record<string, string>, mapping: Record<string, string>, key: string): string {
  const header = mapping[key];
  return header ? (row[header] ?? "").trim() : "";
}

/** Accepts 2026-03-15, 15/03/2026 and 15-03-2026. */
export function parseFlexibleDate(input: string): string | null {
  const s = input.trim();
  if (isValidISO(s)) return s;
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (m) {
    const iso = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    return isValidISO(iso) ? iso : null;
  }
  return null;
}

const FREQ: Record<string, "monthly" | "quarterly" | "semi_annual" | "annual"> = {
  monthly: "monthly",
  month: "monthly",
  شهري: "monthly",
  quarterly: "quarterly",
  quarter: "quarterly",
  "3": "quarterly",
  "ربع سنوي": "quarterly",
  semi_annual: "semi_annual",
  semiannual: "semi_annual",
  "semi-annual": "semi_annual",
  "6": "semi_annual",
  annual: "annual",
  yearly: "annual",
  "12": "annual",
  سنوي: "annual",
};
const UNIT_TYPES = ["apartment", "villa", "studio", "shop", "office", "warehouse"] as const;

export interface RowIssue {
  row: number; // 1-based data row number
  field?: string;
  code: string;
  params?: Record<string, string | number>;
}

export interface ValidationResult {
  entity: ImportEntity;
  total: number;
  valid: number;
  duplicates: number[];
  issues: RowIssue[];
  preview: Record<string, string>[];
}

interface Prepared {
  run: (ctx: Ctx, tx: DB, created: { table: string; id: string }[]) => Promise<void>;
}

/** Parse and validate one row. Returns either issues or an executable plan. */
async function prepareRow(
  q: DB,
  orgId: string,
  entity: ImportEntity,
  row: Record<string, string>,
  mapping: Record<string, string>,
  n: number,
  seen: Map<string, number>,
): Promise<{ issues: RowIssue[]; duplicate: boolean; plan?: Prepared; preview: Record<string, string> }> {
  const issues: RowIssue[] = [];
  const need = (key: string) => {
    const v = cell(row, mapping, key);
    if (!v) issues.push({ row: n, field: key, code: "required" });
    return v;
  };
  const preview: Record<string, string> = {};
  for (const f of ENTITY_FIELDS[entity]) preview[f.key] = cell(row, mapping, f.key);
  const dupInFile = (key: string): boolean => {
    const prev = seen.get(key);
    if (prev) {
      issues.push({ row: n, code: "duplicate_in_file", params: { other: prev } });
      return true;
    }
    seen.set(key, n);
    return false;
  };

  switch (entity) {
    case "owners": {
      const nameEn = need("name_en");
      const pct = parsePercentToBp(need("commission_percent"));
      if (cell(row, mapping, "commission_percent") && pct === null) issues.push({ row: n, field: "commission_percent", code: "invalid_percent" });
      const prefix = need("receipt_prefix").toUpperCase();
      if (prefix && !/^[A-Z0-9]{1,8}$/.test(prefix)) issues.push({ row: n, field: "receipt_prefix", code: "invalid_prefix" });
      const freqRaw = cell(row, mapping, "payout_frequency").toLowerCase();
      const freq = freqRaw ? (FREQ[freqRaw] ?? (freqRaw === "other" ? "other" : null)) : "monthly";
      if (!freq) issues.push({ row: n, field: "payout_frequency", code: "invalid_choice" });
      const phoneRaw = cell(row, mapping, "phone");
      const phone = phoneRaw ? normalisePhone(phoneRaw) : null;
      if (phoneRaw && !phone) issues.push({ row: n, field: "phone", code: "invalid_phone" });
      let duplicate = false;
      if (nameEn) {
        const [exists] = await q.select({ id: owners.id }).from(owners).where(and(eq(owners.orgId, orgId), sql`lower(${owners.nameEn}) = ${nameEn.toLowerCase()}`));
        if (exists) duplicate = true;
        else if (prefix) {
          const [p] = await q.select({ id: owners.id }).from(owners).where(and(eq(owners.orgId, orgId), eq(owners.receiptPrefix, prefix)));
          if (p) issues.push({ row: n, field: "receipt_prefix", code: "receipt_prefix_taken" });
        }
        dupInFile(`o:${nameEn.toLowerCase()}`);
      }
      if (prefix) dupInFile(`p:${prefix}`);
      return {
        issues,
        duplicate,
        preview,
        plan: {
          run: async (ctx, tx, created) => {
            const o = await createOwner(tx, ctx, {
              nameEn,
              nameAr: cell(row, mapping, "name_ar") || null,
              phone,
              email: cell(row, mapping, "email") || null,
              commissionBp: pct ?? 0,
              payoutFrequency: (freq ?? "monthly") as never,
              receiptPrefix: prefix,
            });
            created.push({ table: "owners", id: o.id });
          },
        },
      };
    }
    case "buildings": {
      const ownerName = need("owner_name");
      const nameEn = need("name_en");
      let ownerId: string | null = null;
      if (ownerName) {
        const [o] = await q.select({ id: owners.id }).from(owners).where(and(eq(owners.orgId, orgId), sql`lower(${owners.nameEn}) = ${ownerName.toLowerCase()}`));
        if (!o) issues.push({ row: n, field: "owner_name", code: "owner_not_found", params: { name: ownerName } });
        else ownerId = o.id;
      }
      let duplicate = false;
      if (ownerId && nameEn) {
        const [b] = await q.select({ id: buildings.id }).from(buildings).where(and(eq(buildings.orgId, orgId), eq(buildings.ownerId, ownerId), sql`lower(${buildings.nameEn}) = ${nameEn.toLowerCase()}`));
        duplicate = !!b;
        dupInFile(`b:${ownerId}:${nameEn.toLowerCase()}`);
      }
      return {
        issues,
        duplicate,
        preview,
        plan: {
          run: async (ctx, tx, created) => {
            const b = await createBuilding(tx, ctx, {
              ownerId: ownerId!,
              nameEn,
              nameAr: cell(row, mapping, "name_ar") || null,
              area: cell(row, mapping, "area") || null,
              address: cell(row, mapping, "address") || null,
            });
            created.push({ table: "buildings", id: b.id });
          },
        },
      };
    }
    case "units": {
      const buildingName = need("building_name");
      const label = need("unit_label");
      const rent = parseOMR(need("monthly_rent_omr"));
      if (cell(row, mapping, "monthly_rent_omr") && (rent === null || rent < 0)) issues.push({ row: n, field: "monthly_rent_omr", code: "invalid_amount" });
      const typeRaw = (cell(row, mapping, "type") || "apartment").toLowerCase();
      if (!UNIT_TYPES.includes(typeRaw as never)) issues.push({ row: n, field: "type", code: "invalid_choice" });
      const bedsRaw = cell(row, mapping, "bedrooms");
      if (bedsRaw && !/^\d{1,2}$/.test(bedsRaw)) issues.push({ row: n, field: "bedrooms", code: "invalid_number" });
      let buildingId: string | null = null;
      if (buildingName) {
        const found = await q.select({ id: buildings.id }).from(buildings).where(and(eq(buildings.orgId, orgId), sql`lower(${buildings.nameEn}) = ${buildingName.toLowerCase()}`));
        if (found.length === 0) issues.push({ row: n, field: "building_name", code: "building_not_found", params: { name: buildingName } });
        else if (found.length > 1) issues.push({ row: n, field: "building_name", code: "building_ambiguous", params: { name: buildingName } });
        else buildingId = found[0].id;
      }
      let duplicate = false;
      if (buildingId && label) {
        const [u] = await q.select({ id: units.id }).from(units).where(and(eq(units.buildingId, buildingId), eq(units.label, label)));
        duplicate = !!u;
        dupInFile(`u:${buildingId}:${label.toLowerCase()}`);
      }
      return {
        issues,
        duplicate,
        preview,
        plan: {
          run: async (ctx, tx, created) => {
            const u = await createUnit(tx, ctx, {
              buildingId: buildingId!,
              label,
              type: typeRaw as never,
              bedrooms: bedsRaw ? Number(bedsRaw) : null,
              floor: cell(row, mapping, "floor") || null,
              rentBaisa: rent ?? 0,
            });
            created.push({ table: "units", id: u.id });
          },
        },
      };
    }
    case "tenants": {
      const nameEn = need("name_en");
      const phoneRaw = need("phone");
      const phone = phoneRaw ? normalisePhone(phoneRaw) : null;
      if (phoneRaw && !phone) issues.push({ row: n, field: "phone", code: "invalid_phone" });
      const idNumber = need("id_number");
      if (idNumber && !/^[A-Za-z0-9-]{5,20}$/.test(idNumber)) issues.push({ row: n, field: "id_number", code: "invalid_id_number" });
      const lang = cell(row, mapping, "language").toLowerCase();
      if (lang && lang !== "en" && lang !== "ar") issues.push({ row: n, field: "language", code: "invalid_choice" });
      let duplicate = false;
      if (phone && idNumber) {
        duplicate = !!(await findDuplicateTenant(q, orgId, phone, idNumber));
        dupInFile(`t:${idNumber}`);
        dupInFile(`tp:${phone}`);
      }
      return {
        issues,
        duplicate,
        preview: { ...preview, phone: phone ?? preview.phone },
        plan: {
          run: async (ctx, tx, created) => {
            const t = await createTenant(tx, ctx, {
              nameEn,
              nameAr: cell(row, mapping, "name_ar") || null,
              phone: phone!,
              email: cell(row, mapping, "email") || null,
              idNumber,
              locale: lang === "en" ? "en" : "ar",
              consent: true,
            });
            created.push({ table: "tenants", id: t.id });
          },
        },
      };
    }
    case "contracts": {
      const buildingName = need("building_name");
      const label = need("unit_label");
      const idNumber = need("tenant_id_number");
      const start = parseFlexibleDate(need("start_date"));
      const end = parseFlexibleDate(need("end_date"));
      if (cell(row, mapping, "start_date") && !start) issues.push({ row: n, field: "start_date", code: "invalid_date" });
      if (cell(row, mapping, "end_date") && !end) issues.push({ row: n, field: "end_date", code: "invalid_date" });
      if (start && end && end <= start) issues.push({ row: n, field: "end_date", code: "end_before_start" });
      const rent = parseOMR(need("monthly_rent_omr"));
      if (cell(row, mapping, "monthly_rent_omr") && (rent === null || rent <= 0)) issues.push({ row: n, field: "monthly_rent_omr", code: "invalid_amount" });
      const freqRaw = cell(row, mapping, "payment_frequency").toLowerCase();
      const freq = freqRaw ? FREQ[freqRaw] : "monthly";
      if (!freq) issues.push({ row: n, field: "payment_frequency", code: "invalid_choice" });
      const secRaw = cell(row, mapping, "security_deposit_omr");
      const sec = secRaw ? parseOMR(secRaw) : null;
      if (secRaw && (sec === null || sec <= 0)) issues.push({ row: n, field: "security_deposit_omr", code: "invalid_amount" });

      let unitId: string | null = null;
      if (buildingName && label) {
        const [u] = await q
          .select({ id: units.id, status: units.status })
          .from(units)
          .innerJoin(buildings, eq(buildings.id, units.buildingId))
          .where(and(eq(units.orgId, orgId), eq(units.label, label), sql`lower(${buildings.nameEn}) = ${buildingName.toLowerCase()}`));
        if (!u) issues.push({ row: n, field: "unit_label", code: "unit_not_found", params: { name: `${buildingName} ${label}` } });
        else if (u.status !== "available") issues.push({ row: n, field: "unit_label", code: "unit_not_available", params: { status: u.status } });
        else unitId = u.id;
        dupInFile(`cu:${buildingName.toLowerCase()}:${label.toLowerCase()}`);
      }
      let tenantId: string | null = null;
      if (idNumber) {
        const [t] = await q.select({ id: tenants.id }).from(tenants).where(and(eq(tenants.orgId, orgId), eq(tenants.idNumber, idNumber)));
        if (!t) issues.push({ row: n, field: "tenant_id_number", code: "tenant_not_found", params: { id: idNumber } });
        else {
          tenantId = t.id;
          const live = await q.select({ id: contracts.id }).from(contracts).where(and(eq(contracts.tenantId, t.id), inArray(contracts.status, ["pending", "active"])));
          if (live.length > 0) issues.push({ row: n, field: "tenant_id_number", code: "tenant_has_contract" });
        }
        dupInFile(`ct:${idNumber}`);
      }
      return {
        issues,
        duplicate: false,
        preview,
        plan: {
          run: async (ctx, tx, created) => {
            const c = await createContract(tx, ctx, {
              unitId: unitId!,
              tenantId: tenantId!,
              startDate: start!,
              endDate: end!,
              monthlyRentBaisa: rent!,
              paymentFrequency: freq!,
              cheques: [],
              security: sec ? { amountBaisa: sec } : null,
              notes: "Imported",
            });
            created.push({ table: "contracts", id: c.id });
          },
        },
      };
    }
    case "cheques": {
      const idNumber = need("tenant_id_number");
      const number = need("cheque_number");
      const bank = need("bank");
      const date = parseFlexibleDate(need("cheque_date"));
      if (cell(row, mapping, "cheque_date") && !date) issues.push({ row: n, field: "cheque_date", code: "invalid_date" });
      const amount = parseOMR(need("amount_omr"));
      if (cell(row, mapping, "amount_omr") && (amount === null || amount <= 0)) issues.push({ row: n, field: "amount_omr", code: "invalid_amount" });
      let itemId: string | null = null;
      let duplicate = false;
      if (number && bank) {
        const [c] = await q
          .select({ id: cheques.id })
          .from(cheques)
          .where(and(eq(cheques.orgId, orgId), eq(cheques.chequeNumber, number), eq(cheques.bank, bank), sql`${cheques.status} not in ('returned','written_off')`));
        duplicate = !!c;
        dupInFile(`c:${bank.toLowerCase()}:${number}`);
      }
      if (idNumber && date) {
        const [t] = await q.select({ id: tenants.id }).from(tenants).where(and(eq(tenants.orgId, orgId), eq(tenants.idNumber, idNumber)));
        if (!t) issues.push({ row: n, field: "tenant_id_number", code: "tenant_not_found", params: { id: idNumber } });
        else {
          const [item] = await q
            .select({ id: scheduleItems.id })
            .from(scheduleItems)
            .where(
              and(
                eq(scheduleItems.orgId, orgId),
                eq(scheduleItems.tenantId, t.id),
                eq(scheduleItems.status, "open"),
                eq(scheduleItems.dueDate, date),
                sql`not exists (select 1 from cheques c where c.schedule_item_id = ${scheduleItems.id} and c.status in ('received','due','deposited','collected','bounced','follow_up'))`,
              ),
            );
          if (!item) issues.push({ row: n, field: "cheque_date", code: "no_schedule_item", params: { date } });
          else itemId = item.id;
        }
      }
      return {
        issues,
        duplicate,
        preview,
        plan: {
          run: async (ctx, tx, created) => {
            const c = await addChequeToItem(tx, ctx, {
              scheduleItemId: itemId!,
              chequeNumber: number,
              bank,
              chequeDate: date!,
              amountBaisa: amount!,
            });
            created.push({ table: "cheques", id: c.id });
          },
        },
      };
    }
  }
}

export const MAX_IMPORT_ROWS = 2000;

/** Validate every row without writing anything (the preview step). */
export async function validateImport(
  q: DB,
  ctx: Ctx,
  input: { entity: ImportEntity; mapping: Record<string, string>; rows: Record<string, string>[] },
): Promise<ValidationResult> {
  assertCan(ctx.actor.role as Role, "imports:manage");
  if (input.rows.length === 0) throw new DomainError("import_empty");
  if (input.rows.length > MAX_IMPORT_ROWS) throw new DomainError("import_too_large", { max: MAX_IMPORT_ROWS });
  const missing = ENTITY_FIELDS[input.entity].filter((f) => f.required && !input.mapping[f.key]);
  if (missing.length > 0) throw new DomainError("mapping_incomplete", { fields: missing.map((m) => m.key).join(", ") });

  const issues: RowIssue[] = [];
  const duplicates: number[] = [];
  const seen = new Map<string, number>();
  let valid = 0;
  const preview: Record<string, string>[] = [];
  for (let i = 0; i < input.rows.length; i++) {
    const n = i + 1;
    const res = await prepareRow(q, ctx.orgId, input.entity, input.rows[i], input.mapping, n, seen);
    issues.push(...res.issues);
    if (res.duplicate) duplicates.push(n);
    else if (res.issues.length === 0) valid += 1;
    if (preview.length < 8) preview.push(res.preview);
  }
  return { entity: input.entity, total: input.rows.length, valid, duplicates, issues, preview };
}

/**
 * Atomic commit: either every valid row is created or nothing is (proposal M-06).
 * Rows with errors block the whole import; duplicates are skipped only when explicitly allowed.
 */
export async function commitImport(
  db: DB,
  ctx: Ctx,
  input: { entity: ImportEntity; mapping: Record<string, string>; rows: Record<string, string>[]; fileName: string; skipDuplicates: boolean },
) {
  assertCan(ctx.actor.role as Role, "imports:manage");
  const check = await validateImport(db, ctx, input);
  if (check.issues.length > 0) throw new DomainError("import_has_errors", { count: check.issues.length });
  if (check.duplicates.length > 0 && !input.skipDuplicates) throw new DomainError("import_has_duplicates", { count: check.duplicates.length });
  const skip = new Set(check.duplicates);

  return db.transaction(async (tx0) => {
    const tx = tx0 as unknown as DB;
    const created: { table: string; id: string }[] = [];
    const seen = new Map<string, number>();
    for (let i = 0; i < input.rows.length; i++) {
      if (skip.has(i + 1)) continue;
      const res = await prepareRow(tx, ctx.orgId, input.entity, input.rows[i], input.mapping, i + 1, seen);
      if (res.issues.length > 0 || !res.plan) throw new DomainError("import_has_errors", { count: res.issues.length });
      await res.plan.run(ctx, tx, created);
    }
    const [rec] = await tx
      .insert(imports)
      .values({
        orgId: ctx.orgId,
        entity: input.entity,
        fileName: input.fileName,
        totalRows: input.rows.length,
        createdCount: created.filter((c) => c.table === input.entity).length,
        mapping: input.mapping,
        created,
        createdBy: ctx.actor.id,
      })
      .returning();
    await writeAudit(tx, ctx, {
      action: "import.committed",
      entityType: "import",
      entityId: rec.id,
      after: { entity: input.entity, fileName: input.fileName, rows: input.rows.length, created: rec.createdCount, skipped: skip.size },
    });
    return rec;
  });
}

/** Roll back the most recent committed import, but only if nothing else depends on what it created. */
export async function rollbackImport(db: DB, ctx: Ctx, importId: string) {
  assertCan(ctx.actor.role as Role, "imports:manage");
  const [latest] = await db
    .select()
    .from(imports)
    .where(and(eq(imports.orgId, ctx.orgId), eq(imports.status, "committed")))
    .orderBy(desc(imports.createdAt))
    .limit(1);
  if (!latest) throw new NotFoundError("import");
  if (latest.id !== importId) throw new DomainError("import_not_latest");

  await db.transaction(async (tx0) => {
    const tx = tx0 as unknown as DB;
    const items = [...latest.created].reverse();
    try {
      for (const c of items) {
        switch (c.table) {
          case "cheques":
            await tx.delete(cheques).where(eq(cheques.id, c.id));
            break;
          case "contracts": {
            const [ct] = await tx.select().from(contracts).where(eq(contracts.id, c.id));
            await tx.delete(cheques).where(eq(cheques.contractId, c.id));
            await tx.delete(scheduleItems).where(eq(scheduleItems.contractId, c.id));
            await tx.delete(securityDeposits).where(eq(securityDeposits.contractId, c.id));
            await tx.delete(contracts).where(eq(contracts.id, c.id));
            if (ct) await tx.update(units).set({ status: "available", statusSince: new Date() }).where(eq(units.id, ct.unitId));
            break;
          }
          case "tenants":
            await tx.delete(tenants).where(eq(tenants.id, c.id));
            break;
          case "units":
            await tx.delete(units).where(eq(units.id, c.id));
            break;
          case "buildings":
            await tx.delete(buildings).where(eq(buildings.id, c.id));
            break;
          case "owners":
            await tx.delete(receiptCounters).where(eq(receiptCounters.ownerId, c.id));
            await tx.delete(owners).where(eq(owners.id, c.id));
            break;
        }
      }
    } catch (e) {
      if (e instanceof Error && /foreign key|violates/i.test(e.message)) throw new DomainError("import_has_dependents");
      throw e;
    }
    await tx.update(imports).set({ status: "rolled_back", rolledBackAt: new Date() }).where(eq(imports.id, latest.id));
    await writeAudit(tx, ctx, { action: "import.rolled_back", entityType: "import", entityId: latest.id, after: { entity: latest.entity } });
  });
}

export async function importHistory(q: DB, orgId: string) {
  return q.select().from(imports).where(eq(imports.orgId, orgId)).orderBy(desc(imports.createdAt)).limit(30);
}

