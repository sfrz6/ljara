import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { getTenant } from "@/lib/context";
import { getLocale, getT } from "@/lib/session";
import { TenantLoginForm } from "./form";

export const metadata = { title: "Tenant portal" };

export default async function PortalLogin() {
  if (await getTenant()) redirect("/portal");
  const t = await getT();
  const locale = await getLocale();
  return (
    <AuthShell
      locale={locale}
      title={t("auth.tenant_signin_title")}
      subtitle={t("portal.login_hint")}
      footer={
        <div className="space-y-1.5">
          <p><Link href="/portal/activate" className="font-medium text-brand-700 hover:underline">{t("auth.activate_link")}</Link></p>
          <p><Link href="/login" className="text-ink-2 hover:underline">{t("auth.staff_link")}</Link></p>
        </div>
      }
    >
      <TenantLoginForm demo={null} />
    </AuthShell>
  );
}
