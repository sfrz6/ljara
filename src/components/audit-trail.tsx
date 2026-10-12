import { and, desc, eq } from "drizzle-orm";
import { auditLog } from "@/db/schema";
import { getStaff } from "@/lib/context";
import { formatDateTime } from "@/lib/dates";
import { Card, CardHeader } from "./ui/display";
import type { Key } from "@/i18n";

/** The history of one record, readable in place (CR-10.1). Visible to roles that may view the audit trail. */
export async function AuditTrail({ entityType, entityId }: { entityType: string; entityId: string }) {
  const s = await getStaff();
  if (!s || !s.can("audit:view")) return null;
  const rows = await s.db
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.orgId, s.ctx.orgId), eq(auditLog.entityType, entityType), eq(auditLog.entityId, entityId)))
    .orderBy(desc(auditLog.seq))
    .limit(30);
  if (rows.length === 0) return null;
  const label = (a: string) => {
    const key = `audit.action.${a}` as Key;
    try { const v = s.t(key); return v === key ? a : v; } catch { return a; }
  };
  return (
    <Card>
      <CardHeader title={s.t("common.history")} />
      <ol className="divide-y divide-line">
        {rows.map((r) => (
          <li key={r.seq} className="px-4 py-2.5 text-[13.5px] md:px-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-medium text-ink">{label(r.action)}</span>
              <span className="text-[12px] text-ink-3">{formatDateTime(r.at, s.locale)}</span>
            </div>
            <p className="text-[12.5px] text-ink-3">{r.actorName}{r.actorRole ? ` · ${r.actorRole}` : ""}</p>
          </li>
        ))}
      </ol>
    </Card>
  );
}
