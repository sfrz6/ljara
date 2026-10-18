import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { getLocale, getT } from "@/lib/session";
import { OtpFlow } from "../otp-flow";
import { channelUsable } from "@/lib/features";

export const metadata = { title: "Reset password" };

export default async function ResetPage() {
  const t = await getT();
  return (
    <AuthShell locale={await getLocale()} title={t("portal.reset_title")} subtitle={channelUsable("sms") ? t("portal.reset_hint") : t("portal.reset_office_hint")} footer={<Link href="/portal/login" className="font-medium text-brand-700 hover:underline">{t("auth.signin")}</Link>}>
      <OtpFlow mode="reset" smsLive={channelUsable("sms")} />
    </AuthShell>
  );
}
