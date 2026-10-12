import { requireTenant } from "@/lib/context";
import { tenantRequestDetail } from "@/domain/portal";
import { DomainError } from "@/domain/errors";
import { notFound } from "next/navigation";
import { formatDateTime } from "@/lib/dates";
import { Card, CardBody, Num } from "@/components/ui/display";
import { Stepper } from "@/components/ui/stepper";
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
  const order = ["received", "assigned", "in_progress", "completed"] as const;
  const steps = order.map((k) => ({ key: k, label: t(`tenant.request.${k}` as never), at: r.timeline.find((x) => x.status === k) ? formatDateTime(r.timeline.find((x) => x.status === k)!.at, locale) : undefined }));
  return (
    <div className="space-y-4">
      <div>
        <p className="text-[12.5px] text-ink-3"><Num>{r.reference}</Num> · {r.unitLabel}</p>
        <h1 className="text-[22px] font-semibold leading-tight">{r.title}</h1>
        <div className="mt-2"><StatusBadge kind="request" status={r.tenantStatus} t={t} /></div>
      </div>
      <Card><CardBody><Stepper steps={steps} current={r.tenantStatus} /></CardBody></Card>
      <Card><CardBody>
        <p className="whitespace-pre-wrap text-[14.5px]">{r.description}</p>
        {r.photoFileIds.length > 0 ? <div className="mt-3 flex flex-wrap gap-2">{r.photoFileIds.map((f) => (
          <a key={f} href={`/api/files/${f}`} target="_blank" rel="noreferrer" className="block size-24 overflow-hidden rounded-md border border-line">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/files/${f}`} alt={t("maint.photo")} className="size-full object-cover" loading="lazy" />
          </a>))}</div> : null}
      </CardBody></Card>
    </div>
  );
}
