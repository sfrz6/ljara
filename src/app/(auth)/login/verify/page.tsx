import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { getSession, getLocale, getT } from "@/lib/session";
import { VerifyForm } from "./form";

export default async function VerifyPage() {
  const session = await getSession();
  if (!session || session.kind !== "staff" || !session.pending2fa) redirect("/login");
  const t = await getT();
  return (
    <AuthShell locale={await getLocale()} title={t("auth.verify_title")} subtitle={t("auth.verify_hint")}>
      <VerifyForm />
    </AuthShell>
  );
}
