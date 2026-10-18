import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { cleanupAuthTables } from "@/domain/auth";
import { runDailyJobsForAll } from "@/domain/jobs";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Vercel Cron: due cheques, contract activation and expiry alerts, rent reminders, table housekeeping. Protected by CRON_SECRET. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new NextResponse("Unauthorized", { status: 401 });
  const db = await getDb();
  const results = await runDailyJobsForAll(db);
  const cleaned = await cleanupAuthTables(db);
  return NextResponse.json({ ok: true, results, cleaned });
}
