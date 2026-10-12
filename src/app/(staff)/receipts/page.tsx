import { and, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { FileDown, Receipt as ReceiptIcon } from "lucide-react";
import { owners, payments, receipts } from "@/db/schema";
import { likeAny, PAGE_SIZE } from "@/domain/portfolio";
import { requireStaff } from "@/lib/context";
import { formatDate } from "@/lib/dates";
import { pickName } from "@/i18n";
import { EmptyState, Money, Num, PageHeader } from "@/components/ui/display";
import { DataTable, Pagination, parsePage, type Column } from "@/components/ui/data-table";
import { FilterBar } from "@/components/ui/filters";
import { StatusBadge } from "@/components/status";
import { buttonClass } from "@/components/ui/button";
import { ActionDialog } from "@/components/ui/overlays";
import { Field, Textarea } from "@/components/ui/form";
import { voidReceiptAction } from "@/app/actions/finance";
import type { ReceiptSnapshot } from "@/db/schema";

export const metadata = { title: "Receipts" };

export default async function ReceiptsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requireStaff("receipts:view");
  const sp = await searchParams;
  const { t, db, ctx, locale } = s;
  const page = parsePage(sp.page);
  const conds: SQL[] = [eq(receipts.orgId, ctx.orgId)];
  if (sp.kind) conds.push(eq(receipts.kind, sp.kind as "receipt"));
  if (sp.owner) conds.push(eq(receipts.ownerId, sp.owner));
  if (sp.q) conds.push(or(ilike(receipts.displayNumber, likeAny(sp.q)), sql`${receipts.snapshot}->>'tenantName' ilike ${likeAny(sp.q)}`, sql`${receipts.snapshot}->>'unitLabel' ilike ${likeAny(sp.q)}`)!);
  if (sp.from) conds.push(sql`${receipts.issuedAt} >= ${sp.from}::date`);
  if (sp.to) conds.push(sql`${receipts.issuedAt} < (${sp.to}::date + 1)`);
  const where = and(...conds);
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(receipts).where(where);
  const rows = await db
    .select({ r: receipts, method: payments.method })
    .from(receipts)
    .innerJoin(payments, eq(payments.id, receipts.paymentId))
    .where(where)
    .orderBy(desc(receipts.issuedAt), desc(receipts.number))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);
  const ownerList = await db.select({ id: owners.id, nameEn: owners.nameEn, nameAr: owners.nameAr }).from(owners).where(eq(owners.orgId, ctx.orgId));
  type Row = (typeof rows)[number];
  const snap = (r: Row) => r.r.snapshot as ReceiptSnapshot;

  const columns: Column<Row>[] = [
    { key: "no", header: "#", mobile: "title", cell: (r) => <span className="flex items-center gap-2"><Num className="font-semibold">{r.r.displayNumber}</Num>{r.r.kind === "credit_note" ? <span className="rounded-xs bg-warn-100 px-1.5 text-[11px] font-medium text-warn-700">{t("receipt.kind.credit_note")}</span> : null}</span> },
    { key: "tenant", header: t("common.tenant"), mobile: "subtitle", cell: (r) => <>{pickName(locale, snap(r).tenantName, snap(r).tenantNameAr)} · {snap(r).unitLabel}</> },
    { key: "date", header: t("common.date"), label: t("common.date"), cell: (r) => <>{formatDate(r.r.issuedAt, locale)}</> },
    { key: "method", header: t("common.type"), label: t("common.type"), cell: (r) => <>{t(`method.${r.method}` as never)}</> },
    { key: "amount", header: t("common.amount"), label: t("common.amount"), align: "end", cell: (r) => <Money baisa={r.r.kind === "credit_note" ? -r.r.amountBaisa : r.r.amountBaisa} locale={locale} strong /> },
    { key: "status", header: t("common.status"), mobile: "badge", cell: (r) => <StatusBadge kind="receipt" status={r.r.status} t={t} /> },
    {
      key: "act", header: <span className="sr-only">{t("common.actions")}</span>, mobile: "actions", align: "end",
      cell: (r) => (
        <div className="flex justify-end gap-1.5">
          <a className={buttonClass("secondary", "sm")} href={`/api/pdf/receipt/${r.r.id}`} target="_blank" rel="noreferrer"><FileDown className="size-4" aria-hidden />PDF</a>
          {s.can("receipts:void") && r.r.kind === "receipt" && r.r.status === "issued" ? (
            <ActionDialog trigger={t("receipt.void")} triggerVariant="ghost" title={t("receipt.void_title", { number: r.r.displayNumber })} description={t("receipt.void_hint")} action={voidReceiptAction} hidden={{ id: r.r.id }} submitVariant="danger" submitLabel={t("receipt.void")}>
              <Field label={t("common.reason")} name="reason" required><Textarea name="reason" rows={2} /></Field>
            </ActionDialog>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader title={t("nav.receipts")} description={t("receipt.page_hint")} />
      <FilterBar
        searchPlaceholder={t("receipt.search")}
        hasActive={!!(sp.q || sp.kind || sp.owner || sp.from || sp.to)}
        dates
        filters={[
          { name: "kind", label: t("common.type"), options: [{ value: "receipt", label: t("receipt.kind.receipt") }, { value: "credit_note", label: t("receipt.kind.credit_note") }] },
          { name: "owner", label: t("common.owner"), options: ownerList.map((o) => ({ value: o.id, label: pickName(locale, o.nameEn, o.nameAr) })) },
        ]}
      />
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.r.id} empty={<EmptyState icon={<ReceiptIcon className="size-5" />} title={t("receipt.empty_title")} description={t("receipt.empty_body")} />} />
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} params={{ q: sp.q, kind: sp.kind, owner: sp.owner, from: sp.from, to: sp.to }} basePath="/receipts" t={t} />
    </>
  );
}
