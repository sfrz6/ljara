import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDb } from "./helpers";

describe("migrations", () => {
  it("apply cleanly and enforce the append-only audit trail", async () => {
    const db = await createTestDb();
    await db.execute(sql`insert into audit_log (actor_kind, action, entity_type) values ('system','x','y')`);
    await expect(db.execute(sql`update audit_log set action = 'z'`)).rejects.toThrow();
    await expect(db.execute(sql`delete from audit_log`)).rejects.toThrow();
  });
});
