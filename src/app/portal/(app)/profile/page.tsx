import { LogOut } from "lucide-react";
import { eq } from "drizzle-orm";
import { tenants } from "@/db/schema";
import { requireTenant } from "@/lib/context";
import { tenantContract } from "@/domain/portal";
import { formatRange } from "@/lib/dates";
import { formatPhone, maskPhone } from "@/lib/phone";
import { pickName } from "@/i18n";
import { Card, CardBody, CardHeader, DefinitionList, Money, Num } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { LanguageSwitch } from "@/components/language-switch";
import { signOutAction } from "@/app/actions/common";

export const metadata = { title: "Profile" };

export default async function PortalProfile() {
  const s = await requireTenant();
  const { t, db, locale } = s;
  const [tn] = await db.select().from(tenants).where(eq(tenants.id, s.tenant.id));
  const c = (await tenantContract(db, { orgId: s.tenant.orgId, tenantId: s.tenant.id })).current;
  return (
    <div className="space-y-4">
      <h1 className="text-[22px] font-semibold">{t("nav.profile")}</h1>
      <Card><CardHeader title={pickName(locale, tn.nameEn, tn.nameAr)} /><CardBody>
        <DefinitionList className="sm:grid-cols-1" items={[
          { label: t("auth.id_number"), value: <Num>{tn.idNumber}</Num> },
          { label: t("common.phone"), value: <Num>{formatPhone(tn.phone)}</Num> },
          { label: t("portal.masked_phone"), value: <Num>{maskPhone(tn.phone)}</Num> },
        ]} />
      </CardBody></Card>
      {c ? (
        <Card><CardHeader title={t("portal.contract")} /><CardBody>
          <DefinitionList className="sm:grid-cols-1" items={[
            { label: t("common.unit"), value: `${c.unitLabel} · ${pickName(locale, c.buildingName, c.buildingNameAr)}` },
            { label: t("contract.term"), value: <>{formatRange(c.startDate, c.endDate, locale)}</> },
            { label: t("unit.monthly_rent"), value: <Money baisa={c.monthlyRentBaisa} locale={locale} /> },
            { label: t("contract.frequency"), value: t(`freq.${c.paymentFrequency}` as never) },
          ]} />
        </CardBody></Card>
      ) : null}
      <Card><CardBody className="flex items-center justify-between"><span className="text-[14px] font-medium">{t("common.language")}</span><LanguageSwitch locale={locale} /></CardBody></Card>
      <form action={signOutAction}><input type="hidden" name="to" value="portal" /><Button type="submit" variant="secondary" size="lg" className="w-full"><LogOut className="rtl-flip size-4" aria-hidden />{t("nav.sign_out")}</Button></form>
    </div>
  );
}
