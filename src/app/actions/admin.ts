"use server";

import { runDailyJobs } from "@/domain/jobs";
import { staffAction } from "@/lib/action";

export const runDailyAction = staffAction("settings:manage", async ({ c }) => {
  await runDailyJobs(c.db, c.ctx.orgId);
  return { message: "msg.daily_done", revalidate: ["/notifications", "/cheques", "/dashboard", "/contracts"] };
});
