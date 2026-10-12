"use server";

import { z } from "zod";
import { commitImport, rollbackImport, validateImport, type ImportEntity } from "@/domain/imports";
import { parseForm, staffAction } from "@/lib/action";

const base = z.object({
  entity: z.enum(["owners", "buildings", "units", "tenants", "contracts", "cheques"]),
  mapping: z.string(),
  rows: z.string(),
  fileName: z.string().optional(),
  skipDuplicates: z.string().optional(),
});

function parsed(v: z.infer<typeof base>) {
  return { entity: v.entity as ImportEntity, mapping: JSON.parse(v.mapping) as Record<string, string>, rows: JSON.parse(v.rows) as Record<string, string>[] };
}

export const previewImportAction = staffAction("imports:manage", async ({ c, form, t }) => {
  const v = parseForm(base, form, t);
  const result = await validateImport(c.db, c.ctx, parsed(v));
  return { data: { result } };
});

export const commitImportAction = staffAction("imports:manage", async ({ c, form, t }) => {
  const v = parseForm(base, form, t);
  await commitImport(c.db, c.ctx, { ...parsed(v), fileName: v.fileName ?? "import.csv", skipDuplicates: !!v.skipDuplicates });
  return { message: "msg.import_done", redirectTo: "/imports" };
});

export const rollbackImportAction = staffAction("imports:manage", async ({ c, form, t }) => {
  const { id } = parseForm(z.object({ id: z.string().uuid() }), form, t);
  await rollbackImport(c.db, c.ctx, id);
  return { message: "msg.import_rolled_back", revalidate: ["/imports"] };
});
