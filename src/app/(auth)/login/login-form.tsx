"use client";

import { useState } from "react";
import Link from "next/link";
import { ActionForm, Field, Input, SubmitButton } from "@/components/ui/form";
import { useI18n } from "@/components/i18n-provider";
import { loginAction } from "@/app/actions/auth";
import { DEMO_PASSWORD } from "@/lib/demo-public";

export function LoginForm({ demo, demoHint }: { demo: { key: string; email: string; role: string; name: string }[]; demoHint: string | null }) {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  return (
    <>
      <ActionForm action={loginAction}>
        <Field label={t("auth.email")} name="email">
          <Input name="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label={t("auth.password")} name="password">
          <Input name="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        <div className="flex justify-end">
          <Link href="/login/reset" className="text-[13px] font-medium text-brand-700 hover:underline">
            {t("auth.forgot")}
          </Link>
        </div>
        <SubmitButton className="w-full" size="lg" pendingLabel={t("common.loading")}>
          {t("auth.signin")}
        </SubmitButton>
      </ActionForm>
      {demo.length > 0 ? (
        <div className="mt-6 border-t border-line pt-4">
          <p className="text-[12.5px] font-semibold uppercase tracking-wide text-ink-3">{t("auth.demo_title")}</p>
          <p className="mt-1 text-[12.5px] text-ink-3">{demoHint}</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {demo.map((d) => (
              <button
                key={d.key}
                type="button"
                onClick={() => {
                  setEmail(d.email);
                  setPassword(DEMO_PASSWORD);
                }}
                className="rounded-sm border border-line bg-surface-2 px-2.5 py-2 text-start text-[13px] hover:bg-brand-50"
              >
                <span className="block font-medium text-ink">{t(`role.${d.role}` as never)}</span>
                <span className="block truncate text-[11.5px] text-ink-3" dir="ltr">
                  {d.email}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}
