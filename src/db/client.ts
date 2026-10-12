import * as schema from "./schema";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import path from "node:path";

export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;
/** A transaction handle is structurally a DB, so services accept either. */
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

interface Holder {
  db?: DB;
  ready?: Promise<void>;
  kind?: "pg" | "pglite";
}

const g = globalThis as unknown as { __ijaraDb?: Holder };
const holder: Holder = (g.__ijaraDb ??= {});

export const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

export function isEmbedded(): boolean {
  return !process.env.DATABASE_URL;
}

async function open(): Promise<void> {
  if (process.env.DATABASE_URL) {
    const { Pool } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.DATABASE_POOL_MAX ?? 5),
      idleTimeoutMillis: 20_000,
    });
    holder.db = drizzle(pool, { schema }) as unknown as DB;
    holder.kind = "pg";
    return;
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const dir = process.env.PGLITE_DIR ? path.resolve(process.env.PGLITE_DIR) : path.join(process.cwd(), ".data", "pglite");
  const { mkdirSync } = await import("node:fs");
  mkdirSync(dir, { recursive: true });
  const client = new PGlite(dir);
  await client.waitReady;
  const db = drizzle(client, { schema });
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  holder.db = db as unknown as DB;
  holder.kind = "pglite";
  // Zero configuration local development: seed the demo data the first time the embedded database is empty.
  if (process.env.DEMO_MODE === "true") {
    const { count } = await import("drizzle-orm");
    const [row] = await holder.db.select({ n: count() }).from(schema.organisations);
    if (row.n === 0) {
      const { seedDemo } = await import("./seed");
      await seedDemo(holder.db);
    }
  }
}

/** Resolve the shared database. Connects (and for embedded mode migrates) on first use. */
export async function getDb(): Promise<DB> {
  if (holder.db) return holder.db;
  holder.ready ??= open().catch((err) => {
    holder.ready = undefined;
    throw err;
  });
  await holder.ready;
  if (!holder.db) throw new Error("Database failed to initialise");
  return holder.db;
}

/** Test hook: install a database created by the test harness. */
export function setDbForTests(db: DB): void {
  holder.db = db;
  holder.ready = Promise.resolve();
}
