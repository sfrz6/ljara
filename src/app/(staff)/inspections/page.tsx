import Link from "next/link";
import { desc, eq, and, inArray } from "drizzle-orm";
import { ClipboardCheck } from "lucide-react";
import { buildings, inspections, units } from "@/db/schema";
import { requireStaff } from "@/lib/context";
import { formatDateTime } from "@/lib/dates";
import { pickName } from "@/i18n";
import { Badge, Card, CardBody, CardHeader, EmptyState, PageHeader } from "@/components/ui/display";
import { StatusBadge } from "@/components/status";
import { ActionDialog } from "@/components/ui/overlays";
import { Field, Select, Textarea } from "@/components/ui/form";
import { PhotoPicker } from "@/components/ui/file-input";
import { QuickAction } from "@/components/ui/quick-action";
import { decideInspectionAction, inspectAction } from "@/app/actions/maintenance";

export const metadata = { title: "Inspections" };

export default async function InspectionsPage() {
  const s = await requireStaff();
  if (!s.can("inspections:perform") && !s.can("inspections:approve")) return null;
  const { t, db, ctx, locale } = s;
  const rows = await db
    .select({ i: inspections, unit: units, building: buildings.nameEn, buildingAr: buildings.nameAr })
    .from(inspections)
    .innerJoin(units, eq(units.id, inspections.unitId))
    .innerJoin(buildings, eq(buildings.id, units.buildingId))
    .where(and(eq(inspections.orgId, ctx.orgId), inArray(inspections.status, ["pending", "inspected"])))
    .orderBy(desc(inspections.createdAt));
  const recent = await db
    .select({ i: inspections, unit: units.label })
    .from(inspections)
    .innerJoin(units, eq(units.id, inspections.unitId))
    .where(and(eq(inspections.orgId, ctx.orgId), inArray(inspections.status, ["approved", "rejected"])))
    .orderBy(desc(inspections.decidedAt))
    .limit(10);

  return (
    <>
      <PageHeader title={t("nav.inspections")} description={t("insp.page_hint")} />
      {rows.length === 0 ? (
        <EmptyState icon={<ClipboardCheck className="size-5" />} title={t("insp.empty_title")} description={t("insp.empty_body")} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {rows.map(({ i, unit, building, buildingAr }) => (
            <Card key={i.id} className={i.status === "inspected" ? "border-brass-500/50" : "border-bad-600/30"}>
              <CardHeader
                title={<Link href={`/units/${unit.id}`} className="hover:underline">{unit.label} · {pickName(locale, building, buildingAr)}</Link>}
                actions={<StatusBadge kind="unit" status={unit.status} t={t} />}
              />
              <CardBody className="space-y-3">
                {i.status === "pending" ? <p className="text-[13.5px] text-ink-2">{t("insp.pending_hint")}</p> : (
                  <>
                    <div className="flex items-center gap-2"><Badge tone={i.condition === "good" ? "ok" : i.condition === "fair" ? "warn" : "bad"}>{t(`insp.condition.${i.condition}` as never)}</Badge><span className="text-[12.5px] text-ink-3">{formatDateTime(i.inspectedAt, locale)}</span></div>
                    <p className="whitespace-pre-wrap text-[14px]">{i.findings}</p>
                  </>
                )}
                <div className="flex flex-wrap gap-2">
                  {i.status === "pending" && s.can("inspections:perform") ? (
                    <ActionDialog trigger={t("insp.perform")} triggerVariant="primary" triggerSize="md" title={t("insp.perform_title", { unit: unit.label })} action={inspectAction} hidden={{ id: i.id }}>
                      <Field label={t("insp.condition")} name="condition" required>
                        <Select name="condition" defaultValue="good"><option value="good">{t("insp.condition.good")}</option><option value="fair">{t("insp.condition.fair")}</option><option value="needs_work">{t("insp.condition.needs_work")}</option></Select>
                      </Field>
                      <Field label={t("insp.findings")} name="findings" required><Textarea name="findings" rows={4} /></Field>
                      <PhotoPicker />
                    </ActionDialog>
                  ) : null}
                  {i.status === "inspected" && s.can("inspections:approve") ? (
                    <>
                      <QuickAction action={decideInspectionAction} hidden={{ id: i.id, decision: "approve" }} size="md">{t("insp.approve")}</QuickAction>
                      <ActionDialog trigger={t("insp.reject")} triggerVariant="secondary" triggerSize="md" title={t("insp.reject")} action={decideInspectionAction} hidden={{ id: i.id, decision: "reject" }} submitVariant="danger">
                        <Field label={t("common.reason")} name="note" required><Textarea name="note" rows={3} /></Field>
                      </ActionDialog>
                    </>
                  ) : null}
                  {i.status === "inspected" && !s.can("inspections:approve") ? <p className="text-[13px] text-ink-3">{t("insp.awaiting_manager")}</p> : null}
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
      {recent.length > 0 ? (
        <Card className="mt-6">
          <CardHeader title={t("common.history")} />
          <ul className="divide-y divide-line">
            {recent.map(({ i, unit }) => (
              <li key={i.id} className="flex items-center justify-between px-4 py-2.5 text-[13.5px] md:px-5"><span>{unit}</span><Badge tone={i.status === "approved" ? "ok" : "bad"}>{t(`insp.status.${i.status}` as never)}</Badge></li>
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  );
}
