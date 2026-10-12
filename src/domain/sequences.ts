import { sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import { sequences } from "@/db/schema";

/**
 * Atomic counter. INSERT .. ON CONFLICT DO UPDATE takes a row lock, so two concurrent callers
 * are serialised by the database and always receive different values.
 */
export async function nextSequence(q: DB, orgId: string | null, key: string): Promise<number> {
  const [row] = await q
    .insert(sequences)
    .values({ key, orgId, value: 1 })
    .onConflictDoUpdate({ target: sequences.key, set: { value: sql`${sequences.value} + 1` } })
    .returning({ value: sequences.value });
  return row.value;
}
