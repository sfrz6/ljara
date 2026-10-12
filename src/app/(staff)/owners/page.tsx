import { and, eq, isNull, sql } from "drizzle-orm";
import { Plus, Users } from "lucide-react";
import { buildings, units } from "@/db/schema";
import { searchOwners } from "@/domain/portfolio";
import { requireStaff } from "@/lib/context";
import { bpToPercentString } from "@/lib/money";
import { formatPhone } from "@/lib/phone";
import { pickName } from "@/i18n";
import { EmptyState, Num, PageHeader } from "@/components/ui/display";
import { DataTable, type Column } from "@/components/ui/data-table";
import { FilterBar } from "@/components/ui/filters";
import { ActionDialog } from "@/components/ui/overlays";
import { OwnerFields } from "./owner-form";
import { createOwnerAction } from "@/app/actions/portfolio";

export const metadata = { title: "Owners" };

export default async function OwnersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requireStaff("owners:view");
  const sp = await searchParams;
  const { t, db, ctx, locale } = s;
  const list = await searchOwners(db, ctx.orgId, sp.q);
  const counts = await db
    .select({ ownerId: units.ownerId, n: sql<number>`count(*)::int` })
    .from(units)
    .where(and(eq(units.orgId, ctx.orgId), isNull(units.archivedAt)))
    .groupBy(units.ownerId);
  const bcounts = await db.select({ ownerId: buildings.ownerId, n: sql<number>`count(*)::int` }).from(buildings).where(and(eq(buildings.orgId, ctx.orgId), isNull(buildings.archivedAt))).groupBy(buildings.ownerId);
  const uc = new Map(counts.map((c) => [c.ownerId, c.n]));
  const bc = new Map(bcounts.map((c) => [c.ownerId, c.n]));
  type Row = (typeof list)[number];
  const columns: Column<Row>[] = [
    { key: "n", header: t("common.owner"), mobile: "title", cell: (o) => <>{pickName(locale, o.nameEn, o.nameAr)}</> },
    { key: "p", header: t("common.phone"), mobile: "subtitle", cell: (o) => <Num>{formatPhone(o.phone) || "-"}</Num> },
    { key: "b", header: t("common.buildings"), label: t("common.buildings"), cell: (o) => <Num>{bc.get(o.id) ?? 0}</Num> },
    { key: "u", header: t("common.units"), label: t("common.units"), cell: (o) => <Num>{uc.get(o.id) ?? 0}</Num> },
    { key: "c", header: t("owner.commission_short"), label: t("owner.commission_short"), cell: (o) => <Num>{bpToPercentString(o.commissionBp)}%</Num> },
    { key: "f", header: t("owner.payout"), label: t("owner.payout"), cell: (o) => <>{t(`freq.${o.payoutFrequency}` as never)}</> },
    { key: "r", header: t("owner.prefix"), label: t("owner.prefix"), cell: (o) => <Num>{o.receiptPrefix}</Num> },
  ];
  return (
    <>
      <PageHeader
        title={t("nav.owners")}
        description={t("owner.page_hint")}
        actions={s.can("owners:manage") ? (
          <ActionDialog trigger={t("owner.add")} triggerVariant="primary" triggerSize="md" triggerIcon={<Plus className="size-4" />} title={t("owner.add")} size="lg" action={createOwnerAction} submitLabel={t("common.create")}>
            <OwnerFields />
          </ActionDialog>
        ) : null}
      />
      <FilterBar searchPlaceholder={t("owner.search")} hasActive={!!sp.q} />
      <DataTable
        columns={columns}
        rows={list}
        rowKey={(o) => o.id}
        rowHref={(o) => `/owners/${o.id}`}
        empty={<EmptyState icon={<Users className="size-5" />} title={t("owner.empty_title")} description={t("owner.empty_body")} />}
      />
    </>
  );
}
