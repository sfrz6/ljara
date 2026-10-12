import Link from "next/link";
import { Plus, Wrench } from "lucide-react";
import { requireTenant } from "@/lib/context";
import { tenantRequests } from "@/domain/portal";
import { formatDate } from "@/lib/dates";
import { Card, EmptyState, Num } from "@/components/ui/display";
import { StatusBadge } from "@/components/status";
import { ButtonLink } from "@/components/ui/button";

export const metadata = { title: "Requests" };

export default async function PortalRequests() {
  const s = await requireTenant();
  const { t, db, locale } = s;
  const list = await tenantRequests(db, { orgId: s.tenant.orgId, tenantId: s.tenant.id });
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><h1 className="text-[22px] font-semibold">{t("nav.requests")}</h1><ButtonLink href="/portal/maintenance/new" size="md"><Plus className="size-4" aria-hidden />{t("portal.report_issue")}</ButtonLink></div>
      {list.length === 0 ? <EmptyState icon={<Wrench className="size-5" />} title={t("portal.no_requests")} description={t("portal.no_requests_body")} /> : (
        <ul className="space-y-2.5">
          {list.map((r) => (
            <li key={r.id}><Link href={`/portal/maintenance/${r.id}`}><Card className="active:bg-surface-2"><div className="flex items-center justify-between gap-3 p-4"><div className="min-w-0"><p className="truncate text-[15px] font-semibold">{r.title}</p><p className="text-[12.5px] text-ink-3"><Num>{r.reference}</Num> · {formatDate(r.createdAt, locale)}</p></div><StatusBadge kind="request" status={r.tenantStatus} t={t} /></div></Card></Link></li>
          ))}
        </ul>
      )}
    </div>
  );
}
