import { beforeAll, describe, expect, it } from "vitest";
import { eq, and } from "drizzle-orm";
import * as s from "@/db/schema";
import { commitImport, rollbackImport, suggestMapping, templateCsv, validateImport } from "@/domain/imports";
import { buildWorld, type World } from "./fixtures";

let w: World;
beforeAll(async () => {
  w = await buildWorld();
});

const mapping = { name_en: "Name", phone: "Mobile", id_number: "Civil ID", language: "Lang" };

describe("CSV import (M-06)", () => {
  it("offers a template and suggests the column mapping", () => {
    expect(templateCsv("tenants").split("\n")[0]).toContain("id_number");
    expect(suggestMapping("tenants", ["Name", "Mobile", "Civil ID"])).toMatchObject({ name_en: "Name", phone: "Mobile", id_number: "Civil ID" });
  });

  it("reports row level errors, duplicates and normalises phones before anything is created", async () => {
    const rows = [
      { Name: "Saif Al Hosni", Mobile: "9123 9988", "Civil ID": "70000001", Lang: "ar" },
      { Name: "Bad Phone", Mobile: "12", "Civil ID": "70000002", Lang: "en" },
      { Name: "Dup Of Hamad", Mobile: "91500000", "Civil ID": "12345678", Lang: "en" },
      { Name: "Repeat In File", Mobile: "9123 9988", "Civil ID": "70000001", Lang: "en" },
    ];
    const res = await validateImport(w.db, w.ctx.manager, { entity: "tenants", mapping, rows });
    expect(res.total).toBe(4);
    expect(res.valid).toBe(1);
    expect(res.duplicates).toEqual([3]);
    expect(res.issues.some((i) => i.row === 2 && i.code === "invalid_phone")).toBe(true);
    expect(res.issues.some((i) => i.row === 4 && i.code === "duplicate_in_file")).toBe(true);
    const created = await w.db.select().from(s.tenants).where(eq(s.tenants.idNumber, "70000001"));
    expect(created).toHaveLength(0);
  });

  it("is atomic: a file with errors creates nothing, even for its valid rows", async () => {
    const rows = [
      { Name: "Good One", Mobile: "9123 7766", "Civil ID": "70000010", Lang: "en" },
      { Name: "Broken", Mobile: "nope", "Civil ID": "70000011", Lang: "en" },
    ];
    await expect(commitImport(w.db, w.ctx.manager, { entity: "tenants", mapping, rows, fileName: "x.csv", skipDuplicates: false })).rejects.toMatchObject({ code: "import_has_errors" });
    expect(await w.db.select().from(s.tenants).where(eq(s.tenants.idNumber, "70000010"))).toHaveLength(0);
  });

  it("commits a clean file, records history and can roll the latest import back", async () => {
    const rows = [
      { Name: "Faisal Al Amri", Mobile: "9123 1100", "Civil ID": "70000020", Lang: "ar" },
      { Name: "Laila Al Zaabi", Mobile: "9123 1101", "Civil ID": "70000021", Lang: "ar" },
    ];
    const rec = await commitImport(w.db, w.ctx.manager, { entity: "tenants", mapping, rows, fileName: "tenants.csv", skipDuplicates: false });
    expect(rec.createdCount).toBe(2);
    const t = await w.db.select().from(s.tenants).where(and(eq(s.tenants.orgId, w.orgId), eq(s.tenants.idNumber, "70000020")));
    expect(t[0].phone).toBe("+96891231100");

    await expect(rollbackImport(w.db, w.ctx.accounts, rec.id)).rejects.toMatchObject({ code: "forbidden" });
    await rollbackImport(w.db, w.ctx.manager, rec.id);
    expect(await w.db.select().from(s.tenants).where(eq(s.tenants.idNumber, "70000020"))).toHaveLength(0);
    const [after] = await w.db.select().from(s.imports).where(eq(s.imports.id, rec.id));
    expect(after.status).toBe("rolled_back");
  });

  it("refuses to roll back an import that is not the latest", async () => {
    const mk = (id: string, phone: string) => commitImport(w.db, w.ctx.manager, { entity: "tenants", mapping, rows: [{ Name: `T ${id}`, Mobile: phone, "Civil ID": id, Lang: "en" }], fileName: `${id}.csv`, skipDuplicates: false });
    const first = await mk("70000030", "9123 2200");
    await mk("70000031", "9123 2201");
    await expect(rollbackImport(w.db, w.ctx.manager, first.id)).rejects.toMatchObject({ code: "import_not_latest" });
  });
});
