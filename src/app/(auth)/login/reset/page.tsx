import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { getLocale, getT } from "@/lib/session";
import { StaffResetFlow } from "./flow";

export default async function StaffReset() {
  const t = await getT();
  return (
    <AuthShell locale={await getLocale()} title={t("portal.reset_title")} subtitle={t("auth.reset_hint")} footer={<Link href="/login" className="font-medium text-brand-700 hover:underline">{t("auth.signin")}</Link>}>
      <StaffResetFlow />
    </AuthShell>
  );
}
