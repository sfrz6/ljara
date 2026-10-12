/** Wipe and reload demo data. npm run db:reset */
import { config } from "dotenv";

config({ path: ".env.local" });
config();

async function main() {
  const { getDb } = await import("../src/db/client");
  const { resetDatabase, seedDemo } = await import("../src/db/seed");
  const db = await getDb();
  await resetDatabase(db);
  await seedDemo(db);
  console.log("Database reset and reseeded.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
