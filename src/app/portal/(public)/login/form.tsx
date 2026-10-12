"use client";

import Link from "next/link";
import { useState } from "react";
import { ActionForm, Field, Input, SubmitButton } from "@/components/ui/form";
import { useI18n } from "@/components/i18n-provider";
import { tenantLoginAction } from "@/app/actions/portal";

export function TenantLoginForm({ demo }: { demo: { id: string; password: string; otp: string } | null }) {
  const { t } = useI18n();
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  return (
    <>
      <ActionForm action={tenantLoginAction}>
        <Field label={t("auth.id_number")} name="idNumber"><Input name="idNumber" value={id} onChange={(e) => setId(e.target.value)} autoComplete="username" inputMode="text" required /></Field>
        <Field label={t("auth.password")} name="password"><Input name="password" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" required /></Field>
        <div className="flex justify-end"><Link href="/portal/reset" className="text-[13px] font-medium text-brand-700 hover:underline">{t("auth.forgot")}</Link></div>
        <SubmitButton size="lg" className="w-full">{t("auth.signin")}</SubmitButton>
      </ActionForm>
      {demo ? (
        <button type="button" onClick={() => { setId(demo.id); setPw(demo.password); }} className="mt-5 w-full rounded-sm border border-dashed border-line-strong bg-surface-2 px-3 py-2 text-start text-[12.5px] text-ink-2 hover:bg-brand-50">
          <span className="font-semibold">{t("auth.demo_title")}</span>: <bdi className="ltr-num">{demo.id}</bdi> · {t("portal.demo_inactive")} <bdi className="ltr-num">87654321</bdi> · OTP <bdi className="ltr-num">{demo.otp}</bdi>
        </button>
      ) : null}
    </>
  );
}
