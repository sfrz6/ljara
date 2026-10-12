import { and, eq } from "drizzle-orm";
import { maintenanceCategories } from "@/db/schema";
import { requireTenant } from "@/lib/context";
import { pickName } from "@/i18n";
import { Card, CardBody } from "@/components/ui/display";
import { TenantRequestForm } from "./form";

export const metadata = { title: "New request" };

export default async function NewTenantRequest() {
  const s = await requireTenant();
  const cats = await s.db.select().from(maintenanceCategories).where(and(eq(maintenanceCategories.orgId, s.tenant.orgId), eq(maintenanceCategories.active, true)));
  return (
    <div className="space-y-4">
      <h1 className="text-[22px] font-semibold">{s.t("portal.report_issue")}</h1>
      <Card><CardBody><TenantRequestForm categories={cats.map((c) => ({ id: c.id, label: pickName(s.locale, c.nameEn, c.nameAr) }))} /></CardBody></Card>
    </div>
  );
}
