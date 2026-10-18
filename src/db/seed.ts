import { eq, sql } from "drizzle-orm";
import type { DB } from "./client";
import * as s from "./schema";
import { DEMO_PASSWORD } from "@/lib/demo";
import { addDays, addMonths, todayISO } from "@/lib/dates";
import { hashPassword } from "@/lib/password";
import { normalisePhone } from "@/lib/phone";
import { parseOMR } from "@/lib/money";
import type { Ctx } from "@/domain/context";
import type { Role } from "@/domain/permissions";
import { createBuilding, createOwner, createUnit, type OwnerInput } from "@/domain/portfolio";
import { createTenant } from "@/domain/tenants";
import { createContract, completeMoveOut, giveNotice, type ChequeRow } from "@/domain/contracts";
import { bounceCheque, collectCheque, promoteDueCheques, startFollowUp } from "@/domain/cheques";
import { completeRequest, performInspection, putOnHold, startWork, submitRequest } from "@/domain/maintenance";
import { generateSchedule, type PaymentFrequency } from "@/domain/finance";
import { seedCategories } from "@/domain/organisation";
import { saveFile } from "@/lib/storage";
import { makeDemoPng } from "./seed-assets";
import { writeAudit } from "@/domain/audit";

const BANKS = ["Bank Muscat", "Bank Dhofar", "National Bank of Oman", "Sohar International", "Oman Arab Bank", "Ahli Bank", "HSBC Oman"];
const omr = (v: string) => parseOMR(v) as number;

interface Seeded {
  orgId: string;
  users: Record<string, string>;
}

function userCtx(orgId: string, id: string, name: string, role: Role): Ctx {
  return { orgId, actor: { kind: "user", id, name, role } };
}

export async function resetDatabase(db: DB): Promise<void> {
  const tables = [
    "audit_log", "notifications", "message_templates", "attachments", "file_blobs", "files", "statements", "imports",
    "maintenance_events", "inspections", "maintenance_requests", "maintenance_categories", "online_payment_intents",
    "receipts", "payments", "cheques", "schedule_items", "security_deposits", "contracts", "units", "buildings",
    "receipt_counters", "owners", "otps", "sessions", "rate_limits", "tenants", "users", "sequences", "organisations",
  ];
  await db.execute(sql.raw(`TRUNCATE TABLE ${tables.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`));
}

export async function seedDemo(db: DB): Promise<Seeded> {
  const today = todayISO();
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  /* ------------------------------ Organisation A ------------------------------ */
  const [org] = await db
    .insert(s.organisations)
    .values({
      name: "Al Sahil Property Management",
      nameAr: "الساحل لإدارة العقارات",
      defaultLocale: "en",
      phone: normalisePhone("2449 1200"),
      email: "office@alsahil.demo",
      address: "Building 4120, Way 2109, Al Khuwair, Muscat",
      crNumber: "1234567",
      receiptPrefix: "R",
      defaultCommissionBp: 500,
      contractAlertDays: 60,
      rentIncreaseCapBp: 500,
      gatewayFeeBp: 200,
      onboardingCompletedAt: new Date(),
      isDemo: true,
    })
    .returning();
  await seedCategories(db, org.id);

  await db
    .insert(s.users)
    .values({ orgId: null, email: "platform@ijara.demo", name: "Platform Administrator", role: "platform_admin", passwordHash, locale: "en" });

  const staffDefs: { key: string; email: string; name: string; role: Role; phone: string; locale: "en" | "ar" }[] = [
    { key: "manager", email: "manager@alsahil.demo", name: "Khalid Al Rawahi", role: "manager", phone: "9210 4411", locale: "en" },
    { key: "accounts", email: "accounts@alsahil.demo", name: "Maryam Al Balushi", role: "accounts", phone: "9211 5522", locale: "en" },
    { key: "maintenance", email: "maintenance@alsahil.demo", name: "Salim Al Hinai", role: "maintenance", phone: "9212 6633", locale: "en" },
    { key: "maintenance2", email: "yousuf@alsahil.demo", name: "Yousuf Al Mamari", role: "maintenance", phone: "9213 7744", locale: "ar" },
    { key: "contracts", email: "contracts@alsahil.demo", name: "Aisha Al Kindi", role: "contracts", phone: "9214 8855", locale: "en" },
  ];
  const users: Record<string, { id: string; name: string; role: Role }> = {};
  for (const d of staffDefs) {
    const [u] = await db
      .insert(s.users)
      .values({ orgId: org.id, email: d.email, name: d.name, role: d.role, phone: normalisePhone(d.phone), passwordHash, locale: d.locale })
      .returning();
    users[d.key] = { id: u.id, name: u.name, role: d.role };
  }
  const mgr = userCtx(org.id, users.manager.id, users.manager.name, "manager");
  const tech = userCtx(org.id, users.maintenance.id, users.maintenance.name, "maintenance");
  const tech2 = userCtx(org.id, users.maintenance2.id, users.maintenance2.name, "maintenance");

  // Keep the seeded history quiet: staff alerts are switched back on at the end.
  const prefsBefore = org.notificationPrefs;
  await db
    .update(s.organisations)
    .set({ notificationPrefs: { ...prefsBefore, staffAlerts: { chequeDue: false, chequeBounced: false, maintenanceNew: false, contractExpiring: false } } })
    .where(eq(s.organisations.id, org.id));

  /* ---------------------------------- Owners ---------------------------------- */
  const ownerDefs: (OwnerInput & { key: string })[] = [
    { key: "said", nameEn: "Said bin Hamdan Al Harthy", nameAr: "سعيد بن حمدان الحارثي", phone: normalisePhone("9124 7788"), email: "said.harthy@example.om", commissionBp: 500, payoutFrequency: "monthly", receiptPrefix: "SH" },
    { key: "fatma", nameEn: "Fatma bint Nasser Al Lawati", nameAr: "فاطمة بنت ناصر اللواتي", phone: normalisePhone("9335 2210"), email: null, commissionBp: 800, payoutFrequency: "quarterly", receiptPrefix: "FL", rentIncreaseCapBp: 300 },
    { key: "wadi", nameEn: "Al Wadi Investment LLC", nameAr: "شركة الوادي للاستثمار ش.م.م", phone: normalisePhone("2456 9000"), email: "properties@alwadi.example.om", commissionBp: 600, payoutFrequency: "monthly", receiptPrefix: "WI" },
    { key: "mohammed", nameEn: "Mohammed bin Salim Al Busaidi", nameAr: "محمد بن سالم البوسعيدي", phone: normalisePhone("9987 1203"), email: null, commissionBp: 0, payoutFrequency: "other", receiptPrefix: "MB", notes: "Manages his own property through the office. No commission." },
  ];
  const owners: Record<string, string> = {};
  for (const o of ownerDefs) {
    const { key, ...input } = o;
    owners[key] = (await createOwner(db, mgr, input)).id;
  }

  /* -------------------------------- Buildings -------------------------------- */
  const buildingDefs = [
    { key: "khuwair", owner: "said", nameEn: "Al Khuwair Residence", nameAr: "مسكن الخوير", area: "Al Khuwair", address: "Way 3012, Al Khuwair" },
    { key: "qurum", owner: "said", nameEn: "Qurum Heights", nameAr: "مرتفعات القرم", area: "Qurum", address: "Way 4455, Qurum Heights" },
    { key: "seeb", owner: "fatma", nameEn: "Seeb Garden Villas", nameAr: "فلل حدائق السيب", area: "Al Seeb", address: "Block 7, Al Hail North" },
    { key: "bawshar", owner: "wadi", nameEn: "Bawshar Plaza", nameAr: "بوشر بلازا", area: "Bawshar", address: "Sultan Qaboos Street, Bawshar" },
    { key: "ghala", owner: "mohammed", nameEn: "Ghala Court", nameAr: "فناء غلا", area: "Ghala", address: "Way 1801, Ghala Industrial Road" },
  ];
  const buildings: Record<string, string> = {};
  for (const b of buildingDefs) {
    buildings[b.key] = (await createBuilding(db, mgr, { ownerId: owners[b.owner], nameEn: b.nameEn, nameAr: b.nameAr, area: b.area, address: b.address })).id;
  }

  /* ----------------------------------- Units ----------------------------------- */
  type UDef = { b: string; label: string; type: "apartment" | "villa" | "shop"; beds?: number; floor: string; rent: string; freq: PaymentFrequency };
  const unitDefs: UDef[] = [
    ...["A-101", "A-102", "A-103", "A-104", "A-105", "A-106"].map((label, i): UDef => ({ b: "khuwair", label, type: "apartment", beds: 2, floor: String(1 + Math.floor(i / 2)), rent: ["280", "290", "300", "285", "310", "320"][i], freq: "monthly" })),
    ...["Q-201", "Q-202", "Q-203", "Q-204", "Q-205", "Q-206", "Q-207", "Q-208"].map((label, i): UDef => ({ b: "qurum", label, type: "apartment", beds: 3, floor: String(2 + Math.floor(i / 4)), rent: ["420", "435", "440", "450", "455", "460", "470", "480"][i], freq: "monthly" })),
    ...["V-01", "V-02", "V-03", "V-04", "V-05"].map((label, i): UDef => ({ b: "seeb", label, type: "villa", beds: 4, floor: "G", rent: ["650", "680", "700", "720", "780"][i], freq: "quarterly" })),
    ...["P-301", "P-302", "P-303", "P-304", "P-305", "P-306"].map((label, i): UDef => ({ b: "bawshar", label, type: "apartment", beds: 2, floor: String(3 + Math.floor(i / 3)), rent: ["300", "310", "320", "325", "335", "340"][i], freq: "monthly" })),
    ...["S-01", "S-02", "S-03"].map((label, i): UDef => ({ b: "bawshar", label, type: "shop", floor: "G", rent: ["450", "520", "600"][i], freq: "quarterly" })),
    ...["G-1", "G-2", "G-3", "G-4"].map((label, i): UDef => ({ b: "ghala", label, type: "apartment", beds: 2, floor: "1", rent: ["240", "250", "260", "270"][i], freq: "monthly" })),
  ];
  const unitIds: Record<string, string> = {};
  for (const u of unitDefs) {
    const row = await createUnit(db, mgr, {
      buildingId: buildings[u.b],
      label: u.label,
      type: u.type,
      bedrooms: u.beds ?? null,
      floor: u.floor,
      rentBaisa: omr(u.rent),
    });
    unitIds[u.label] = row.id;
  }

  /* ---------------------------------- Tenants ---------------------------------- */
  const people: [string, string, string, string][] = [
    ["Hamad Al Siyabi", "حمد السيابي", "12345678", "ar"],
    ["Salim Al Kindi", "سالم الكندي", "10200417", "ar"],
    ["Khamis Al Mahrouqi", "خميس المحروقي", "10311562", "ar"],
    ["Badar Al Rashdi", "بدر الراشدي", "10417731", "ar"],
    ["Nasser Al Hinai", "ناصر الهنائي", "10522946", "ar"],
    ["Ahmed Al Balushi", "أحمد البلوشي", "10638125", "ar"],
    ["Zahra Al Lawati", "زهراء اللواتي", "10744308", "ar"],
    ["Mariam Al Jabri", "مريم الجابري", "10856491", "ar"],
    ["Said Al Maskari", "سعيد المسكري", "10961674", "ar"],
    ["Rashid Al Abri", "راشد العبري", "11072857", "ar"],
    ["Hilal Al Shukaili", "هلال الشكيلي", "11183040", "ar"],
    ["Khalfan Al Harrasi", "خلفان الحراصي", "11294223", "ar"],
    ["Sultan Al Wahaibi", "سلطان الوهيبي", "11305406", "ar"],
    ["Issa Al Amri", "عيسى العامري", "11416589", "ar"],
    ["Ali Al Zadjali", "علي الزدجالي", "11527772", "ar"],
    ["Yaqoob Al Farsi", "يعقوب الفارسي", "11638955", "ar"],
    ["Qais Al Hashmi", "قيس الهاشمي", "11749138", "ar"],
    ["Majid Al Riyami", "ماجد الريامي", "11850321", "ar"],
    ["Ibrahim Al Tobi", "إبراهيم الطوبي", "11961504", "ar"],
    ["Talal Al Busaidi", "طلال البوسعيدي", "12072687", "ar"],
    ["Haitham Al Ghailani", "هيثم الغيلاني", "12183870", "ar"],
    ["Younis Al Nabhani", "يونس النبهاني", "12294053", "ar"],
    ["Anwar Al Saadi", "أنور السعدي", "12305236", "ar"],
    ["Rajesh Kumar", "راجيش كومار", "P4829173", "en"],
    ["Maria Santos", "ماريا سانتوس", "P7391028", "en"],
    ["Suleiman Al Qasmi", "سليمان القاسمي", "12416419", "ar"],
    ["Fahad Al Mazrui", "فهد المزروعي", "12527602", "ar"],
    ["Nasra Al Ghafri", "نصرة الغافري", "87654321", "ar"],
  ];
  const tenantIds: string[] = [];
  for (let i = 0; i < people.length; i++) {
    const [en, ar, id, locale] = people[i];
    const t = await createTenant(db, mgr, {
      nameEn: en,
      nameAr: ar,
      phone: `9${String(1500000 + i * 7919).padStart(7, "0")}`,
      email: i % 4 === 0 ? `${en.toLowerCase().replace(/[^a-z]+/g, ".")}@example.om` : null,
      idNumber: id,
      locale: locale as "en" | "ar",
      consent: true,
    });
    tenantIds.push(t.id);
    // The last tenant stays inactive so the OTP activation flow can be demonstrated (ID 87654321, code 123456).
    if (id !== "87654321") {
      await db.update(s.tenants).set({ passwordHash, activatedAt: new Date() }).where(eq(s.tenants.id, t.id));
    }
  }

  /* --------------------------------- Contracts --------------------------------- */
  const special = {
    available: new Set(["A-106", "V-05", "S-03", "Q-207"]),
    underInspection: "Q-208",
    inspected: "G-4",
    reserved: "P-306",
    notice: "A-105",
    expiring: { "A-103": 24, "P-302": 51 } as Record<string, number>,
    bounce: new Set(["Q-204", "P-303"]),
  };
  const deltas = [-18, -11, -6, 3, 8, 13, 19, 24];
  let chequeNo = 482100;
  let tenantCursor = 0;
  const contractByUnit: Record<string, string> = {};
  const tenantByUnit: Record<string, string> = {};

  const rowsFor = (startDate: string, endDate: string, monthly: number, freq: PaymentFrequency): ChequeRow[] => {
    const bank = BANKS[chequeNo % BANKS.length];
    return generateSchedule({ startDate, endDate, monthlyRentBaisa: monthly, frequency: freq }).map((l) => ({
      seq: l.seq,
      chequeNumber: String(chequeNo++).padStart(6, "0"),
      bank,
      chequeDate: l.dueDate,
      amountBaisa: l.amountBaisa,
    }));
  };

  let occIndex = 0;
  for (const u of unitDefs) {
    if (special.available.has(u.label)) continue;
    const tenantId = tenantIds[tenantCursor++];
    tenantByUnit[u.label] = tenantId;
    let start: string;
    let end: string;
    if (u.label === special.reserved) {
      start = `${addMonths(today, 1).slice(0, 8)}01`;
      end = addDays(addMonths(start, 12), -1);
    } else if (special.expiring[u.label]) {
      end = addDays(today, special.expiring[u.label]);
      start = addMonths(addDays(end, 1), -12);
    } else {
      const m = 2 + (occIndex % 8);
      start = addDays(addMonths(today, -m), deltas[occIndex % deltas.length]);
      if (start > today) start = addDays(start, -30);
      end = addDays(addMonths(start, 12), -1);
      occIndex += 1;
    }
    // A few contracts have a cheque falling due today or in the last days, so the cheque queue is alive.
    const dueOffsets: Record<string, [number, number]> = {
      "A-101": [3, 0],
      "A-102": [4, 0],
      "Q-201": [5, 0],
      "Q-202": [2, 1],
      "Q-203": [6, 2],
      "Q-205": [3, 2],
      "A-104": [7, 1],
      "P-304": [4, 0],
    };
    if (dueOffsets[u.label]) {
      const [monthsBack, daysAgo] = dueOffsets[u.label];
      start = addMonths(addDays(today, -daysAgo), -monthsBack);
      end = addDays(addMonths(start, 12), -1);
    }
    if (u.label === special.underInspection || u.label === special.inspected || u.label === special.notice) {
      start = addMonths(today, -8);
      end = addDays(addMonths(start, 12), -1);
    }
    const monthly = omr(u.rent);
    const contract = await createContract(db, mgr, {
      unitId: unitIds[u.label],
      tenantId,
      startDate: start,
      endDate: end,
      monthlyRentBaisa: monthly,
      paymentFrequency: u.freq,
      cheques: rowsFor(start, end, monthly, u.freq),
      security: { amountBaisa: monthly, chequeNumber: String(chequeNo++).padStart(6, "0"), bank: BANKS[(chequeNo + 2) % BANKS.length], chequeDate: start },
      sanadReference: `SND-${start.slice(0, 4)}-${String(100000 + chequeNo)}`,
      electricityAccount: `${3100000 + chequeNo % 900000}`,
      waterAccount: `${5200000 + (chequeNo * 7) % 900000}`,
    });
    contractByUnit[u.label] = contract.id;
  }
  await promoteDueCheques(db, org.id);

  /* ---------------- Collect the past: receipts, payments, bounced cheques ---------------- */
  const cheques = await db.select().from(s.cheques).where(eq(s.cheques.orgId, org.id)).orderBy(s.cheques.chequeDate);
  const unitLabelById = Object.fromEntries(Object.entries(unitIds).map(([label, id]) => [id, label]));
  const lastPastByUnit = new Map<string, string>();
  for (const c of cheques) if (c.chequeDate <= addDays(today, -4)) lastPastByUnit.set(c.unitId, c.id);
  const accountsCtx = userCtx(org.id, users.accounts.id, users.accounts.name, "accounts");

  const bouncedIds: string[] = [];
  for (const c of cheques) {
    if (c.chequeDate > addDays(today, -4)) continue;
    const label = unitLabelById[c.unitId];
    if (special.bounce.has(label) && lastPastByUnit.get(c.unitId) === c.id) {
      await db.update(s.cheques).set({ status: "deposited", depositedOn: addDays(c.chequeDate, 1) }).where(eq(s.cheques.id, c.id));
      await bounceCheque(db, accountsCtx, c.id, "Insufficient funds", { on: addDays(c.chequeDate, 2) });
      bouncedIds.push(c.id);
      continue;
    }
    if (c.status === "due") await collectCheque(db, accountsCtx, c.id, { on: addDays(c.chequeDate, 1) });
  }
  if (bouncedIds[1]) await startFollowUp(db, accountsCtx, bouncedIds[1], "Tenant promised to replace the cheque this week. Called twice.");

  // Receipts carry the date of the payment they acknowledge.
  await db.execute(sql`update receipts r set issued_at = (select p.paid_on::timestamptz + interval '9 hours 30 minutes' from payments p where p.id = r.payment_id) where r.org_id = ${org.id}`);

  /* ------------------------ Notice, move-outs and inspections ------------------------ */
  await giveNotice(db, mgr, contractByUnit[special.notice], { noticeGivenOn: addDays(today, -10), moveOutDate: addDays(today, 21) });
  await giveNotice(db, mgr, contractByUnit[special.underInspection], { noticeGivenOn: addDays(today, -30), moveOutDate: addDays(today, -3) });
  const mo1 = await completeMoveOut(db, mgr, contractByUnit[special.underInspection], { actualDate: addDays(today, -3) });
  await giveNotice(db, mgr, contractByUnit[special.inspected], { noticeGivenOn: addDays(today, -35), moveOutDate: addDays(today, -6) });
  const mo2 = await completeMoveOut(db, mgr, contractByUnit[special.inspected], { actualDate: addDays(today, -6) });
  await performInspection(db, tech, mo2.inspection.id, {
    condition: "fair",
    findings: "Walls need touch-up paint in the living room. Bathroom tap slightly loose. Keys returned. Meter readings recorded.",
  });
  void mo1;

  /* ---------------------------------- Maintenance ---------------------------------- */
  const [cats] = [await db.select().from(s.maintenanceCategories).where(eq(s.maintenanceCategories.orgId, org.id))];
  const cat = (key: string) => cats.find((c) => c.key === key)!.id;
  const tenantCtx = (label: string): Ctx => {
    const idx = tenantIds.indexOf(tenantByUnit[label]);
    return { orgId: org.id, actor: { kind: "tenant", id: tenantByUnit[label], name: people[idx][0], role: "tenant" } };
  };
  const photo = async (color: [number, number, number], name: string) =>
    saveFile(db, { orgId: org.id, name, data: makeDemoPng(480, 320, color), category: "maintenance_photo" });

  const backdate = async (id: string, days: number) => {
    await db.execute(sql`
      update maintenance_requests set
        created_at = created_at - make_interval(days => ${days}),
        updated_at = updated_at - make_interval(days => ${days}),
        seen_at = seen_at - make_interval(days => ${days}),
        assigned_at = assigned_at - make_interval(days => ${days}),
        started_at = started_at - make_interval(days => ${days}),
        completed_at = completed_at - make_interval(days => ${days}),
        completed_on = completed_on - ${days}::int,
        cost_logged_at = cost_logged_at - make_interval(days => ${days}),
        posted_at = posted_at - make_interval(days => ${days})
      where id = ${id}`);
    await db.execute(sql`update maintenance_events set at = at - make_interval(days => ${days}) where request_id = ${id}`);
  };

  const done = async (label: string, who: Ctx, title: string, description: string, categoryKey: string, work: string, cost: string | null, daysAgo: number, tenantSubmit = true) => {
    const submitCtx = tenantSubmit ? tenantCtx(label) : mgr;
    const r = await submitRequest(db, submitCtx, { unitId: unitIds[label], tenantId: tenantByUnit[label], title, description, priority: "normal", categoryId: cat(categoryKey) });
    await startWork(db, who, r.id);
    await completeRequest(db, who, r.id, { categoryId: cat(categoryKey), workPerformed: work, costBaisa: cost === null ? null : omr(cost) });
    await backdate(r.id, daysAgo);
    return r;
  };

  const lastMonthDay = addDays(today, -Number(today.slice(8, 10)) - 3); // inside the previous calendar month
  const dAgo = (iso: string) => Math.max(1, Math.round((Date.parse(today) - Date.parse(iso)) / 86_400_000));
  await done("A-102", tech, "Water leak under the kitchen sink", "There is water under the sink cabinet every morning.", "plumbing", "Replaced the flexible hose and the sealing washer. Tested for leaks.", "18.500", dAgo(lastMonthDay) - 2);
  await done("A-102", tech, "Kitchen sink drain blocked", "Water drains very slowly.", "plumbing", "Cleared the drain line and flushed the trap.", "12.000", dAgo(lastMonthDay) + 18);
  await done("Q-203", tech2, "Bedroom AC making a loud noise", "The split unit in the master bedroom rattles when cooling.", "ac", "Cleaned the indoor coil and tightened the fan housing.", "35.000", dAgo(lastMonthDay) + 6);
  await done("Q-203", tech2, "AC not cooling", "The same unit stopped cooling.", "ac", "Recharged gas and replaced the capacitor.", "60.000", dAgo(lastMonthDay) - 3);
  await done("V-02", tech, "Garden irrigation timer faulty", "The irrigation does not start in the morning.", "electrical", "Replaced the timer relay and re-programmed the schedule.", "22.000", dAgo(lastMonthDay) + 2);
  await done("A-104", tech2, "Repaint the living room wall", "Water stain on the living room wall after the pipe repair.", "painting", "Sanded and repainted the affected wall, two coats.", "85.000", 9, false);
  await done("Q-206", tech2, "Broken bathroom shelf", "The glass shelf fell and broke.", "carpentry", "Removed the broken shelf. The tenant arranged and paid for a new one.", null, 6);
  await done("S-01", tech, "Shop signage light not working", "The front sign is dark in the evening.", "electrical", "Replaced the LED driver and tested the circuit.", "27.500", 5);

  // In progress
  const r1 = await submitRequest(db, tenantCtx("A-101"), { title: "AC not cooling in the living room", description: "The living room AC runs but the air is warm since yesterday.", priority: "normal", categoryId: cat("ac"), photoFileIds: [await photo([96, 128, 150], "ac-unit.png")] });
  await startWork(db, tech, r1.id);
  await backdate(r1.id, 2);

  // On hold with a note the tenant can read
  const r2 = await submitRequest(db, tenantCtx("G-2"), { title: "Loose tiles in the bathroom", description: "Three floor tiles near the shower moved and sound hollow.", priority: "normal", categoryId: cat("civil"), photoFileIds: [await photo([150, 140, 120], "tiles.png")] });
  await startWork(db, tech2, r2.id);
  await putOnHold(db, tech2, r2.id, "Waiting for matching tiles from the supplier. We expect them on Thursday and will finish the same day.");
  await backdate(r2.id, 3);

  // Completed by the office team, nothing charged to the owner yet
  const r3 = await submitRequest(db, tenantCtx("Q-205"), { title: "No hot water", description: "The water heater does not heat since the weekend.", priority: "urgent", categoryId: cat("plumbing") });
  await startWork(db, tech, r3.id);
  await completeRequest(db, tech, r3.id, { categoryId: cat("plumbing"), workPerformed: "Replaced the heating element and thermostat on the water heater.", costBaisa: omr("42.000"), tenantNote: "Hot water is back. Please tell us if the problem returns." });
  await backdate(r3.id, 4);

  // New requests waiting for the team
  await submitRequest(db, tenantCtx("P-301"), { title: "Main door lock is stuck", description: "The key turns but the door does not open easily. It got worse today.", priority: "urgent", categoryId: cat("carpentry"), photoFileIds: [await photo([120, 110, 100], "door-lock.png"), await photo([140, 130, 110], "door-frame.png")] });
  const r5 = await submitRequest(db, tenantCtx("P-304"), { title: "Corridor light flickering", description: "The light outside my door flickers at night.", priority: "normal", categoryId: cat("electrical") });
  await backdate(r5.id, 1);
  await submitRequest(db, mgr, { unitId: unitIds["Q-201"], tenantId: tenantByUnit["Q-201"], title: "Reported by phone: balcony door does not close", description: "Tenant called the office. The balcony sliding door is off its track.", priority: "normal", categoryId: cat("carpentry") });

  /* ---------------------------- Restore alert preferences ---------------------------- */
  await db.update(s.organisations).set({ notificationPrefs: prefsBefore }).where(eq(s.organisations.id, org.id));

  /* ------------------------------ Organisation B (isolation) ------------------------------ */
  const [orgB] = await db
    .insert(s.organisations)
    .values({ name: "Muscat Gate Real Estate", nameAr: "بوابة مسقط العقارية", defaultLocale: "ar", phone: normalisePhone("2411 3300"), receiptPrefix: "R", onboardingCompletedAt: new Date(), isDemo: true })
    .returning();
  await seedCategories(db, orgB.id);
  const [mgrB] = await db
    .insert(s.users)
    .values({ orgId: orgB.id, email: "manager@muscatgate.demo", name: "Hassan Al Zakwani", role: "manager", phone: normalisePhone("9220 3344"), passwordHash, locale: "ar" })
    .returning();
  const ctxB = userCtx(orgB.id, mgrB.id, mgrB.name, "manager");
  const ownerB = await createOwner(db, ctxB, { nameEn: "Badr Al Kharusi", nameAr: "بدر الخروصي", commissionBp: 700, payoutFrequency: "monthly", receiptPrefix: "BK", phone: normalisePhone("9330 1100") });
  const buildingB = await createBuilding(db, ctxB, { ownerId: ownerB.id, nameEn: "Mawaleh Towers", nameAr: "أبراج المعبيلة", area: "Al Mawaleh" });
  for (const [label, rent] of [["101", "230"], ["102", "240"], ["201", "250"]] as const) {
    await createUnit(db, ctxB, { buildingId: buildingB.id, label, type: "apartment", bedrooms: 2, rentBaisa: omr(rent) });
  }

  await writeAudit(db, mgr, { action: "seed.demo_loaded", entityType: "organisation", entityId: org.id, meta: { note: "Fictional demo data" } });

  return { orgId: org.id, users: Object.fromEntries(Object.entries(users).map(([k, v]) => [k, v.id])) };
}
