import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { SignupForm } from "./signup-form";
import { getLocale, getT } from "@/lib/session";

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
      <SignupForm locale={locale} />
    </AuthShell>
  );
}
