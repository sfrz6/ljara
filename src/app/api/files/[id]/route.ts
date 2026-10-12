import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { attachments, maintenanceRequests } from "@/db/schema";
import { can, type Role } from "@/domain/permissions";
import { loadFileMeta, readFileBytes } from "@/lib/storage";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

const STAFF_ACCESS: Record<string, Role[]> = {
  id_doc: ["manager", "contracts", "accounts"],
  cheque_scan: ["manager", "accounts", "contracts"],
  contract: ["manager", "contracts", "accounts"],
  maintenance_photo: ["manager", "maintenance"],
  inspection_photo: ["manager", "maintenance"],
  document: ["manager", "contracts", "accounts"],
};

/** Every file download is permission checked and organisation scoped; storage addresses are never public. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  const db = await getDb();
  const file = await loadFileMeta(db, id);
  if (!file) return new NextResponse("Not found", { status: 404 });
  const orgId = session.kind === "staff" ? session.user.orgId : session.tenant.orgId;
  if (!file.orgId || file.orgId !== orgId) return new NextResponse("Not found", { status: 404 });

  let allowed = false;
  if (file.category === "logo") allowed = true;
  else if (session.kind === "staff") allowed = (STAFF_ACCESS[file.category] ?? []).includes(session.user.role) && can(session.user.role, "dashboard:view");
  else {
    // A tenant may only open photos attached (and not marked internal) to their own maintenance requests.
    const rows = await db
      .select({ tenantId: maintenanceRequests.tenantId })
      .from(attachments)
      .innerJoin(maintenanceRequests, eq(maintenanceRequests.id, attachments.entityId))
      .where(and(eq(attachments.fileId, id), eq(attachments.entityType, "maintenance_request"), eq(attachments.internal, false)));
    allowed = rows.some((r) => r.tenantId === session.tenant.id);
  }
  if (!allowed) return new NextResponse("Not found", { status: 404 });

  const bytes = await readFileBytes(db, file);
  if (!bytes) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": file.mime,
      "Content-Disposition": `inline; filename="${encodeURIComponent(file.name)}"`,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
