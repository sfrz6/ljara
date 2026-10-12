import { notFound } from "next/navigation";
import Link from "next/link";
import { and, desc, eq, isNull } from "drizzle-orm";
import { buildings, owners, receiptCounters, statements } from "@/db/schema";
import { requireStaff } from "@/lib/context";
import { bpToPercentString } from "@/lib/money";
import { formatRange } from "@/lib/dates";
import { pickName } from "@/i18n";
import { Badge, Card, CardBody, CardHeader, DefinitionList, Money, Num, PageHeader } from "@/components/ui/display";
import { ActionDialog } from "@/components/ui/overlays";
import { ButtonLink } from "@/components/ui/button";
import { OwnerFields } from "../owner-form";
import { archiveOwnerAction, updateOwnerAction } from "@/app/actions/portfolio";
import { AuditTrail } from "@/components/audit-trail";
import { formatReceiptNumber } from "@/domain/finance";

export default async function OwnerDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await requireStaff("owners:view");
  const { t, db, ctx, locale } = s;
  const [o] = await db.select().from(owners).where(and(eq(owners.id, id), eq(owners.orgId, ctx.orgId)));
  if (!o) notFound();
  const [blds, sts, [counter]] = await Promise.all([
    db.select().from(buildings).where(and(eq(buildings.ownerId, o.id), isNull(buildings.archivedAt))),
    db.select().from(statements).where(and(eq(statements.ownerId, o.id), eq(statements.orgId, ctx.orgId))).orderBy(desc(statements.generatedAt)).limit(8),
    db.select().from(receiptCounters).where(eq(receiptCounters.ownerId, o.id)),
  ]);
  const locked = (counter?.lastNumber ?? 0) > 0;
  return (
    <>
      <PageHeader
        title={pickName(locale, o.nameEn, o.nameAr)}
        breadcrumbs={[{ href: "/owners", label: t("nav.owners") }, { label: pickName(locale, o.nameEn, o.nameAr) }]}
        description={t("owner.no_login_hint")}
        actions={
          <>
            {s.can("statements:generate") ? <ButtonLink href="/statements" variant="secondary">{t("nav.statements")}</ButtonLink> : null}
            {s.can("owners:manage") ? (
              <ActionDialog trigger={t("common.edit")} triggerSize="md" title={t("common.edit")} size="lg" action={updateOwnerAction} hidden={{ id: o.id }} submitLabel={t("common.save")}>
                <OwnerFields d={o} prefixLocked={locked} />
              </ActionDialog>
            ) : null}
          </>
        }
      />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title={t("common.details")} />
          <CardBody>
            <DefinitionList className="sm:grid-cols-1" items={[
              { label: t("common.phone"), value: o.phone ? <Num>{o.phone}</Num> : null },
              { label: t("common.email"), value: o.email },
              { label: t("owner.commission"), value: <Num>{bpToPercentString(o.commissionBp)}%</Num> },
              { label: t("owner.payout"), value: t(`freq.${o.payoutFrequency}` as never) },
              { label: t("owner.cap"), value: o.rentIncreaseCapBp != null ? <Num>{bpToPercentString(o.rentIncreaseCapBp)}%</Num> : t("common.not_set") },
              { label: t("owner.series"), value: <>{o.receiptPrefix} · {t("owner.next_receipt")} <Num>{formatReceiptNumber(o.receiptPrefix, (counter?.lastNumber ?? 0) + 1)}</Num></> },
              { label: t("common.notes"), value: o.notes },
            ]} />
          </CardBody>
        </Card>
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader title={t("nav.buildings")} actions={s.can("buildings:manage") ? <ButtonLink href={`/buildings?owner=${o.id}`} size="sm" variant="quiet">{t("common.view_all")}</ButtonLink> : null} />
            <ul className="divide-y divide-line">
              {blds.length === 0 ? <li className="px-5 py-4 text-[13.5px] text-ink-3">{t("owner.no_buildings")}</li> : blds.map((b) => (
                <li key={b.id}><Link href={`/buildings/${b.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-surface-2 md:px-5"><span className="font-medium">{pickName(locale, b.nameEn, b.nameAr)}</span><span className="text-[13px] text-ink-3">{b.area}</span></Link></li>
              ))}
            </ul>
          </Card>
          {s.can("statements:view") ? (
            <Card>
              <CardHeader title={t("statement.history")} />
              <ul className="divide-y divide-line">
                {sts.length === 0 ? <li className="px-5 py-4 text-[13.5px] text-ink-3">{t("statement.empty_title")}</li> : sts.map((st) => (
                  <li key={st.id}><Link href={`/statements/${st.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-surface-2 md:px-5"><span><Num className="font-medium">{st.number}</Num> <span className="text-[13px] text-ink-3">{formatRange(st.periodFrom, st.periodTo, locale)}</span></span><span className="flex items-center gap-2"><Money baisa={st.netBaisa} locale={locale} strong />{st.lastSharedAt ? <Badge tone="ok">{t("statement.shared")}</Badge> : null}</span></Link></li>
                ))}
              </ul>
            </Card>
          ) : null}
          {s.can("owners:manage") && blds.length === 0 ? (
            <ActionDialog trigger={t("common.archive")} triggerVariant="ghost" title={t("common.archive")} description={t("owner.archive_hint")} action={archiveOwnerAction} hidden={{ id: o.id }} submitVariant="danger" />
          ) : null}
          <AuditTrail entityType="owner" entityId={o.id} />
        </div>
      </div>
    </>
  );
}
