"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { organisations } from "@/db/schema";
import { writeAudit } from "@/domain/audit";
import { parseForm, staffAction } from "@/lib/action";
import { revokeAllOrgSessions } from "@/domain/platform";

export const setOrgStatusAction = staffAction("platform:manage", async ({ c, form, t }) => {
  const v = parseForm(z.object({ id: z.string().uuid(), status: z.enum(["active", "suspended"]) }), form, t);
  await c.db.update(organisations).set({ status: v.status }).where(eq(organisations.id, v.id));
  if (v.status === "suspended") await revokeAllOrgSessions(c.db, v.id);
  await writeAudit(c.db, { orgId: v.id, actor: c.ctx.actor }, { action: `platform.org_${v.status}`, entityType: "organisation", entityId: v.id, elevated: true });
  return { message: "msg.org_updated", revalidate: ["/platform"] };
});
