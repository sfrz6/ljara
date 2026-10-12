import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { getLocale, getT } from "@/lib/session";
import { OtpFlow } from "../otp-flow";

export const metadata = { title: "Reset password" };

export default async function ResetPage() {
  const t = await getT();
  return (
    <AuthShell locale={await getLocale()} title={t("portal.reset_title")} subtitle={t("portal.reset_hint")} footer={<Link href="/portal/login" className="font-medium text-brand-700 hover:underline">{t("auth.signin")}</Link>}>
      <OtpFlow mode="reset" />
    </AuthShell>
  );
}
