/**
 * Apply SQL migrations.
 *   npm run db:migrate                     apply to DATABASE_URL (Neon) or the embedded local database
 *   tsx scripts/migrate.ts --if-configured only run when DATABASE_URL is set (used by vercel-build)
 */
import path from "node:path";
import { config } from "dotenv";

config({ path: ".env.local" });
config();

async function main() {
  const ifConfigured = process.argv.includes("--if-configured");
  const url = process.env.DATABASE_URL;
  if (!url) {
    if (ifConfigured) {
      console.log("DATABASE_URL not set, skipping migrations.");
      return;
    }
    const { getDb } = await import("../src/db/client");
    await getDb();
    console.log("Embedded database is migrated (.data/pglite).");
    return;
  }
  const { Pool } = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  const pool = new Pool({ connectionString: url, max: 1 });
  await migrate(drizzle(pool), { migrationsFolder: path.join(process.cwd(), "drizzle") });
  await pool.end();
  console.log("Migrations applied.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
