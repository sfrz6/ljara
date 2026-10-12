import { beforeAll, describe, expect, it } from "vitest";
import { count, eq } from "drizzle-orm";
import type { DB } from "@/db/client";
import * as s from "@/db/schema";
import { seedDemo } from "@/db/seed";
import { createTestDb } from "./helpers";

let db: DB;

beforeAll(async () => {
  db = await createTestDb();
  await seedDemo(db);
});

describe("demo seed", () => {
  it("creates two isolated organisations and a platform admin", async () => {
    const [orgs] = await db.select({ n: count() }).from(s.organisations);
    expect(orgs.n).toBe(2);
    const platform = await db.select().from(s.users).where(eq(s.users.role, "platform_admin"));
    expect(platform).toHaveLength(1);
    expect(platform[0].orgId).toBeNull();
  });

  it("covers every scenario the founder needs to see", async () => {
    const statuses = await db.select({ status: s.cheques.status }).from(s.cheques);
    const set = new Set(statuses.map((r) => r.status));
    for (const st of ["received", "due", "collected", "bounced", "follow_up", "returned"]) expect(set.has(st as never)).toBe(true);

    const unitStatuses = new Set((await db.select({ st: s.units.status }).from(s.units)).map((r) => r.st));
    for (const st of ["available", "reserved", "occupied", "notice_given", "under_inspection", "inspected"]) {
      expect(unitStatuses.has(st as never)).toBe(true);
    }
    const maint = new Set((await db.select({ st: s.maintenanceRequests.status }).from(s.maintenanceRequests)).map((r) => r.st));
    for (const st of ["submitted", "seen", "assigned", "in_progress", "completed", "posted"]) expect(maint.has(st as never)).toBe(true);
  });

  it("keeps receipt numbers gap free per owner", async () => {
    const all = await db.select().from(s.receipts);
    const byOwner = new Map<string, number[]>();
    for (const r of all) byOwner.set(r.ownerId, [...(byOwner.get(r.ownerId) ?? []), r.number]);
    for (const nums of byOwner.values()) {
      const sorted = [...nums].sort((a, b) => a - b);
      expect(sorted).toEqual(sorted.map((_, i) => i + 1));
    }
  });
});
