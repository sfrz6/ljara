import { requireStaff } from "@/lib/context";
import { PageHeader, Card, CardBody } from "@/components/ui/display";
import { NewTenantForm } from "./form";

export default async function NewTenantPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requireStaff("tenants:manage");
  const sp = await searchParams;
  return (
    <>
      <PageHeader title={s.t("tenant.add")} description={s.t("tenant.add_hint")} breadcrumbs={[{ href: "/tenants", label: s.t("nav.tenants") }, { label: s.t("tenant.add") }]} />
      <Card className="max-w-3xl"><CardBody><NewTenantForm next={sp.next} /></CardBody></Card>
    </>
  );
}
