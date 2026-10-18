import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "./login-form";
import { getStaff } from "@/lib/context";
import { getLocale, getSession, getT } from "@/lib/session";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  const staff = await getStaff();
  if (staff) redirect(staff.role === "platform_admin" ? "/platform" : "/dashboard");
  const session = await getSession();
  if (session?.kind === "tenant") redirect("/portal");
  const t = await getT();
  const locale = await getLocale();
  const demo: { key: string; email: string; role: string; name: string }[] = [];
  return (
    <AuthShell
      locale={locale}
      title={t("auth.signin_title")}
      subtitle={t("auth.staff_hint")}
      footer={
        <div className="space-y-1.5">
          <p>
            {t("auth.no_account")}{" "}
            <Link href="/signup" className="font-medium text-brand-700 hover:underline">
              {t("auth.create_office")}
            </Link>
          </p>
          <p>
            <Link href="/portal/login" className="font-medium text-brand-700 hover:underline">
              {t("auth.tenant_link")}
            </Link>
          </p>
        </div>
      }
    >
      <LoginForm demo={demo} demoHint={null} />
    </AuthShell>
  );
}
