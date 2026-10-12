import { eq } from "drizzle-orm";
import { messageTemplates, organisations } from "@/db/schema";
import { listCategories, listStaff } from "@/domain/organisation";
import { orgPrefs } from "@/domain/notifications";
import { listSessions } from "@/domain/auth";
import { TEMPLATES } from "@/domain/templates";
import { requireStaff } from "@/lib/context";
import { PageHeader } from "@/components/ui/display";
import { Tabs } from "@/components/ui/filters";
import { formatDateTime } from "@/lib/dates";
import { CategoriesPanel, FinanceForm, NotificationForm, OrgForm, SecurityPanel, StaffPanel, TemplatesPanel } from "./settings-forms";

export const metadata = { title: "Settings" };

async function sessionRows(s: Awaited<ReturnType<typeof requireStaff>>) {
  const [{ getSessionToken }, { sha256 }] = await Promise.all([import("@/lib/session"), import("@/lib/password")]);
  const token = await getSessionToken();
  const { sessions } = await import("@/db/schema");
  const cur = token ? (await s.db.select({ id: sessions.id }).from(sessions).where(eq(sessions.tokenHash, sha256(token))))[0]?.id : null;
  const list = await listSessions(s.db, s.user.id);
  const short = (ua: string | null) => (ua ? (/iPhone|iPad/.test(ua) ? "iPhone / iPad" : /Android/.test(ua) ? "Android" : /Edg/.test(ua) ? "Edge" : /Chrome/.test(ua) ? "Chrome" : /Safari/.test(ua) ? "Safari" : /Firefox/.test(ua) ? "Firefox" : ua.slice(0, 30)) : "Browser");
  return list.map((x) => ({ id: x.id, agent: short(x.userAgent), lastSeen: formatDateTime(x.lastSeenAt, s.locale), current: x.id === cur }));
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requireStaff("settings:view");
  const sp = await searchParams;
  const { t, db, ctx } = s;
  const manage = s.can("settings:manage");
  const tab = sp.tab ?? (manage ? "org" : "account");
  const [org] = await db.select().from(organisations).where(eq(organisations.id, ctx.orgId));
  const tabs = [
    ...(manage ? [{ value: "org", label: t("settings.tab.org") }, { value: "finance", label: t("settings.tab.finance") }, { value: "maintenance", label: t("settings.tab.maintenance") }, { value: "notifications", label: t("settings.tab.notifications") }, { value: "templates", label: t("settings.tab.templates") }] : []),
    ...(s.can("users:manage") ? [{ value: "staff", label: t("settings.tab.staff") }] : []),
    { value: "account", label: t("settings.tab.account") },
  ];
  return (
    <>
      <PageHeader title={t("nav.settings")} description={t("settings.page_hint")} />
      <Tabs tabs={tabs} active={tab} basePath="/settings" />
      <div className="max-w-3xl space-y-5">
        {tab === "org" && manage ? <OrgForm org={org} /> : null}
        {tab === "finance" && manage ? <FinanceForm org={org} /> : null}
        {tab === "maintenance" && manage ? <CategoriesPanel cats={await listCategories(db, ctx.orgId, true)} /> : null}
        {tab === "notifications" && manage ? <NotificationForm prefs={await orgPrefs(db, ctx.orgId)} /> : null}
        {tab === "templates" && manage ? (
          <TemplatesPanel
            templates={await (async () => {
              const custom = await db.select().from(messageTemplates).where(eq(messageTemplates.orgId, ctx.orgId));
              return TEMPLATES.map((tp) => {
                const en = custom.find((c) => c.key === tp.key && c.locale === "en");
                const ar = custom.find((c) => c.key === tp.key && c.locale === "ar");
                return { key: tp.key, audience: tp.audience, vars: tp.vars, en: en?.body ?? tp.body.en, ar: ar?.body ?? tp.body.ar, customEn: !!en, customAr: !!ar, titleEn: s.locale === "ar" ? tp.subject.ar : tp.subject.en };
              });
            })()}
          />
        ) : null}
        {tab === "staff" && s.can("users:manage") ? <StaffPanel meId={s.user.id} staff={(await listStaff(db, ctx.orgId)).map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, active: u.active, lastLoginAt: u.lastLoginAt ? formatDateTime(u.lastLoginAt, s.locale) : null }))} /> : null}
        {tab === "account" ? <SecurityPanel enabled={s.user.twoFactorEnabled} sessions={await sessionRows(s)} /> : null}
      </div>
    </>
  );
}
