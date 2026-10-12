import { redirect } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { Check } from "lucide-react";
import { buildings, organisations, owners, units, users } from "@/db/schema";
import { requireStaff } from "@/lib/context";
import { getLocale } from "@/lib/session";
import { Wordmark } from "@/components/brand";
import { ButtonLink } from "@/components/ui/button";
import { QuickAction } from "@/components/ui/quick-action";
import { finishOnboardingAction } from "@/app/actions/settings";

export const metadata = { title: "Welcome" };

/** A short checklist, not a wizard: every step links to the real screen and ticks itself when done. */
export default async function OnboardingPage() {
  const s = await requireStaff("settings:manage");
  const { t, db, ctx } = s;
  const [org] = await db.select().from(organisations).where(eq(organisations.id, ctx.orgId));
  if (org.onboardingCompletedAt) redirect("/dashboard");
  const count = async (table: typeof owners | typeof buildings | typeof units) => (await db.select({ n: sql<number>`count(*)::int` }).from(table).where(eq(table.orgId, ctx.orgId)))[0].n;
  const [o, b, u, staff] = await Promise.all([count(owners), count(buildings), count(units), db.select({ n: sql<number>`count(*)::int` }).from(users).where(and(eq(users.orgId, ctx.orgId)))]);
  const steps = [
    { done: !!org.address || !!org.nameAr, title: t("onboarding.s1"), body: t("onboarding.s1b"), href: "/settings" },
    { done: staff[0].n > 1, title: t("onboarding.s2"), body: t("onboarding.s2b"), href: "/settings?tab=staff" },
    { done: o > 0, title: t("onboarding.s3"), body: t("onboarding.s3b"), href: "/owners" },
    { done: b > 0, title: t("onboarding.s4"), body: t("onboarding.s4b"), href: "/buildings" },
    { done: u > 0, title: t("onboarding.s5"), body: t("onboarding.s5b"), href: "/buildings" },
  ];
  return (
    <main className="pt-safe pb-safe mx-auto min-h-dvh max-w-xl px-4 py-8">
      <Wordmark locale={await getLocale()} />
      <h1 className="mt-6 text-[26px] font-semibold tracking-tight">{t("onboarding.title", { name: org.name })}</h1>
      <p className="mt-1 text-ink-2">{t("onboarding.sub")}</p>
      <ol className="mt-6 space-y-3">
        {steps.map((st, i) => (
          <li key={i} className="flex items-start gap-3 rounded-md border border-line bg-surface p-4 shadow-card">
            <span className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold ${st.done ? "bg-ok-600 text-white" : "bg-canvas text-ink-3 ring-1 ring-line-strong"}`}>{st.done ? <Check className="size-4" aria-hidden /> : i + 1}</span>
            <div className="min-w-0 flex-1"><p className="font-semibold">{st.title}</p><p className="text-[13.5px] text-ink-2">{st.body}</p></div>
            <ButtonLink href={st.href} variant={st.done ? "ghost" : "secondary"} size="sm">{st.done ? t("common.edit") : t("common.open")}</ButtonLink>
          </li>
        ))}
      </ol>
      <div className="mt-6"><QuickAction action={finishOnboardingAction} hidden={{}} size="lg" className="w-full">{t("onboarding.finish")}</QuickAction></div>
      <p className="mt-3 text-center text-[13px] text-ink-3">{t("onboarding.later")}</p>
    </main>
  );
}
