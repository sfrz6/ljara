import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { attachments, buildings, maintenanceCategories, maintenanceEvents, maintenanceRequests, tenants, units, users } from "@/db/schema";
import { MAINTENANCE_STATES } from "@/domain/machines";
import { requireStaff } from "@/lib/context";
import { formatDateTime } from "@/lib/dates";
import { pickName } from "@/i18n";
import { Badge, Card, CardBody, CardHeader, DefinitionList, Money, Num, PageHeader } from "@/components/ui/display";
import { Stepper } from "@/components/ui/stepper";
import { StatusBadge } from "@/components/status";
import { AuditTrail } from "@/components/audit-trail";
import { RequestActions } from "./request-actions";
import { formatPhone } from "@/lib/phone";

export default async function RequestDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await requireStaff("maintenance:view");
  const { t, db, ctx, locale } = s;
  const [row] = await db
    .select({ r: maintenanceRequests, unit: units.label, building: buildings.nameEn, buildingAr: buildings.nameAr, tenant: tenants.nameEn, tenantAr: tenants.nameAr, phone: tenants.phone, cat: maintenanceCategories.nameEn, catAr: maintenanceCategories.nameAr, tech: users.name })
    .from(maintenanceRequests)
    .innerJoin(units, eq(units.id, maintenanceRequests.unitId))
    .innerJoin(buildings, eq(buildings.id, maintenanceRequests.buildingId))
    .leftJoin(tenants, eq(tenants.id, maintenanceRequests.tenantId))
    .leftJoin(maintenanceCategories, eq(maintenanceCategories.id, maintenanceRequests.categoryId))
    .leftJoin(users, eq(users.id, maintenanceRequests.assignedToUserId))
    .where(and(eq(maintenanceRequests.id, id), eq(maintenanceRequests.orgId, ctx.orgId)));
  if (!row) notFound();
  const r = row.r;
  const [events, photos, techs, cats] = await Promise.all([
    db.select().from(maintenanceEvents).where(eq(maintenanceEvents.requestId, r.id)).orderBy(asc(maintenanceEvents.at)),
    db.select().from(attachments).where(and(eq(attachments.entityType, "maintenance_request"), eq(attachments.entityId, r.id))),
    db.select({ id: users.id, name: users.name }).from(users).where(and(eq(users.orgId, ctx.orgId), eq(users.role, "maintenance"), eq(users.active, true))),
    db.select().from(maintenanceCategories).where(and(eq(maintenanceCategories.orgId, ctx.orgId), eq(maintenanceCategories.active, true))),
  ]);
  const at = (st: string) => {
    const e = events.filter((x) => x.status === st && !x.internal).at(-1);
    return e ? formatDateTime(e.at, locale) : undefined;
  };
  const steps = MAINTENANCE_STATES.map((st) => ({ key: st, label: t(`maint.status.${st}` as never), at: at(st) }));
  const isManager = s.role === "manager";
  const mine = r.assignedToUserId === s.user.id;

  return (
    <>
      <PageHeader
        title={r.title}
        badge={<StatusBadge kind="maint" status={r.status} t={t} />}
        description={<><Num>{r.reference}</Num> · {row.unit} · {pickName(locale, row.building, row.buildingAr)}</>}
        breadcrumbs={[{ href: "/maintenance", label: t("nav.maintenance") }, { label: r.reference }]}
        actions={r.priority === "urgent" ? <Badge tone="bad">{t("priority.urgent")}</Badge> : null}
      />
      <Card className="mb-5"><CardBody><Stepper steps={steps} current={r.status} /></CardBody></Card>
      {r.status === "completed" && r.costBaisa === null ? <div className="mb-5 rounded-md border border-warn-100 bg-warn-50 px-4 py-3 text-[14px] text-warn-700">{t("maint.cost_missing")}</div> : null}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader title={t("maint.description")} />
            <CardBody>
              <p className="whitespace-pre-wrap text-[14.5px]">{r.description}</p>
              {photos.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-2.5">
                  {photos.map((p) => (
                    <a key={p.id} href={`/api/files/${p.fileId}`} target="_blank" rel="noreferrer" className="block size-24 overflow-hidden rounded-md border border-line">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/api/files/${p.fileId}`} alt={p.kind === "work_photo" ? t("maint.work_photo") : t("maint.photo")} className="size-full object-cover" loading="lazy" />
                    </a>
                  ))}
                </div>
              ) : null}
            </CardBody>
          </Card>
          {r.workPerformed ? (
            <Card>
              <CardHeader title={t("maint.work")} />
              <CardBody>
                <p className="whitespace-pre-wrap text-[14.5px]">{r.workPerformed}</p>
                {r.technicianNotes ? <p className="mt-2 text-[13.5px] text-ink-2">{r.technicianNotes}</p> : null}
              </CardBody>
            </Card>
          ) : null}
          <RequestActions
            id={r.id}
            status={r.status}
            isManager={isManager}
            canWork={isManager || (s.role === "maintenance" && mine)}
            canCorrect={s.can("maintenance:costs")}
            technicians={techs}
            categories={cats.map((c) => ({ id: c.id, label: pickName(locale, c.nameEn, c.nameAr) }))}
            defaultCategory={r.categoryId ?? ""}
          />
          <Card>
            <CardHeader title={t("maint.timeline")} />
            <ol className="divide-y divide-line">
              {[...events].reverse().map((e) => (
                <li key={e.id} className="px-4 py-2.5 text-[13.5px] md:px-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">{t(`maint.status.${e.status}` as never)}{e.internal ? <Badge className="ms-2">{t("maint.internal")}</Badge> : null}</span>
                    <span className="text-[12px] text-ink-3">{formatDateTime(e.at, locale)}</span>
                  </div>
                  <p className="text-[12.5px] text-ink-3">{e.actorName}</p>
                  {e.note ? <p className="mt-0.5 text-ink-2">{e.note}</p> : null}
                </li>
              ))}
            </ol>
          </Card>
        </div>
        <div className="space-y-5">
          <Card>
            <CardHeader title={t("common.details")} />
            <CardBody>
              <DefinitionList
                className="sm:grid-cols-1"
                items={[
                  { label: t("common.tenant"), value: row.tenant ? <>{pickName(locale, row.tenant, row.tenantAr)}<span className="block text-[13px] text-ink-3"><Num>{formatPhone(row.phone)}</Num></span></> : null },
                  { label: t("maint.category"), value: row.cat ? pickName(locale, row.cat, row.catAr) : null },
                  { label: t("maint.technician"), value: row.tech },
                  { label: t("common.created"), value: formatDateTime(r.createdAt, locale) },
                  ...(r.costBaisa !== null ? [{ label: t("maint.cost"), value: <Money baisa={r.costBaisa} locale={locale} strong /> }] : []),
                ]}
              />
            </CardBody>
          </Card>
          <AuditTrail entityType="maintenance_request" entityId={r.id} />
        </div>
      </div>
    </>
  );
}
