import { NextResponse } from "next/server";
import { ENTITY_FIELDS, templateCsv, type ImportEntity } from "@/domain/imports";
import { can } from "@/domain/permissions";
import { getSession } from "@/lib/session";

export async function GET(_req: Request, { params }: { params: Promise<{ entity: string }> }) {
  const { entity } = await params;
  const session = await getSession();
  if (!session || session.kind !== "staff" || !can(session.user.role, "imports:manage")) return new NextResponse("Forbidden", { status: 403 });
  if (!(entity in ENTITY_FIELDS)) return new NextResponse("Not found", { status: 404 });
  return new NextResponse("﻿" + templateCsv(entity as ImportEntity), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="ijara-${entity}-template.csv"` },
  });
}
