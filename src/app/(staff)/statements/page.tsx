import Link from "next/link";
import { desc, eq, isNull, and } from "drizzle-orm";
import { owners, statements } from "@/db/schema";
import { lastPayoutPeriod } from "@/domain/statements";
import { requireStaff } from "@/lib/context";
import { formatDate, formatRange, todayISO } from "@/lib/dates";
import { pickName } from "@/i18n";
import { Card, CardBody, CardHeader, EmptyState, Money, Num, PageHeader } from "@/components/ui/display";
import { DataTable, type Column } from "@/components/ui/data-table";
import { StatementForms } from "./statement-forms";
import { BarChart3 } from "lucide-react";

export const metadata = { title: "Owner statements" };

export default async function StatementsPage() {
  const s = await requireStaff("statements:view");
  const { t, db, ctx, locale } = s;
  const ownerList = await db.select().from(owners).where(and(eq(owners.orgId, ctx.orgId), isNull(owners.archivedAt))).orderBy(owners.nameEn);
  const rows = await db
    .select({ st: statements, owner: owners.nameEn, ownerAr: owners.nameAr })
    .from(statements)
    .innerJoin(owners, eq(owners.id, statements.ownerId))
    .where(eq(statements.orgId, ctx.orgId))
    .orderBy(desc(statements.generatedAt))
    .limit(50);
  const today = todayISO();
  const suggestions = ownerList.map((o) => ({ id: o.id, name: pickName(locale, o.nameEn, o.nameAr), ...lastPayoutPeriod(o.payoutFrequency, today), frequency: o.payoutFrequency }));
  type Row = (typeof rows)[number];
  const columns: Column<Row>[] = [
    { key: "no", header: "#", mobile: "title", cell: (r) => <Num className="font-semibold">{r.st.number}</Num> },
    { key: "owner", header: t("common.owner"), mobile: "subtitle", cell: (r) => <>{pickName(locale, r.owner, r.ownerAr)}</> },
    { key: "period", header: t("statement.period"), label: t("statement.period"), cell: (r) => <>{formatRange(r.st.periodFrom, r.st.periodTo, locale)}</> },
    { key: "net", header: t("statement.net"), label: t("statement.net"), align: "end", cell: (r) => <Money baisa={r.st.netBaisa} locale={locale} strong /> },
    { key: "shared", header: t("statement.last_shared"), label: t("statement.last_shared"), cell: (r) => <>{r.st.lastSharedAt ? formatDate(r.st.lastSharedAt, locale) : "-"}</> },
  ];
  return (
    <>
      <PageHeader title={t("nav.statements")} description={t("statement.page_hint")} />
      {s.can("statements:generate") ? <StatementForms owners={suggestions} defaultLocale={locale} /> : null}
      <Card className="mt-6">
        <CardHeader title={t("statement.history")} />
        <CardBody className="p-0 md:p-0">
          <div className="p-3 md:p-4">
            <DataTable columns={columns} rows={rows} rowKey={(r) => r.st.id} rowHref={(r) => `/statements/${r.st.id}`} empty={<EmptyState icon={<BarChart3 className="size-5" />} title={t("statement.empty_title")} description={t("statement.empty_body")} />} />
          </div>
        </CardBody>
      </Card>
      <p className="mt-3 text-[13px] text-ink-3"><Link href="/owners" className="underline">{t("nav.owners")}</Link></p>
    </>
  );
}
