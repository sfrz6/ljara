import Link from "next/link";
import { AlertTriangle, ClipboardCheck, Wallet } from "lucide-react";
import { requireStaff } from "@/lib/context";
import * as dash from "@/domain/dashboard";
import { Badge, Card, CardBody, CardHeader, EmptyState, Money, Num, PageHeader, ProgressBar, Stat } from "@/components/ui/display";
import { ButtonLink } from "@/components/ui/button";
import { StatusBadge } from "@/components/status";
import { formatDate } from "@/lib/dates";
import { pickName } from "@/i18n";
import { todayISO } from "@/lib/dates";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const s = await requireStaff("dashboard:view");
  const { t, db, ctx, locale } = s;
  const today = todayISO();
  const header = <PageHeader title={t("dash.title")} description={t("dash.welcome", { name: s.user.name })} />;

  if (s.role === "manager") {
    const d = await dash.manager(db, ctx.orgId, today);
    const occ = d.totalUnits ? Math.round((d.occupiedUnits / d.totalUnits) * 100) : 0;
    return (
      <>
        {header}
        {d.bounced.length > 0 ? (
          <Card className="pulse-alert mb-5 border-bad-600/40 bg-bad-50">
            <CardHeader title={<span className="flex items-center gap-2 text-bad-700"><AlertTriangle className="size-4" aria-hidden />{t("dash.bounced_title")}</span>} actions={<ButtonLink href="/cheques?tab=bounced" size="sm" variant="danger">{t("nav.cheques")}</ButtonLink>} className="border-bad-100" />
            <ul className="divide-y divide-bad-100">
              {d.bounced.map((b) => (
                <li key={b.c.id}>
                  <Link href={`/cheques?tab=bounced&focus=${b.c.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-bad-100/40 md:px-5">
                    <span className="min-w-0">
                      <span className="block text-[14px] font-semibold text-ink">{pickName(locale, b.tenant, b.tenantAr)} · {b.unit}</span>
                      <span className="block text-[12.5px] text-ink-2">#<Num>{b.c.chequeNumber}</Num> · {b.c.bank} · {b.c.bounceReason}</span>
                    </span>
                    <span className="flex items-center gap-3"><Money baisa={b.c.amountBaisa} locale={locale} strong /><StatusBadge kind="cheque" status={b.c.status} t={t} /></span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat tone="ok" label={t("dash.collected_month")} value={<Money baisa={d.collectedBaisa} locale={locale} />} sub={<>{t("dash.of_expected", { amount: "" })} <Money baisa={d.expectedBaisa} locale={locale} /></>} />
          <Stat tone={d.overdueCount ? "bad" : "neutral"} label={t("dash.overdue")} value={<Money baisa={d.overdueBaisa} locale={locale} />} sub={t("dash.overdue_sub", { n: d.overdueCount })} href="/cheques" />
          <Stat tone="warn" label={t("dash.due_cheques")} value={<Num>{d.dueChequeCount}</Num>} sub={<Money baisa={d.dueChequeBaisa} locale={locale} />} href="/cheques?tab=due" />
          <Stat tone="brand" label={t("dash.occupancy")} value={<Num>{occ}%</Num>} sub={t("dash.vacant", { n: d.vacantUnits })} href="/units" />
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader title={t("dash.per_building")} />
            <CardBody className="space-y-4">
              {d.perBuilding.map((b) => (
                <div key={b.buildingId}>
                  <div className="mb-1 flex items-baseline justify-between gap-3 text-[13.5px]">
                    <Link href={`/buildings/${b.buildingId}`} className="font-medium hover:underline">{pickName(locale, b.name, b.nameAr)}</Link>
                    <span className="text-ink-2"><Money baisa={b.collected} locale={locale} /> / <Money baisa={b.expected} locale={locale} /></span>
                  </div>
                  <ProgressBar value={b.collected} max={b.expected} tone={b.overdue > 0 ? "warn" : "ok"} label={b.name} />
                  {b.overdue > 0 ? <p className="mt-1 text-[12px] font-medium text-bad-600">{t("dash.overdue")}: <Money baisa={b.overdue} locale={locale} /></p> : null}
                </div>
              ))}
            </CardBody>
          </Card>

          <div className="space-y-5">
            <Card>
              <CardHeader title={t("dash.inspection_title")} description={t("dash.inspection_hint")} />
              {d.underInspection.length === 0 ? <CardBody className="text-[13.5px] text-ink-3">{t("dash.nothing_inspection")}</CardBody> : (
                <ul className="divide-y divide-line">
                  {d.underInspection.map((u) => (
                    <li key={u.unit.id}><Link href={`/units/${u.unit.id}`} className="flex items-center justify-between gap-2 px-4 py-3 hover:bg-surface-2"><span className="text-[14px] font-medium">{u.unit.label} <span className="text-ink-3">· {pickName(locale, u.building, u.buildingAr)}</span></span><StatusBadge kind="unit" status={u.unit.status} t={t} /></Link></li>
                  ))}
                </ul>
              )}
            </Card>
            <Card>
              <CardHeader title={t("dash.expiring_title")} />
              {d.expiring.length === 0 ? <CardBody className="text-[13.5px] text-ink-3">{t("dash.none_expiring")}</CardBody> : (
                <ul className="divide-y divide-line">
                  {d.expiring.map((c) => (
                    <li key={c.id}><Link href={`/contracts/${c.id}`} className="flex items-center justify-between gap-2 px-4 py-3 hover:bg-surface-2"><span className="min-w-0 text-[14px]"><span className="block font-medium">{c.unit} · {pickName(locale, c.tenant, c.tenantAr)}</span><span className="block text-[12.5px] text-ink-3">{formatDate(c.endDate, locale)}</span></span><Badge tone={c.daysLeft <= 30 ? "bad" : "warn"}>{t("common.day_left", { n: c.daysLeft })}</Badge></Link></li>
                  ))}
                </ul>
              )}
            </Card>
            <Card>
              <CardHeader title={t("dash.maintenance_title")} actions={<ButtonLink href="/maintenance" size="sm" variant="quiet">{t("common.view_all")}</ButtonLink>} />
              <CardBody className="grid grid-cols-2 gap-2.5">
                {(["submitted", "seen", "assigned", "in_progress", "completed"] as const).map((st) => {
                  const row = d.maintenance.find((m) => m.status === st);
                  return <Link key={st} href={`/maintenance?status=${st}`} className="rounded-sm border border-line px-3 py-2 hover:bg-surface-2"><span className="block text-[22px] font-semibold leading-tight tabular-nums">{row?.n ?? 0}</span><span className="block text-[12px] text-ink-3">{t(`maint.status.${st}` as never)}</span></Link>;
                })}
              </CardBody>
            </Card>
          </div>
        </div>
      </>
    );
  }

  if (s.role === "accounts") {
    const d = await dash.accounts(db, ctx.orgId, today);
    return (
      <>
        {header}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat tone="warn" label={t("dash.due_cheques")} value={<Num>{d.due.length}</Num>} href="/cheques?tab=due" />
          <Stat tone={d.bounced.length ? "bad" : "neutral"} label={t("cheque.status.bounced")} value={<Num>{d.bounced.length}</Num>} href="/cheques?tab=bounced" />
          <Stat tone="ok" label={t("dash.collected_month")} value={<Money baisa={d.collectedMonthBaisa} locale={locale} />} />
          <Stat tone="brand" label={t("common.today")} value={<Money baisa={d.collectedTodayBaisa} locale={locale} />} sub={<Num>{d.collectedTodayCount}</Num>} />
        </div>
        <Card className="mt-5">
          <CardHeader title={t("dash.due_cheques")} actions={<ButtonLink href="/cheques?tab=due" size="sm" variant="quiet">{t("common.view_all")}</ButtonLink>} />
          {d.due.length === 0 ? <CardBody><EmptyState icon={<Wallet className="size-5" />} title={t("dash.due_cheques")} description="0" /></CardBody> : (
            <ul className="divide-y divide-line">
              {d.due.slice(0, 8).map((r) => (<li key={r.c.id}><Link href={`/cheques?tab=due&focus=${r.c.id}`} className="flex items-center justify-between gap-2 px-4 py-3 hover:bg-surface-2"><span className="text-[14px] font-medium">{pickName(locale, r.tenant, r.tenantAr)} · {r.unit}<span className="block text-[12.5px] font-normal text-ink-3">#<Num>{r.c.chequeNumber}</Num> · {formatDate(r.c.chequeDate, locale)}</span></span><Money baisa={r.c.amountBaisa} locale={locale} strong /></Link></li>))}
            </ul>
          )}
        </Card>
      </>
    );
  }

  if (s.role === "maintenance") {
    const d = await dash.maintenance(db, ctx.orgId, s.user.id);
    return (
      <>
        {header}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat tone="brand" label={t("nav.maintenance")} value={<Num>{d.mine.length}</Num>} href="/maintenance" />
          <Stat tone="warn" label={t("maint.status.submitted")} value={<Num>{d.unassigned.length}</Num>} />
          <Stat tone="bad" label={t("nav.inspections")} value={<Num>{d.pendingInspections.length}</Num>} href="/inspections" />
          <Stat tone="ok" label={t("maint.status.posted")} value={<Num>{d.completedCount}</Num>} />
        </div>
        <Card className="mt-5">
          <CardHeader title={t("nav.inspections")} actions={<ClipboardCheck className="size-4 text-ink-3" />} />
          <ul className="divide-y divide-line">
            {d.pendingInspections.map((i) => (<li key={i.i.id}><Link href="/inspections" className="flex justify-between px-4 py-3 text-[14px] font-medium hover:bg-surface-2">{i.unit} · {i.building}<StatusBadge kind="unit" status="under_inspection" t={t} /></Link></li>))}
          </ul>
        </Card>
        <Card className="mt-5">
          <CardHeader title={t("nav.maintenance")} />
          <ul className="divide-y divide-line">
            {d.mine.map((r) => (<li key={r.r.id}><Link href={`/maintenance/${r.r.id}`} className="flex items-center justify-between gap-2 px-4 py-3 hover:bg-surface-2"><span className="text-[14px] font-medium">{r.r.title}<span className="block text-[12.5px] font-normal text-ink-3">{r.unit} · {r.building}</span></span><StatusBadge kind="maint" status={r.r.status} t={t} /></Link></li>))}
          </ul>
        </Card>
      </>
    );
  }

  const d = await dash.contractsDash(db, ctx.orgId, today);
  return (
    <>
      {header}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat tone="bad" label={t("dash.expiring_title")} value={<Num>{d.expiring.length}</Num>} href="/contracts?tab=expiring" />
        <Stat tone="warn" label={t("unit.status.notice_given")} value={<Num>{d.notices.length}</Num>} />
        <Stat tone="brand" label={t("contract.status.pending")} value={<Num>{d.upcoming.length}</Num>} />
        <Stat tone="ok" label={t("unit.status.available")} value={<Num>{d.vacant.length}</Num>} href="/units?status=available" />
      </div>
      <Card className="mt-5">
        <CardHeader title={t("dash.expiring_title")} />
        {d.expiring.length === 0 ? <CardBody className="text-[13.5px] text-ink-3">{t("dash.none_expiring")}</CardBody> : (
          <ul className="divide-y divide-line">
            {d.expiring.map((c) => (<li key={c.id}><Link href={`/contracts/${c.id}`} className="flex items-center justify-between gap-2 px-4 py-3 hover:bg-surface-2"><span className="text-[14px] font-medium">{c.unit} · {pickName(locale, c.tenant, c.tenantAr)}<span className="block text-[12.5px] font-normal text-ink-3">{formatDate(c.endDate, locale)}</span></span><Badge tone={c.daysLeft <= 30 ? "bad" : "warn"}>{t("common.day_left", { n: c.daysLeft })}</Badge></Link></li>))}
          </ul>
        )}
      </Card>
    </>
  );
}
