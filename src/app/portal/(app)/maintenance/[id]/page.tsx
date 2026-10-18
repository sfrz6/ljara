import { requireTenant } from "@/lib/context";
import { tenantRequestDetail } from "@/domain/portal";
import { DomainError } from "@/domain/errors";
import { notFound } from "next/navigation";
import { formatDateTime } from "@/lib/dates";
import { Card, CardBody, Num } from "@/components/ui/display";
import { ProgressSteps } from "@/components/ui/stepper";
import { StatusBadge } from "@/components/status";

export default async function PortalRequestDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await requireTenant();
  const { t, db, locale } = s;
  let r;
  try {
    r = await tenantRequestDetail(db, { orgId: s.tenant.orgId, tenantId: s.tenant.id }, id);
  } catch (e) {
    if (e instanceof DomainError) notFound();
    throw e;
  }
  const onHold = r.tenantStatus === "waiting";
  const stamp = (k: string) => {
    const e = r.timeline.filter((x) => x.status === k).at(-1);
    return e ? formatDateTime(e.at, locale) : undefined;
  };
  const steps = [
    { key: "received", label: t("tenant.request.received"), at: stamp("received") },
    { key: "in_progress", label: onHold ? t("tenant.request.waiting") : t("tenant.request.in_progress"), at: stamp(onHold ? "waiting" : "in_progress") },
    { key: "completed", label: t("tenant.request.completed"), at: stamp("completed") },
  ];
  const updates = r.timeline.filter((e) => e.note);
  return (
    <div className="space-y-4">
      <div>
        <p className="text-[12.5px] text-ink-3"><Num>{r.reference}</Num> · {r.unitLabel}</p>
        <h1 className="text-[22px] font-semibold leading-tight">{r.title}</h1>
        <div className="mt-2"><StatusBadge kind="request" status={r.tenantStatus} t={t} /></div>
      </div>
      <Card><CardBody className="py-4"><ProgressSteps steps={steps} current={onHold ? "in_progress" : r.tenantStatus === "received" ? "received" : r.tenantStatus} hold={onHold} /></CardBody></Card>
      <Card><CardBody>
        <p className="whitespace-pre-wrap text-[14.5px]">{r.description}</p>
        {r.photoFileIds.length > 0 ? <div className="mt-3 flex flex-wrap gap-2">{r.photoFileIds.map((f) => (
          <a key={f} href={`/api/files/${f}`} target="_blank" rel="noreferrer" className="block size-24 overflow-hidden rounded-md border border-line">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/files/${f}`} alt={t("maint.photo")} className="size-full object-cover" loading="lazy" />
          </a>))}</div> : null}
      </CardBody></Card>
      {updates.length > 0 ? (
        <Card>
          <CardBody>
            <h2 className="mb-2 text-[14px] font-semibold">{t("portal.updates")}</h2>
            <ol className="space-y-3">
              {updates.map((u, i) => (
                <li key={i} className="border-s-2 border-brass-500 ps-3">
                  <p className="text-[14px]">{u.note}</p>
                  <p className="text-[12px] text-ink-3">{formatDateTime(u.at, locale)}</p>
                </li>
              ))}
            </ol>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
