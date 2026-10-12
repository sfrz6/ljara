import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import { auditLog, buildings, organisations, sessions, units, users } from "@/db/schema";

export interface OrgSummary {
  id: string;
  name: string;
  nameAr: string | null;
  status: "active" | "suspended";
  createdAt: Date;
  users: number;
  buildings: number;
  units: number;
  activeUsers30d: number;
  lastActivity: Date | null;
}

/**
 * Platform level overview. Deliberately counts only: no tenant personal data and no financial records are
 * reachable from the platform role (proposal M-02).
 */
export async function organisationSummaries(db: DB): Promise<OrgSummary[]> {
  const orgs = await db.select().from(organisations).orderBy(desc(organisations.createdAt));
  const since = new Date(Date.now() - 30 * 86_400_000);
  const out: OrgSummary[] = [];
  for (const o of orgs) {
    const [u] = await db.select({ n: sql<number>`count(*)::int` }).from(users).where(eq(users.orgId, o.id));
    const [b] = await db.select({ n: sql<number>`count(*)::int` }).from(buildings).where(and(eq(buildings.orgId, o.id), isNull(buildings.archivedAt)));
    const [un] = await db.select({ n: sql<number>`count(*)::int` }).from(units).where(and(eq(units.orgId, o.id), isNull(units.archivedAt)));
    const [a] = await db.select({ n: sql<number>`count(distinct ${sessions.userId})::int` }).from(sessions).where(and(eq(sessions.orgId, o.id), eq(sessions.kind, "staff"), gte(sessions.lastSeenAt, since)));
    const [last] = await db.select({ at: sql<Date | null>`max(${auditLog.at})` }).from(auditLog).where(eq(auditLog.orgId, o.id));
    out.push({ id: o.id, name: o.name, nameAr: o.nameAr, status: o.status, createdAt: o.createdAt, users: u.n, buildings: b.n, units: un.n, activeUsers30d: a.n, lastActivity: last.at ? new Date(last.at) : null });
  }
  return out;
}

export async function revokeAllOrgSessions(db: DB, orgId: string): Promise<void> {
  await db.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.orgId, orgId), isNull(sessions.revokedAt), inArray(sessions.kind, ["staff", "tenant"])));
}
