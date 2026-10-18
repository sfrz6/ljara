/** Pure import field definitions. Safe to use in the browser. */
export type ImportEntity = "owners" | "buildings" | "units" | "tenants" | "contracts" | "cheques";

export interface FieldDef {
  key: string;
  required: boolean;
  example: string;
  /** Header names that auto-map to this field (lowercase, no spaces). */
  aliases: string[];
}

export const ENTITY_FIELDS: Record<ImportEntity, FieldDef[]> = {
  owners: [
    { key: "name_en", required: true, example: "Said Al Harthy", aliases: ["name", "nameen", "ownername", "owner", "الاسم"] },
    { key: "name_ar", required: false, example: "سعيد الحارثي", aliases: ["namear", "arabicname"] },
    { key: "phone", required: false, example: "9123 4567", aliases: ["mobile", "tel", "phonenumber", "الهاتف"] },
    { key: "email", required: false, example: "owner@example.om", aliases: ["mail"] },
    { key: "commission_percent", required: true, example: "5", aliases: ["commission", "fee", "managementfee", "commissionrate"] },
    { key: "payout_frequency", required: false, example: "monthly", aliases: ["payout", "frequency"] },
    { key: "receipt_prefix", required: true, example: "SH", aliases: ["prefix", "receiptseries"] },
  ],
  buildings: [
    { key: "owner_name", required: true, example: "Said Al Harthy", aliases: ["owner", "ownername"] },
    { key: "name_en", required: true, example: "Al Khuwair Residence", aliases: ["name", "building", "buildingname"] },
    { key: "name_ar", required: false, example: "مسكن الخوير", aliases: ["namear"] },
    { key: "area", required: false, example: "Al Khuwair", aliases: ["location", "district", "wilayat"] },
    { key: "address", required: false, example: "Way 3012, Al Khuwair", aliases: ["street"] },
  ],
  units: [
    { key: "building_name", required: true, example: "Al Khuwair Residence", aliases: ["building", "buildingname"] },
    { key: "unit_label", required: true, example: "A-101", aliases: ["unit", "unitno", "unitnumber", "flat", "label"] },
    { key: "type", required: false, example: "apartment", aliases: ["unittype"] },
    { key: "bedrooms", required: false, example: "2", aliases: ["beds", "bedroom", "br"] },
    { key: "floor", required: false, example: "1", aliases: ["level"] },
    { key: "monthly_rent_omr", required: true, example: "280.000", aliases: ["rent", "monthlyrent", "rentomr", "amount"] },
  ],
  tenants: [
    { key: "name_en", required: true, example: "Hamad Al Siyabi", aliases: ["name", "tenant", "tenantname"] },
    { key: "name_ar", required: false, example: "حمد السيابي", aliases: ["namear"] },
    { key: "phone", required: true, example: "9234 5678", aliases: ["mobile", "tel", "phonenumber"] },
    { key: "email", required: false, example: "tenant@example.om", aliases: ["mail"] },
    { key: "id_number", required: true, example: "12345678", aliases: ["id", "idcard", "idcardnumber", "civilid", "nationalid"] },
    { key: "language", required: false, example: "ar", aliases: ["lang", "locale"] },
  ],
  contracts: [
    { key: "building_name", required: true, example: "Al Khuwair Residence", aliases: ["building"] },
    { key: "unit_label", required: true, example: "A-101", aliases: ["unit", "unitno"] },
    { key: "tenant_id_number", required: true, example: "12345678", aliases: ["tenantid", "idnumber", "id"] },
    { key: "start_date", required: true, example: "2026-01-01", aliases: ["start", "from", "begin"] },
    { key: "end_date", required: true, example: "2026-12-31", aliases: ["end", "to", "expiry"] },
    { key: "monthly_rent_omr", required: true, example: "280.000", aliases: ["rent", "monthlyrent", "amount"] },
    { key: "payment_frequency", required: false, example: "monthly", aliases: ["frequency", "payment"] },
    { key: "security_deposit_omr", required: false, example: "280.000", aliases: ["security", "deposit", "securitydeposit"] },
    { key: "electricity_account", required: false, example: "1234567", aliases: ["electricity", "electricityno", "electricityaccountnumber"] },
    { key: "water_account", required: false, example: "7654321", aliases: ["water", "waterno", "wateraccountnumber"] },
  ],
  cheques: [
    { key: "tenant_id_number", required: true, example: "12345678", aliases: ["tenantid", "idnumber", "id"] },
    { key: "cheque_number", required: true, example: "000123", aliases: ["number", "chequeno", "chqno"] },
    { key: "bank", required: true, example: "Bank Muscat", aliases: ["bankname"] },
    { key: "cheque_date", required: true, example: "2026-02-01", aliases: ["date", "duedate"] },
    { key: "amount_omr", required: true, example: "280.000", aliases: ["amount", "value"] },
  ],
};

export function templateCsv(entity: ImportEntity): string {
  const f = ENTITY_FIELDS[entity];
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return `${f.map((x) => x.key).join(",")}\n${f.map((x) => esc(x.example)).join(",")}\n`;
}

/** Suggest a mapping from CSV headers to field keys. */
export function suggestMapping(entity: ImportEntity, headers: string[]): Record<string, string> {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9؀-ۿ]/g, "");
  const out: Record<string, string> = {};
  for (const f of ENTITY_FIELDS[entity]) {
    const match = headers.find((h) => {
      const n = norm(h);
      return n === norm(f.key) || f.aliases.includes(n);
    });
    if (match) out[f.key] = match;
  }
  return out;
}

