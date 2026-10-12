import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { receipts, payments } from "@/db/schema";
import { can } from "@/domain/permissions";
import { receiptHtml } from "@/lib/pdf/documents";
import { renderPdf } from "@/lib/pdf/render";
import { getSession } from "@/lib/session";
import { writeAudit } from "@/domain/audit";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Receipt PDF. Staff with receipt access, or the tenant who owns the payment. Never anyone else. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  const db = await getDb();
  const orgId = session.kind === "staff" ? session.user.orgId : session.tenant.orgId;
  if (!orgId) return new NextResponse("Forbidden", { status: 403 });
  if (session.kind === "staff" && !can(session.user.role, "receipts:view")) return new NextResponse("Forbidden", { status: 403 });

  const [r] = await db.select().from(receipts).where(and(eq(receipts.id, id), eq(receipts.orgId, orgId)));
  if (!r) return new NextResponse("Not found", { status: 404 });
  if (session.kind === "tenant") {
    const [p] = await db.select({ tenantId: payments.tenantId }).from(payments).where(eq(payments.id, r.paymentId));
    if (p?.tenantId !== session.tenant.id || r.status !== "issued" || r.kind !== "receipt") {
      await writeAudit(db, { orgId, actor: { kind: "tenant", id: session.tenant.id, name: session.tenant.nameEn, role: "tenant" } }, { action: "access.refused", entityType: "receipt", entityId: id });
      return new NextResponse("Not found", { status: 404 });
    }
  }
  let relatedNumber: string | null = null;
  if (r.relatedReceiptId) {
    const [rel] = await db.select({ n: receipts.displayNumber }).from(receipts).where(eq(receipts.id, r.relatedReceiptId));
    relatedNumber = rel?.n ?? null;
  }
  const url = new URL(req.url);
  const lang = url.searchParams.get("lang") === "en" ? "en" : url.searchParams.get("lang") === "ar" ? "ar" : r.locale;
  const html = receiptHtml({ displayNumber: r.displayNumber, kind: r.kind, status: r.status, amountBaisa: r.amountBaisa, snapshot: r.snapshot, issuedAt: r.issuedAt, voidReason: r.voidReason, relatedNumber }, lang);
  const pdf = await renderPdf(html);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${r.displayNumber}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
