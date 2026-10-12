/**
 * Load the fictional demo data.
 *   npm run db:seed            only when the database is empty
 *   npm run db:seed -- --force wipe everything first (DANGEROUS on a shared database)
 */
import { config } from "dotenv";

config({ path: ".env.local" });
config();

async function main() {
  const force = process.argv.includes("--force");
  const { getDb } = await import("../src/db/client");
  const { resetDatabase, seedDemo } = await import("../src/db/seed");
  const { organisations } = await import("../src/db/schema");
  const db = await getDb();
  const existing = await db.select({ id: organisations.id }).from(organisations).limit(1);
  if (existing.length > 0 && !force) {
    console.log("Database already has data. Use --force to wipe and reseed.");
    return;
  }
  if (force) await resetDatabase(db);
  await seedDemo(db);
  console.log("Demo data loaded. See README for demo accounts.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
