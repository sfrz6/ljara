import { Building2 } from "lucide-react";
import { requirePlatform } from "@/lib/context";
import { organisationSummaries } from "@/domain/platform";
import { formatDate, formatDateTime } from "@/lib/dates";
import { pickName } from "@/i18n";
import { Badge, Card, CardBody, Num, PageHeader, Stat } from "@/components/ui/display";
import { Wordmark } from "@/components/brand";
import { LanguageSwitch } from "@/components/language-switch";
import { QuickAction } from "@/components/ui/quick-action";
import { setOrgStatusAction } from "@/app/actions/platform";
import { signOutAction } from "@/app/actions/common";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Organisations" };

export default async function PlatformPage() {
  const s = await requirePlatform();
  const { t, db, locale } = s;
  const orgs = await organisationSummaries(db);
  const sum = (f: (o: (typeof orgs)[number]) => number) => orgs.reduce((a, o) => a + f(o), 0);
  return (
    <div className="mx-auto max-w-5xl px-4 pb-10">
      <div className="pt-safe flex items-center justify-between py-4">
        <Wordmark locale={locale} />
        <div className="flex items-center gap-2"><LanguageSwitch locale={locale} /><form action={signOutAction}><Button type="submit" variant="secondary" size="sm">{t("nav.sign_out")}</Button></form></div>
      </div>
      <PageHeader title={t("platform.title")} description={t("platform.hint")} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat tone="brand" label={t("platform.orgs")} value={<Num>{orgs.length}</Num>} />
        <Stat label={t("platform.users")} value={<Num>{sum((o) => o.users)}</Num>} />
        <Stat label={t("common.buildings")} value={<Num>{sum((o) => o.buildings)}</Num>} />
        <Stat label={t("platform.total_units")} value={<Num>{sum((o) => o.units)}</Num>} />
      </div>
      <ul className="mt-5 space-y-3">
        {orgs.map((o) => (
          <li key={o.id}>
            <Card><CardBody className="space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-md bg-brand-50 text-brand-700"><Building2 className="size-5" aria-hidden /></span>
                  <div><p className="text-[16px] font-semibold">{pickName(locale, o.name, o.nameAr)}</p><p className="text-[12.5px] text-ink-3">{t("platform.created")} {formatDate(o.createdAt, locale)}</p></div></div>
                <Badge tone={o.status === "active" ? "ok" : "bad"} dot>{o.status === "active" ? t("platform.active") : t("platform.suspended")}</Badge>
              </div>
              <dl className="grid grid-cols-2 gap-3 text-[13px] sm:grid-cols-5">
                <div><dt className="text-ink-3">{t("platform.users")}</dt><dd className="text-[16px] font-semibold"><Num>{o.users}</Num></dd></div>
                <div><dt className="text-ink-3">{t("common.buildings")}</dt><dd className="text-[16px] font-semibold"><Num>{o.buildings}</Num></dd></div>
                <div><dt className="text-ink-3">{t("platform.total_units")}</dt><dd className="text-[16px] font-semibold"><Num>{o.units}</Num></dd></div>
                <div><dt className="text-ink-3">{t("platform.active_users")}</dt><dd className="text-[16px] font-semibold"><Num>{o.activeUsers30d}</Num></dd></div>
                <div><dt className="text-ink-3">{t("platform.last_active")}</dt><dd>{o.lastActivity ? formatDateTime(o.lastActivity, locale) : "-"}</dd></div>
              </dl>
              <div className="flex items-center gap-3 border-t border-line pt-3">
                <QuickAction action={setOrgStatusAction} hidden={{ id: o.id, status: o.status === "active" ? "suspended" : "active" }} variant={o.status === "active" ? "secondary" : "primary"}>{o.status === "active" ? t("platform.suspend") : t("platform.reactivate")}</QuickAction>
                {o.status === "active" ? <p className="text-[12.5px] text-ink-3">{t("platform.suspend_hint")}</p> : null}
              </div>
            </CardBody></Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
