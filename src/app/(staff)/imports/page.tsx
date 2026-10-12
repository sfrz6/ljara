import { desc, eq } from "drizzle-orm";
import { FileUp } from "lucide-react";
import { imports } from "@/db/schema";
import { ENTITY_FIELDS, IMPORT_ORDER } from "@/domain/imports";
import { requireStaff } from "@/lib/context";
import { formatDateTime } from "@/lib/dates";
import { Badge, Card, CardBody, CardHeader, EmptyState, Num, PageHeader } from "@/components/ui/display";
import { ActionDialog } from "@/components/ui/overlays";
import { rollbackImportAction } from "@/app/actions/imports";
import { ImportWizard } from "./wizard";

export const metadata = { title: "Data import" };

export default async function ImportsPage() {
  const s = await requireStaff("imports:manage");
  const { t, db, ctx, locale } = s;
  const history = await db.select().from(imports).where(eq(imports.orgId, ctx.orgId)).orderBy(desc(imports.createdAt)).limit(20);
  const latestCommitted = history.find((h) => h.status === "committed");
  const fields = Object.fromEntries(IMPORT_ORDER.map((e) => [e, ENTITY_FIELDS[e].map((f) => ({ key: f.key, required: f.required }))]));
  return (
    <>
      <PageHeader title={t("nav.imports")} description={t("import.page_hint")} />
      <ImportWizard fields={fields} order={IMPORT_ORDER} />
      <Card className="mt-6">
        <CardHeader title={t("import.history")} />
        {history.length === 0 ? <CardBody><EmptyState icon={<FileUp className="size-5" />} title={t("import.none")} /></CardBody> : (
          <ul className="divide-y divide-line">
            {history.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 md:px-5">
                <div><p className="text-[14px] font-medium">{t(`import.entity.${h.entity}` as never)} · <span className="text-ink-3">{h.fileName}</span></p><p className="text-[12.5px] text-ink-3">{formatDateTime(h.createdAt, locale)} · <Num>{h.createdCount}</Num> / <Num>{h.totalRows}</Num></p></div>
                <div className="flex items-center gap-2">
                  <Badge tone={h.status === "committed" ? "ok" : "neutral"}>{h.status === "committed" ? t("import.committed") : t("import.rolled_back")}</Badge>
                  {latestCommitted?.id === h.id ? <ActionDialog trigger={t("import.rollback")} triggerVariant="ghost" title={t("import.rollback")} description={t("import.rollback_hint")} action={rollbackImportAction} hidden={{ id: h.id }} submitVariant="danger" /> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
