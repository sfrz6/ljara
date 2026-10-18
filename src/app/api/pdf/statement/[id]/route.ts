import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { statements } from "@/db/schema";
import { can } from "@/domain/permissions";
import type { StatementSnapshot } from "@/domain/statements";
import { statementHtml } from "@/lib/pdf/documents";
import { documentResponse, renderDocument } from "@/lib/pdf/render";
import { getSession } from "@/lib/session";
import { writeAudit } from "@/domain/audit";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Owner statement PDF. Managers only; owners have no login (CR-8.2). Tenants can never reach this. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session || session.kind !== "staff" || !session.user.orgId) return new NextResponse("Unauthorized", { status: 401 });
  if (!can(session.user.role, "statements:view")) return new NextResponse("Forbidden", { status: 403 });
  const db = await getDb();
  const [st] = await db.select().from(statements).where(and(eq(statements.id, id), eq(statements.orgId, session.user.orgId)));
  if (!st) return new NextResponse("Not found", { status: 404 });
  const url = new URL(req.url);
  const lang = url.searchParams.get("lang") === "en" ? "en" : url.searchParams.get("lang") === "ar" ? "ar" : st.locale;
  const doc = await renderDocument(statementHtml({ number: st.number, generatedAt: st.generatedAt, snapshot: st.snapshot as StatementSnapshot }, lang));
  if (url.searchParams.get("share")) {
    await db.update(statements).set({ lastSharedAt: new Date(), shareCount: st.shareCount + 1 }).where(eq(statements.id, st.id));
    await writeAudit(db, { orgId: st.orgId, actor: { kind: "user", id: session.user.id, name: session.user.name, role: session.user.role } }, {
      action: "statement.shared",
      entityType: "statement",
      entityId: st.id,
      meta: { via: url.searchParams.get("share"), owner: st.ownerId, from: st.periodFrom, to: st.periodTo, manager: session.user.name },
    });
  }
  return documentResponse(doc, `${st.number}-${lang}.pdf`);
}
