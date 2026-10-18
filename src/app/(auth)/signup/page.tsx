import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { SignupForm } from "./signup-form";
import { getLocale, getT } from "@/lib/session";
import { signupEnabled } from "@/lib/features";
import { Alert } from "@/components/ui/form";

export const metadata = { title: "Create your office" };

export default async function SignupPage() {
  const t = await getT();
  const locale = await getLocale();
  return (
    <AuthShell
      locale={locale}
      title={t("auth.signup_title")}
      subtitle={t("auth.signup_sub")}
      footer={
        <p>
          {t("auth.have_account")}{" "}
          <Link href="/login" className="font-medium text-brand-700 hover:underline">
            {t("auth.signin")}
          </Link>
        </p>
      }
    >
      {signupEnabled() ? <SignupForm locale={locale} /> : <Alert tone="info" title={t("auth.signup_closed")}>{t("auth.signup_closed_hint")}</Alert>}
    </AuthShell>
  );
}
