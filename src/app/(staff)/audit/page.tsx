import { and, desc, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import { ScrollText } from "lucide-react";
import { auditLog } from "@/db/schema";
import { PAGE_SIZE, likeAny } from "@/domain/portfolio";
import { requireStaff } from "@/lib/context";
import { formatDateTime } from "@/lib/dates";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/display";
import { Pagination, parsePage } from "@/components/ui/data-table";
import { FilterBar } from "@/components/ui/filters";

export const metadata = { title: "Audit trail" };

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requireStaff("audit:view");
  const sp = await searchParams;
  const { t, db, ctx, locale } = s;
  const page = parsePage(sp.page);
  const conds: SQL[] = [eq(auditLog.orgId, ctx.orgId)];
  if (sp.entity) conds.push(eq(auditLog.entityType, sp.entity));
  if (sp.q) conds.push(sql`(${auditLog.action} ilike ${likeAny(sp.q)} or ${auditLog.actorName} ilike ${likeAny(sp.q)} or ${auditLog.entityId} ilike ${likeAny(sp.q)})`);
  if (sp.elevated) conds.push(eq(auditLog.elevated, true));
  if (sp.from) conds.push(gte(auditLog.at, new Date(sp.from)));
  if (sp.to) conds.push(lte(auditLog.at, new Date(`${sp.to}T23:59:59+04:00`)));
  const where = and(...conds);
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(auditLog).where(where);
  const rows = await db.select().from(auditLog).where(where).orderBy(desc(auditLog.seq)).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE);
  const entities = ["contract", "cheque", "payment", "receipt", "statement", "unit", "tenant", "owner", "building", "maintenance_request", "user", "organisation", "import", "inspection"];
  return (
    <>
      <PageHeader title={t("nav.audit")} description={t("audit.page_hint")} />
      <FilterBar searchPlaceholder={t("audit.search")} hasActive={!!(sp.q || sp.entity || sp.elevated || sp.from || sp.to)} dates filters={[
        { name: "entity", label: t("audit.entity"), options: entities.map((e) => ({ value: e, label: e.replace(/_/g, " ") })) },
        { name: "elevated", label: t("audit.elevated"), options: [{ value: "1", label: t("common.yes") }] },
      ]} />
      {rows.length === 0 ? <EmptyState icon={<ScrollText className="size-5" />} title={t("audit.empty")} /> : (
        <Card>
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.seq} className="px-4 py-3 md:px-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[14px] font-semibold">{r.action}</span>
                    <Badge>{r.entityType.replace(/_/g, " ")}</Badge>
                    {r.elevated ? <Badge tone="brass">{t("audit.elevated")}</Badge> : null}
                  </div>
                  <span className="text-[12px] text-ink-3">{formatDateTime(r.at, locale)}</span>
                </div>
                <p className="mt-0.5 text-[12.5px] text-ink-3">{r.actorName} · {r.actorRole}{r.entityId ? <> · <bdi className="ltr-num">{r.entityId.slice(0, 8)}</bdi></> : null}</p>
                {r.before || r.after ? (
                  <details className="mt-1.5"><summary className="cursor-pointer text-[12.5px] font-medium text-brand-700">{t("audit.show_values")}</summary>
                    <div className="mt-1.5 grid gap-2 md:grid-cols-2">
                      <pre dir="ltr" className="max-h-48 overflow-auto rounded-sm bg-canvas p-2 text-[11.5px]">{JSON.stringify(r.before, null, 1) ?? "-"}</pre>
                      <pre dir="ltr" className="max-h-48 overflow-auto rounded-sm bg-canvas p-2 text-[11.5px]">{JSON.stringify(r.after, null, 1) ?? "-"}</pre>
                    </div>
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} params={{ q: sp.q, entity: sp.entity, elevated: sp.elevated, from: sp.from, to: sp.to }} basePath="/audit" t={t} />
    </>
  );
}
