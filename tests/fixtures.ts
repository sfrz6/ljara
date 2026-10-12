import { and, eq } from "drizzle-orm";
import type { DB } from "@/db/client";
import * as s from "@/db/schema";
import { seedDemo } from "@/db/seed";
import type { Ctx } from "@/domain/context";
import type { Role } from "@/domain/permissions";
import { createTestDb } from "./helpers";

export interface World {
  db: DB;
  orgId: string;
  orgBId: string;
  ctx: Record<"manager" | "accounts" | "maintenance" | "contracts", Ctx>;
  ctxB: Ctx;
  unit: (label: string) => Promise<typeof s.units.$inferSelect>;
  tenantCtx: (idNumber: string) => Promise<Ctx>;
}

export async function buildWorld(): Promise<World> {
  const db = await createTestDb();
  await seedDemo(db);
  const orgs = await db.select().from(s.organisations);
  const a = orgs.find((o) => o.name.startsWith("Al Sahil"))!;
  const b = orgs.find((o) => o.name.startsWith("Muscat Gate"))!;
  const userCtx = async (email: string, role: Role): Promise<Ctx> => {
    const [u] = await db.select().from(s.users).where(eq(s.users.email, email));
    return { orgId: u.orgId!, actor: { kind: "user", id: u.id, name: u.name, role } };
  };
  return {
    db,
    orgId: a.id,
    orgBId: b.id,
    ctx: {
      manager: await userCtx("manager@alsahil.demo", "manager"),
      accounts: await userCtx("accounts@alsahil.demo", "accounts"),
      maintenance: await userCtx("maintenance@alsahil.demo", "maintenance"),
      contracts: await userCtx("contracts@alsahil.demo", "contracts"),
    },
    ctxB: await userCtx("manager@muscatgate.demo", "manager"),
    unit: async (label) => {
      const [u] = await db.select().from(s.units).where(and(eq(s.units.orgId, a.id), eq(s.units.label, label)));
      return u;
    },
    tenantCtx: async (idNumber) => {
      const [t] = await db.select().from(s.tenants).where(and(eq(s.tenants.orgId, a.id), eq(s.tenants.idNumber, idNumber)));
      return { orgId: a.id, actor: { kind: "tenant", id: t.id, name: t.nameEn, role: "tenant" } };
    },
  };
}
