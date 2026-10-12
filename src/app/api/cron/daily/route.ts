import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { runDailyJobsForAll } from "@/domain/jobs";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Vercel Cron: due cheques, contract activation and expiry alerts, rent reminders. Protected by CRON_SECRET. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new NextResponse("Unauthorized", { status: 401 });
  const results = await runDailyJobsForAll(await getDb());
  return NextResponse.json({ ok: true, results });
}
