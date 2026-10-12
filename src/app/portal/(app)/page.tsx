import Link from "next/link";
import { Receipt, Wrench } from "lucide-react";
import { requireTenant } from "@/lib/context";
import { tenantContract, tenantReceipts, tenantRequests, tenantSchedule } from "@/domain/portal";
import { formatDate, formatRange } from "@/lib/dates";
import { pickName } from "@/i18n";
import { Badge, Card, CardBody, CardHeader, Money, Num } from "@/components/ui/display";
import { StatusBadge } from "@/components/status";
import { ButtonLink } from "@/components/ui/button";
import { PayNowButton } from "./pay-now";

export const metadata = { title: "Home" };

export default async function PortalHome() {
  const s = await requireTenant();
  const { t, db, locale } = s;
  const scope = { orgId: s.tenant.orgId, tenantId: s.tenant.id };
  const [contract, sched, receipts, requests] = await Promise.all([tenantContract(db, scope), tenantSchedule(db, scope), tenantReceipts(db, scope), tenantRequests(db, scope)]);
  const cur = contract.current;
  const next = sched.items.find((i) => i.status === "action_needed") ?? sched.items.find((i) => i.status === "due") ?? sched.items.find((i) => i.status === "upcoming");
  const openRequests = requests.filter((r) => r.tenantStatus !== "completed");
  return (
    <div className="space-y-4">
      <div>
        <p className="text-[13px] text-ink-3">{t("portal.welcome")}</p>
        <h1 className="text-[24px] font-semibold tracking-tight">{pickName(locale, s.tenant.nameEn, s.tenant.nameAr)}</h1>
      </div>
      {cur ? (
        <Card>
          <CardBody>
            <p className="text-[12.5px] font-medium text-ink-3">{t("portal.your_home")}</p>
            <p className="mt-0.5 text-[18px] font-semibold">{pickName(locale, cur.buildingName, cur.buildingNameAr)} · {cur.unitLabel}</p>
            <p className="text-[13.5px] text-ink-2">{formatRange(cur.startDate, cur.endDate, locale)} · <Money baisa={cur.monthlyRentBaisa} locale={locale} /> {t("common.per_month")}</p>
          </CardBody>
        </Card>
      ) : null}

      {next ? (
        <Card className={next.status === "action_needed" ? "border-bad-600/40 bg-bad-50" : next.status === "due" ? "border-warn-600/40" : ""}>
          <CardBody className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-medium text-ink-2">{t("portal.next_payment")}</p>
              <StatusBadge kind="sched" status={next.status} t={t} />
            </div>
            <p className="text-[28px] font-semibold leading-none tracking-tight"><Money baisa={next.amountBaisa} locale={locale} /></p>
            <p className="text-[13.5px] text-ink-2">{formatDate(next.dueDate, locale)}</p>
            {next.status === "action_needed" ? <p className="text-[13.5px] font-medium text-bad-700">{t("portal.action_needed_hint")}</p> : null}
            {next.canPayOnline ? <PayNowButton itemId={next.id} /> : null}
          </CardBody>
        </Card>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <Link href="/portal/maintenance" className="block rounded-md border border-line bg-surface p-4 shadow-card active:bg-surface-2">
          <Wrench className="size-5 text-brand-700" aria-hidden />
          <p className="mt-2 text-[22px] font-semibold tabular-nums"><Num>{openRequests.length}</Num></p>
          <p className="text-[13px] text-ink-2">{t("portal.open_requests")}</p>
        </Link>
        <Link href="/portal/receipts" className="block rounded-md border border-line bg-surface p-4 shadow-card active:bg-surface-2">
          <Receipt className="size-5 text-brand-700" aria-hidden />
          <p className="mt-2 text-[22px] font-semibold tabular-nums"><Num>{receipts.length}</Num></p>
          <p className="text-[13px] text-ink-2">{t("nav.receipts")}</p>
        </Link>
      </div>
      <ButtonLink href="/portal/maintenance/new" size="lg" className="w-full"><Wrench className="size-5" aria-hidden />{t("portal.report_issue")}</ButtonLink>

      {openRequests.length > 0 ? (
        <Card>
          <CardHeader title={t("portal.open_requests")} />
          <ul className="divide-y divide-line">
            {openRequests.slice(0, 3).map((r) => (
              <li key={r.id}><Link href={`/portal/maintenance/${r.id}`} className="flex items-center justify-between gap-2 px-4 py-3"><span className="text-[14px] font-medium">{r.title}</span><StatusBadge kind="request" status={r.tenantStatus} t={t} /></Link></li>
            ))}
          </ul>
        </Card>
      ) : null}
      {!cur ? <Badge tone="warn">{t("portal.no_contract")}</Badge> : null}
    </div>
  );
}
