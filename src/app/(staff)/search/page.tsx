import Link from "next/link";
import { and, eq, ilike, or } from "drizzle-orm";
import { Search } from "lucide-react";
import { buildings, contracts, owners, tenants, units } from "@/db/schema";
import { likeAny } from "@/domain/portfolio";
import { requireStaff } from "@/lib/context";
import { pickName } from "@/i18n";
import { Card, CardHeader, EmptyState, Num, PageHeader } from "@/components/ui/display";
import { FilterBar } from "@/components/ui/filters";

export const metadata = { title: "Search" };

/** Global search across tenants, units, contracts, buildings and owners, limited to what the role may open. */
export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requireStaff();
  const sp = await searchParams;
  const { t, db, ctx, locale } = s;
  const q = sp.q?.trim() ?? "";
  const like = likeAny(q);
  const sections: { title: string; items: { href: string; label: string; sub?: string }[] }[] = [];
  if (q.length >= 2) {
    if (s.can("tenants:view")) {
      const r = await db.select().from(tenants).where(and(eq(tenants.orgId, ctx.orgId), or(ilike(tenants.nameEn, like), ilike(tenants.nameAr, like), ilike(tenants.phone, likeAny(q.replace(/\s/g, ""))), ilike(tenants.idNumber, like))!)).limit(8);
      sections.push({ title: t("nav.tenants"), items: r.map((x) => ({ href: `/tenants/${x.id}`, label: pickName(locale, x.nameEn, x.nameAr), sub: x.idNumber })) });
    }
    if (s.can("units:view")) {
      const r = await db.select({ u: units, b: buildings.nameEn, bAr: buildings.nameAr }).from(units).innerJoin(buildings, eq(buildings.id, units.buildingId)).where(and(eq(units.orgId, ctx.orgId), or(ilike(units.label, like), ilike(buildings.nameEn, like), ilike(buildings.nameAr, like))!)).limit(8);
      sections.push({ title: t("nav.units"), items: r.map((x) => ({ href: `/units/${x.u.id}`, label: x.u.label, sub: pickName(locale, x.b, x.bAr) })) });
    }
    if (s.can("contracts:view")) {
      const r = await db.select({ c: contracts, tn: tenants.nameEn, tnAr: tenants.nameAr }).from(contracts).innerJoin(tenants, eq(tenants.id, contracts.tenantId)).where(and(eq(contracts.orgId, ctx.orgId), or(ilike(contracts.reference, like), ilike(contracts.sanadReference, like))!)).limit(8);
      sections.push({ title: t("nav.contracts"), items: r.map((x) => ({ href: `/contracts/${x.c.id}`, label: x.c.reference, sub: pickName(locale, x.tn, x.tnAr) })) });
    }
    if (s.can("buildings:view")) {
      const r = await db.select().from(buildings).where(and(eq(buildings.orgId, ctx.orgId), or(ilike(buildings.nameEn, like), ilike(buildings.nameAr, like), ilike(buildings.area, like))!)).limit(6);
      sections.push({ title: t("nav.buildings"), items: r.map((x) => ({ href: `/buildings/${x.id}`, label: pickName(locale, x.nameEn, x.nameAr), sub: x.area ?? undefined })) });
    }
    if (s.can("owners:view")) {
      const r = await db.select().from(owners).where(and(eq(owners.orgId, ctx.orgId), or(ilike(owners.nameEn, like), ilike(owners.nameAr, like))!)).limit(6);
      sections.push({ title: t("nav.owners"), items: r.map((x) => ({ href: `/owners/${x.id}`, label: pickName(locale, x.nameEn, x.nameAr) })) });
    }
  }
  const any = sections.some((x) => x.items.length > 0);
  return (
    <>
      <PageHeader title={t("common.search")} />
      <FilterBar searchPlaceholder={t("nav.search_placeholder")} defaultQuery={q} />
      {q.length < 2 ? <EmptyState icon={<Search className="size-5" />} title={t("search.hint")} /> : !any ? <EmptyState icon={<Search className="size-5" />} title={t("common.no_results")} /> : (
        <div className="space-y-4">
          {sections.filter((x) => x.items.length > 0).map((sec) => (
            <Card key={sec.title}>
              <CardHeader title={sec.title} />
              <ul className="divide-y divide-line">{sec.items.map((i) => <li key={i.href}><Link href={i.href} className="flex items-center justify-between px-4 py-3 hover:bg-surface-2 md:px-5"><span className="font-medium"><Num>{i.label}</Num></span><span className="text-[13px] text-ink-3">{i.sub}</span></Link></li>)}</ul>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
