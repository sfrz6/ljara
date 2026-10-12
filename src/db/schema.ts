import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ */
/* Types and enums                                                     */
/* ------------------------------------------------------------------ */

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

const baisa = (name: string) => bigint(name, { mode: "number" });
const id = () => uuid("id").primaryKey().default(sql`gen_random_uuid()`);
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const orgRef = () => uuid("org_id").notNull().references(() => organisations.id);

export const localeEnum = pgEnum("locale", ["en", "ar"]);
export const orgStatusEnum = pgEnum("org_status", ["active", "suspended"]);
export const roleEnum = pgEnum("role", ["platform_admin", "manager", "accounts", "maintenance", "contracts"]);
export const payoutFrequencyEnum = pgEnum("payout_frequency", ["monthly", "quarterly", "semi_annual", "annual", "other"]);
export const unitStatusEnum = pgEnum("unit_status", [
  "available",
  "reserved",
  "occupied",
  "notice_given",
  "vacated",
  "under_inspection",
  "inspected",
]);
export const unitTypeEnum = pgEnum("unit_type", ["apartment", "villa", "studio", "shop", "office", "warehouse"]);
export const contractStatusEnum = pgEnum("contract_status", ["pending", "active", "ended"]);
export const contractOutcomeEnum = pgEnum("contract_outcome", ["renewed", "moved_out", "expired", "cancelled"]);
export const paymentFrequencyEnum = pgEnum("payment_frequency", ["monthly", "quarterly", "semi_annual", "annual"]);
export const scheduleStatusEnum = pgEnum("schedule_status", ["open", "paid", "written_off", "cancelled"]);
export const chequeStatusEnum = pgEnum("cheque_status", [
  "received",
  "due",
  "deposited",
  "collected",
  "bounced",
  "follow_up",
  "written_off",
  "returned",
]);
export const securityStatusEnum = pgEnum("security_status", ["held", "returned", "applied"]);
export const paymentMethodEnum = pgEnum("payment_method", ["cheque", "online", "cash", "bank_transfer"]);
export const paymentStatusEnum = pgEnum("payment_status", ["posted", "voided"]);
export const receiptKindEnum = pgEnum("receipt_kind", ["receipt", "credit_note"]);
export const receiptStatusEnum = pgEnum("receipt_status", ["issued", "voided"]);
export const maintenanceStatusEnum = pgEnum("maintenance_status", [
  "submitted",
  "seen",
  "assigned",
  "in_progress",
  "completed",
  "cost_logged",
  "posted",
]);
export const priorityEnum = pgEnum("priority", ["normal", "urgent"]);
export const inspectionStatusEnum = pgEnum("inspection_status", ["pending", "inspected", "approved", "rejected"]);
export const channelEnum = pgEnum("channel", ["in_app", "whatsapp", "sms", "email"]);
export const notificationStatusEnum = pgEnum("notification_status", ["queued", "sent", "delivered", "failed"]);
export const recipientKindEnum = pgEnum("recipient_kind", ["user", "tenant"]);
export const sessionKindEnum = pgEnum("session_kind", ["staff", "tenant"]);
export const otpPurposeEnum = pgEnum("otp_purpose", ["tenant_activation", "tenant_reset", "staff_reset", "staff_2fa"]);
export const importStatusEnum = pgEnum("import_status", ["committed", "rolled_back"]);
export const tenantStatusEnum = pgEnum("tenant_status", ["active", "former", "archived"]);
export const gatewayFeeModeEnum = pgEnum("gateway_fee_mode", ["office_absorbs", "owner_net", "owner_line"]);
export const intentStatusEnum = pgEnum("intent_status", ["pending", "succeeded", "failed", "cancelled"]);

/* ------------------------------------------------------------------ */
/* Platform and identity                                               */
/* ------------------------------------------------------------------ */

export interface NotificationPrefs {
  channels: { whatsapp: boolean; sms: boolean; email: boolean };
  quietHours: { enabled: boolean; startHour: number; endHour: number };
  reminderDaysBefore: number[];
  staffAlerts: { chequeDue: boolean; chequeBounced: boolean; maintenanceNew: boolean; contractExpiring: boolean };
}

export const defaultNotificationPrefs: NotificationPrefs = {
  channels: { whatsapp: true, sms: true, email: true },
  quietHours: { enabled: false, startHour: 21, endHour: 7 },
  reminderDaysBefore: [7, 1],
  staffAlerts: { chequeDue: true, chequeBounced: true, maintenanceNew: true, contractExpiring: true },
};

export const organisations = pgTable("organisations", {
  id: id(),
  name: varchar("name", { length: 200 }).notNull(),
  nameAr: varchar("name_ar", { length: 200 }),
  status: orgStatusEnum("status").notNull().default("active"),
  defaultLocale: localeEnum("default_locale").notNull().default("ar"),
  logoFileId: uuid("logo_file_id"),
  phone: varchar("phone", { length: 32 }),
  email: varchar("email", { length: 200 }),
  address: text("address"),
  crNumber: varchar("cr_number", { length: 64 }),
  defaultCommissionBp: integer("default_commission_bp").notNull().default(500),
  defaultPayoutFrequency: payoutFrequencyEnum("default_payout_frequency").notNull().default("monthly"),
  receiptPrefix: varchar("receipt_prefix", { length: 12 }).notNull().default("R"),
  rentIncreaseCapBp: integer("rent_increase_cap_bp"),
  contractAlertDays: integer("contract_alert_days").notNull().default(60),
  tenantScheduleVisible: boolean("tenant_schedule_visible").notNull().default(true),
  onlinePaymentsEnabled: boolean("online_payments_enabled").notNull().default(true),
  gatewayFeeBp: integer("gateway_fee_bp").notNull().default(200),
  gatewayFeeMode: gatewayFeeModeEnum("gateway_fee_mode").notNull().default("office_absorbs"),
  vatEnabled: boolean("vat_enabled").notNull().default(false),
  vatBp: integer("vat_bp").notNull().default(500),
  notificationPrefs: jsonb("notification_prefs").$type<NotificationPrefs>().notNull().default(defaultNotificationPrefs),
  onboardingCompletedAt: timestamp("onboarding_completed_at", { withTimezone: true }),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: createdAt(),
});

export const users = pgTable(
  "users",
  {
    id: id(),
    orgId: uuid("org_id").references(() => organisations.id),
    email: varchar("email", { length: 200 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    phone: varchar("phone", { length: 32 }),
    role: roleEnum("role").notNull(),
    passwordHash: text("password_hash").notNull(),
    twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
    locale: localeEnum("locale").notNull().default("ar"),
    active: boolean("active").notNull().default(true),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("users_email_uq").on(t.email), index("users_org_idx").on(t.orgId)],
);

export const tenants = pgTable(
  "tenants",
  {
    id: id(),
    orgId: orgRef(),
    nameEn: varchar("name_en", { length: 200 }).notNull(),
    nameAr: varchar("name_ar", { length: 200 }),
    phone: varchar("phone", { length: 32 }).notNull(),
    email: varchar("email", { length: 200 }),
    idNumber: varchar("id_number", { length: 40 }).notNull(),
    idDocFileId: uuid("id_doc_file_id"),
    passwordHash: text("password_hash"),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    status: tenantStatusEnum("status").notNull().default("active"),
    locale: localeEnum("locale").notNull().default("ar"),
    consentAt: timestamp("consent_at", { withTimezone: true }),
    internalNotes: text("internal_notes"),
    portalAccessUntil: date("portal_access_until", { mode: "string" }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("tenants_org_idnumber_uq").on(t.orgId, t.idNumber),
    uniqueIndex("tenants_org_phone_uq").on(t.orgId, t.phone),
    index("tenants_idnumber_idx").on(t.idNumber),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    kind: sessionKindEnum("kind").notNull(),
    userId: uuid("user_id"),
    tenantId: uuid("tenant_id"),
    orgId: uuid("org_id"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    pending2fa: boolean("pending_2fa").notNull().default(false),
  },
  (t) => [uniqueIndex("sessions_token_uq").on(t.tokenHash), index("sessions_user_idx").on(t.userId)],
);

export const otps = pgTable(
  "otps",
  {
    id: id(),
    purpose: otpPurposeEnum("purpose").notNull(),
    subjectId: uuid("subject_id").notNull(),
    phone: varchar("phone", { length: 32 }),
    codeHash: varchar("code_hash", { length: 64 }).notNull().default(""),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("otps_subject_idx").on(t.subjectId, t.purpose)],
);

export const rateLimits = pgTable("rate_limits", {
  key: varchar("key", { length: 200 }).primaryKey(),
  count: integer("count").notNull().default(0),
  windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull().defaultNow(),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
});

/* ------------------------------------------------------------------ */
/* Files                                                               */
/* ------------------------------------------------------------------ */

export const files = pgTable(
  "files",
  {
    id: id(),
    orgId: uuid("org_id").references(() => organisations.id),
    name: varchar("name", { length: 255 }).notNull(),
    mime: varchar("mime", { length: 100 }).notNull(),
    size: integer("size").notNull(),
    driver: varchar("driver", { length: 16 }).notNull(),
    storageKey: text("storage_key"),
    category: varchar("category", { length: 40 }).notNull().default("document"),
    createdBy: uuid("created_by"),
    createdAt: createdAt(),
  },
  (t) => [index("files_org_idx").on(t.orgId)],
);

export const fileBlobs = pgTable("file_blobs", {
  fileId: uuid("file_id")
    .primaryKey()
    .references(() => files.id, { onDelete: "cascade" }),
  data: bytea("data").notNull(),
});

/* ------------------------------------------------------------------ */
/* Portfolio                                                           */
/* ------------------------------------------------------------------ */

export const owners = pgTable(
  "owners",
  {
    id: id(),
    orgId: orgRef(),
    nameEn: varchar("name_en", { length: 200 }).notNull(),
    nameAr: varchar("name_ar", { length: 200 }),
    phone: varchar("phone", { length: 32 }),
    email: varchar("email", { length: 200 }),
    commissionBp: integer("commission_bp").notNull().default(500),
    payoutFrequency: payoutFrequencyEnum("payout_frequency").notNull().default("monthly"),
    receiptPrefix: varchar("receipt_prefix", { length: 12 }).notNull().default("R"),
    rentIncreaseCapBp: integer("rent_increase_cap_bp"),
    notes: text("notes"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("owners_org_idx").on(t.orgId)],
);

/** One counter row per owner. Incremented under a row lock inside the receipt transaction (gap-free). */
export const receiptCounters = pgTable("receipt_counters", {
  ownerId: uuid("owner_id")
    .primaryKey()
    .references(() => owners.id),
  orgId: orgRef(),
  lastNumber: integer("last_number").notNull().default(0),
});

export const buildings = pgTable(
  "buildings",
  {
    id: id(),
    orgId: orgRef(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => owners.id),
    nameEn: varchar("name_en", { length: 200 }).notNull(),
    nameAr: varchar("name_ar", { length: 200 }),
    area: varchar("area", { length: 120 }),
    address: text("address"),
    notes: text("notes"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("buildings_org_idx").on(t.orgId), index("buildings_owner_idx").on(t.ownerId)],
);

export const units = pgTable(
  "units",
  {
    id: id(),
    orgId: orgRef(),
    buildingId: uuid("building_id")
      .notNull()
      .references(() => buildings.id),
    /** Denormalised from the building so reports never need a join to find the owner. */
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => owners.id),
    label: varchar("label", { length: 60 }).notNull(),
    labelAr: varchar("label_ar", { length: 60 }),
    floor: varchar("floor", { length: 20 }),
    type: unitTypeEnum("type").notNull().default("apartment"),
    bedrooms: integer("bedrooms"),
    commercial: boolean("commercial").notNull().default(false),
    rentBaisa: baisa("rent_baisa").notNull(),
    status: unitStatusEnum("status").notNull().default("available"),
    statusSince: timestamp("status_since", { withTimezone: true }).notNull().defaultNow(),
    rentIncreaseCapBp: integer("rent_increase_cap_bp"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("units_building_label_uq").on(t.buildingId, t.label),
    index("units_org_status_idx").on(t.orgId, t.status),
    index("units_owner_idx").on(t.ownerId),
  ],
);

/* ------------------------------------------------------------------ */
/* Contracts, schedule, cheques                                        */
/* ------------------------------------------------------------------ */

export const contracts = pgTable(
  "contracts",
  {
    id: id(),
    orgId: orgRef(),
    reference: varchar("reference", { length: 40 }).notNull(),
    unitId: uuid("unit_id")
      .notNull()
      .references(() => units.id),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => owners.id),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }).notNull(),
    monthlyRentBaisa: baisa("monthly_rent_baisa").notNull(),
    paymentFrequency: paymentFrequencyEnum("payment_frequency").notNull().default("monthly"),
    status: contractStatusEnum("status").notNull().default("pending"),
    outcome: contractOutcomeEnum("outcome"),
    previousContractId: uuid("previous_contract_id"),
    renewedToId: uuid("renewed_to_id"),
    noticeGivenOn: date("notice_given_on", { mode: "string" }),
    moveOutDate: date("move_out_date", { mode: "string" }),
    endedOn: date("ended_on", { mode: "string" }),
    signedDocFileId: uuid("signed_doc_file_id"),
    sanadReference: varchar("sanad_reference", { length: 80 }),
    notes: text("notes"),
    createdBy: uuid("created_by"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("contracts_org_ref_uq").on(t.orgId, t.reference),
    index("contracts_org_status_idx").on(t.orgId, t.status),
    index("contracts_unit_idx").on(t.unitId),
    index("contracts_tenant_idx").on(t.tenantId),
  ],
);

/** Held guarantee. Structurally separate from rent: it has no schedule item, no payment and no receipt. */
export const securityDeposits = pgTable(
  "security_deposits",
  {
    id: id(),
    orgId: orgRef(),
    contractId: uuid("contract_id")
      .notNull()
      .references(() => contracts.id),
    amountBaisa: baisa("amount_baisa").notNull(),
    chequeNumber: varchar("cheque_number", { length: 40 }),
    bank: varchar("bank", { length: 120 }),
    chequeDate: date("cheque_date", { mode: "string" }),
    scanFileId: uuid("scan_file_id"),
    status: securityStatusEnum("status").notNull().default("held"),
    resolvedOn: date("resolved_on", { mode: "string" }),
    resolutionNote: text("resolution_note"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("security_contract_uq").on(t.contractId)],
);

export const scheduleItems = pgTable(
  "schedule_items",
  {
    id: id(),
    orgId: orgRef(),
    contractId: uuid("contract_id")
      .notNull()
      .references(() => contracts.id),
    unitId: uuid("unit_id")
      .notNull()
      .references(() => units.id),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => owners.id),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    seq: integer("seq").notNull(),
    dueDate: date("due_date", { mode: "string" }).notNull(),
    amountBaisa: baisa("amount_baisa").notNull(),
    status: scheduleStatusEnum("status").notNull().default("open"),
    paidOn: date("paid_on", { mode: "string" }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("schedule_contract_seq_uq").on(t.contractId, t.seq),
    index("schedule_org_due_idx").on(t.orgId, t.status, t.dueDate),
    index("schedule_tenant_idx").on(t.tenantId),
  ],
);

export const cheques = pgTable(
  "cheques",
  {
    id: id(),
    orgId: orgRef(),
    contractId: uuid("contract_id")
      .notNull()
      .references(() => contracts.id),
    scheduleItemId: uuid("schedule_item_id")
      .notNull()
      .references(() => scheduleItems.id),
    unitId: uuid("unit_id")
      .notNull()
      .references(() => units.id),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => owners.id),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    chequeNumber: varchar("cheque_number", { length: 40 }).notNull(),
    bank: varchar("bank", { length: 120 }).notNull(),
    amountBaisa: baisa("amount_baisa").notNull(),
    chequeDate: date("cheque_date", { mode: "string" }).notNull(),
    status: chequeStatusEnum("status").notNull().default("received"),
    depositedOn: date("deposited_on", { mode: "string" }),
    collectedOn: date("collected_on", { mode: "string" }),
    bouncedOn: date("bounced_on", { mode: "string" }),
    bounceReason: text("bounce_reason"),
    followUpNote: text("follow_up_note"),
    scanFileId: uuid("scan_file_id"),
    createdAt: createdAt(),
  },
  (t) => [
    index("cheques_org_status_idx").on(t.orgId, t.status, t.chequeDate),
    index("cheques_schedule_idx").on(t.scheduleItemId),
    index("cheques_contract_idx").on(t.contractId),
  ],
);

export const payments = pgTable(
  "payments",
  {
    id: id(),
    orgId: orgRef(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => owners.id),
    contractId: uuid("contract_id")
      .notNull()
      .references(() => contracts.id),
    unitId: uuid("unit_id")
      .notNull()
      .references(() => units.id),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    /** A payment can only ever be made against a rent schedule item, never against a security deposit. */
    scheduleItemId: uuid("schedule_item_id")
      .notNull()
      .references(() => scheduleItems.id),
    chequeId: uuid("cheque_id").references(() => cheques.id),
    amountBaisa: baisa("amount_baisa").notNull(),
    gatewayFeeBaisa: baisa("gateway_fee_baisa").notNull().default(0),
    method: paymentMethodEnum("method").notNull(),
    reference: varchar("reference", { length: 120 }),
    paidOn: date("paid_on", { mode: "string" }).notNull(),
    status: paymentStatusEnum("status").notNull().default("posted"),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    recordedBy: uuid("recorded_by"),
    createdAt: createdAt(),
  },
  (t) => [
    index("payments_org_paid_idx").on(t.orgId, t.ownerId, t.paidOn),
    index("payments_schedule_idx").on(t.scheduleItemId),
  ],
);

export const receipts = pgTable(
  "receipts",
  {
    id: id(),
    orgId: orgRef(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => owners.id),
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => payments.id),
    kind: receiptKindEnum("kind").notNull().default("receipt"),
    number: integer("number").notNull(),
    displayNumber: varchar("display_number", { length: 40 }).notNull(),
    amountBaisa: baisa("amount_baisa").notNull(),
    status: receiptStatusEnum("status").notNull().default("issued"),
    /** For a credit note: the receipt it reverses. For a voided receipt: the credit note that reversed it. */
    relatedReceiptId: uuid("related_receipt_id"),
    voidReason: text("void_reason"),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidedBy: uuid("voided_by"),
    locale: localeEnum("locale").notNull().default("ar"),
    /** Frozen at issue time so the document never changes after the fact. */
    snapshot: jsonb("snapshot").$type<ReceiptSnapshot>().notNull(),
    issuedBy: uuid("issued_by"),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("receipts_owner_number_uq").on(t.ownerId, t.number),
    index("receipts_org_idx").on(t.orgId, t.issuedAt),
    index("receipts_payment_idx").on(t.paymentId),
  ],
);

export interface ReceiptSnapshot {
  orgName: string;
  orgNameAr: string | null;
  orgPhone: string | null;
  ownerName: string;
  ownerNameAr: string | null;
  tenantName: string;
  tenantNameAr: string | null;
  buildingName: string;
  buildingNameAr: string | null;
  unitLabel: string;
  contractReference: string;
  periodLabelDate: string;
  paidOn: string;
  method: "cheque" | "online" | "cash" | "bank_transfer";
  chequeNumber: string | null;
  bank: string | null;
  reference: string | null;
  logoFileId: string | null;
}

export const onlinePaymentIntents = pgTable(
  "online_payment_intents",
  {
    id: id(),
    orgId: orgRef(),
    scheduleItemId: uuid("schedule_item_id")
      .notNull()
      .references(() => scheduleItems.id),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    amountBaisa: baisa("amount_baisa").notNull(),
    feeBaisa: baisa("fee_baisa").notNull().default(0),
    status: intentStatusEnum("status").notNull().default("pending"),
    gatewayRef: varchar("gateway_ref", { length: 80 }).notNull(),
    failureReason: text("failure_reason"),
    createdAt: createdAt(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("intent_ref_uq").on(t.gatewayRef), index("intent_item_idx").on(t.scheduleItemId)],
);

/* ------------------------------------------------------------------ */
/* Maintenance                                                         */
/* ------------------------------------------------------------------ */

export const maintenanceCategories = pgTable(
  "maintenance_categories",
  {
    id: id(),
    orgId: orgRef(),
    key: varchar("key", { length: 40 }).notNull(),
    nameEn: varchar("name_en", { length: 100 }).notNull(),
    nameAr: varchar("name_ar", { length: 100 }),
    sortOrder: integer("sort_order").notNull().default(0),
    active: boolean("active").notNull().default(true),
  },
  (t) => [uniqueIndex("mcat_org_key_uq").on(t.orgId, t.key)],
);

export const maintenanceRequests = pgTable(
  "maintenance_requests",
  {
    id: id(),
    orgId: orgRef(),
    reference: varchar("reference", { length: 40 }).notNull(),
    unitId: uuid("unit_id")
      .notNull()
      .references(() => units.id),
    buildingId: uuid("building_id")
      .notNull()
      .references(() => buildings.id),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => owners.id),
    tenantId: uuid("tenant_id").references(() => tenants.id),
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description").notNull(),
    priority: priorityEnum("priority").notNull().default("normal"),
    categoryId: uuid("category_id").references(() => maintenanceCategories.id),
    status: maintenanceStatusEnum("status").notNull().default("submitted"),
    createdByUserId: uuid("created_by_user_id"),
    assignedToUserId: uuid("assigned_to_user_id").references(() => users.id),
    seenAt: timestamp("seen_at", { withTimezone: true }),
    assignedAt: timestamp("assigned_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completedOn: date("completed_on", { mode: "string" }),
    workPerformed: text("work_performed"),
    technicianNotes: text("technician_notes"),
    costBaisa: baisa("cost_baisa"),
    costLoggedAt: timestamp("cost_logged_at", { withTimezone: true }),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("mreq_org_ref_uq").on(t.orgId, t.reference),
    index("mreq_org_status_idx").on(t.orgId, t.status),
    index("mreq_unit_idx").on(t.unitId),
    index("mreq_owner_completed_idx").on(t.ownerId, t.completedOn),
    index("mreq_tenant_idx").on(t.tenantId),
  ],
);

export const maintenanceEvents = pgTable(
  "maintenance_events",
  {
    id: id(),
    orgId: orgRef(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => maintenanceRequests.id),
    status: maintenanceStatusEnum("status").notNull(),
    actorName: varchar("actor_name", { length: 200 }),
    actorKind: varchar("actor_kind", { length: 20 }),
    note: text("note"),
    internal: boolean("internal").notNull().default(false),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("mevent_request_idx").on(t.requestId)],
);

export const inspections = pgTable(
  "inspections",
  {
    id: id(),
    orgId: orgRef(),
    unitId: uuid("unit_id")
      .notNull()
      .references(() => units.id),
    contractId: uuid("contract_id").references(() => contracts.id),
    status: inspectionStatusEnum("status").notNull().default("pending"),
    condition: varchar("condition", { length: 20 }),
    findings: text("findings"),
    inspectedBy: uuid("inspected_by"),
    inspectedAt: timestamp("inspected_at", { withTimezone: true }),
    decidedBy: uuid("decided_by"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionNote: text("decision_note"),
    createdAt: createdAt(),
  },
  (t) => [index("inspections_unit_idx").on(t.unitId), index("inspections_org_status_idx").on(t.orgId, t.status)],
);

export const attachments = pgTable(
  "attachments",
  {
    id: id(),
    orgId: orgRef(),
    fileId: uuid("file_id")
      .notNull()
      .references(() => files.id),
    entityType: varchar("entity_type", { length: 40 }).notNull(),
    entityId: uuid("entity_id").notNull(),
    kind: varchar("kind", { length: 40 }).notNull().default("photo"),
    /** Photos attached by the tenant to a request are visible to the tenant; internal ones are not. */
    internal: boolean("internal").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("attach_entity_idx").on(t.entityType, t.entityId)],
);

/* ------------------------------------------------------------------ */
/* Statements                                                          */
/* ------------------------------------------------------------------ */

export const statements = pgTable(
  "statements",
  {
    id: id(),
    orgId: orgRef(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => owners.id),
    number: varchar("number", { length: 40 }).notNull(),
    periodFrom: date("period_from", { mode: "string" }).notNull(),
    periodTo: date("period_to", { mode: "string" }).notNull(),
    locale: localeEnum("locale").notNull().default("ar"),
    snapshot: jsonb("snapshot").$type<unknown>().notNull(),
    netBaisa: baisa("net_baisa").notNull(),
    generatedBy: uuid("generated_by"),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
    lastSharedAt: timestamp("last_shared_at", { withTimezone: true }),
    shareCount: integer("share_count").notNull().default(0),
  },
  (t) => [uniqueIndex("statements_org_number_uq").on(t.orgId, t.number), index("statements_owner_idx").on(t.ownerId)],
);

/* ------------------------------------------------------------------ */
/* Notifications, audit, imports, templates                            */
/* ------------------------------------------------------------------ */

export interface DeliveryAttempt {
  channel: "whatsapp" | "sms" | "email" | "in_app";
  status: "sent" | "failed" | "skipped";
  reason?: string;
  at: string;
}

export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    orgId: orgRef(),
    recipientKind: recipientKindEnum("recipient_kind").notNull(),
    recipientId: uuid("recipient_id").notNull(),
    channel: channelEnum("channel").notNull(),
    template: varchar("template", { length: 60 }).notNull(),
    locale: localeEnum("locale").notNull(),
    subject: varchar("subject", { length: 300 }),
    body: text("body").notNull(),
    toAddress: varchar("to_address", { length: 200 }),
    status: notificationStatusEnum("status").notNull().default("queued"),
    idempotencyKey: varchar("idempotency_key", { length: 200 }).notNull(),
    attempts: jsonb("attempts").$type<DeliveryAttempt[]>().notNull().default([]),
    providerRef: varchar("provider_ref", { length: 100 }),
    urgent: boolean("urgent").notNull().default(false),
    link: varchar("link", { length: 300 }),
    relatedType: varchar("related_type", { length: 40 }),
    relatedId: uuid("related_id"),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("notif_idem_uq").on(t.orgId, t.idempotencyKey),
    index("notif_recipient_idx").on(t.recipientKind, t.recipientId, t.createdAt),
    index("notif_org_idx").on(t.orgId, t.createdAt),
  ],
);

export const messageTemplates = pgTable(
  "message_templates",
  {
    id: id(),
    orgId: orgRef(),
    key: varchar("key", { length: 60 }).notNull(),
    locale: localeEnum("locale").notNull(),
    body: text("body").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("mtpl_uq").on(t.orgId, t.key, t.locale)],
);

/** Append only. A database trigger (see drizzle/ custom migration) rejects UPDATE and DELETE. */
export const auditLog = pgTable(
  "audit_log",
  {
    seq: bigserial("seq", { mode: "number" }).primaryKey(),
    orgId: uuid("org_id"),
    actorKind: varchar("actor_kind", { length: 16 }).notNull(),
    actorId: uuid("actor_id"),
    actorName: varchar("actor_name", { length: 200 }),
    actorRole: varchar("actor_role", { length: 24 }),
    action: varchar("action", { length: 80 }).notNull(),
    entityType: varchar("entity_type", { length: 40 }).notNull(),
    entityId: varchar("entity_id", { length: 64 }),
    before: jsonb("before"),
    after: jsonb("after"),
    meta: jsonb("meta"),
    /** Financial and security events are kept at an elevated retention class. */
    elevated: boolean("elevated").notNull().default(false),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_org_at_idx").on(t.orgId, t.at),
    index("audit_entity_idx").on(t.entityType, t.entityId),
    index("audit_action_idx").on(t.action),
  ],
);

export const imports = pgTable(
  "imports",
  {
    id: id(),
    orgId: orgRef(),
    entity: varchar("entity", { length: 30 }).notNull(),
    fileName: varchar("file_name", { length: 255 }).notNull(),
    status: importStatusEnum("status").notNull().default("committed"),
    totalRows: integer("total_rows").notNull(),
    createdCount: integer("created_count").notNull(),
    mapping: jsonb("mapping").$type<Record<string, string>>().notNull(),
    created: jsonb("created").$type<{ table: string; id: string }[]>().notNull().default([]),
    createdBy: uuid("created_by"),
    createdAt: createdAt(),
    rolledBackAt: timestamp("rolled_back_at", { withTimezone: true }),
  },
  (t) => [index("imports_org_idx").on(t.orgId, t.createdAt)],
);

export const sequences = pgTable("sequences", {
  key: varchar("key", { length: 120 }).primaryKey(),
  orgId: uuid("org_id"),
  value: integer("value").notNull().default(0),
});
