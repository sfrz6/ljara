import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import puppeteer from "puppeteer-core";
import * as s from "../src/db/schema";
import { seedDemo } from "../src/db/seed";
import { generateStatement } from "../src/domain/statements";
import { statementHtml } from "../src/lib/pdf/documents";
import { renderPdf } from "../src/lib/pdf/render";
import { addMonths, todayISO } from "../src/lib/dates";
import { writeFileSync } from "node:fs";

(async () => {
  const db = drizzle(new PGlite(), { schema: s });
  await migrate(db, { migrationsFolder: "drizzle" });
  await seedDemo(db as never);
  const [owner] = await db.select().from(s.owners).where(eq(s.owners.receiptPrefix, "SH"));
  const [mgr] = await db.select().from(s.users).where(eq(s.users.email, "manager@alsahil.demo"));
  const ctx = { orgId: owner.orgId, actor: { kind: "user" as const, id: mgr.id, name: mgr.name, role: "manager" as const } };
  const st = await generateStatement(db as never, ctx, { ownerId: owner.id, from: addMonths(todayISO(), -1), to: todayISO(), locale: "ar" });
  console.log("net", st.netBaisa);
  for (const l of ["ar", "en"] as const) {
    const html = statementHtml({ number: st.number, generatedAt: st.generatedAt, snapshot: st.snapshot as never }, l);
    writeFileSync(`.data/statement-${l}.pdf`, await renderPdf(html));
    if (l === "ar") {
      const b = await puppeteer.launch({ executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
      const p = await b.newPage(); await p.setViewport({ width: 794, height: 1400 });
      await p.setContent(html); await p.evaluate(() => document.fonts.ready);
      await p.screenshot({ path: ".data/statement-ar.png" }); await b.close();
    }
  }
  process.exit(0);
})();
