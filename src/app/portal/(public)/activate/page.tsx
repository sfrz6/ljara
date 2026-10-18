import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { getLocale, getT } from "@/lib/session";
import { OtpFlow } from "../otp-flow";
import { channelUsable } from "@/lib/features";

export const metadata = { title: "Activate account" };

export default async function ActivatePage() {
  const t = await getT();
  return (
    <AuthShell locale={await getLocale()} title={t("portal.activate_title")} subtitle={channelUsable("sms") ? t("portal.activate_hint") : t("portal.activate_office_hint")} footer={<Link href="/portal/login" className="font-medium text-brand-700 hover:underline">{t("auth.signin")}</Link>}>
      <OtpFlow mode="activate" smsLive={channelUsable("sms")} />
    </AuthShell>
  );
}
