CREATE TYPE "public"."channel" AS ENUM('in_app', 'whatsapp', 'sms', 'email');--> statement-breakpoint
CREATE TYPE "public"."cheque_status" AS ENUM('received', 'due', 'deposited', 'collected', 'bounced', 'follow_up', 'written_off', 'returned');--> statement-breakpoint
CREATE TYPE "public"."contract_outcome" AS ENUM('renewed', 'moved_out', 'expired', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."contract_status" AS ENUM('pending', 'active', 'ended');--> statement-breakpoint
CREATE TYPE "public"."gateway_fee_mode" AS ENUM('office_absorbs', 'owner_net', 'owner_line');--> statement-breakpoint
CREATE TYPE "public"."import_status" AS ENUM('committed', 'rolled_back');--> statement-breakpoint
CREATE TYPE "public"."inspection_status" AS ENUM('pending', 'inspected', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."intent_status" AS ENUM('pending', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."locale" AS ENUM('en', 'ar');--> statement-breakpoint
CREATE TYPE "public"."maintenance_status" AS ENUM('submitted', 'seen', 'assigned', 'in_progress', 'completed', 'cost_logged', 'posted');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('queued', 'sent', 'delivered', 'failed');--> statement-breakpoint
CREATE TYPE "public"."org_status" AS ENUM('active', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."otp_purpose" AS ENUM('tenant_activation', 'tenant_reset', 'staff_reset', 'staff_2fa');--> statement-breakpoint
CREATE TYPE "public"."payment_frequency" AS ENUM('monthly', 'quarterly', 'semi_annual', 'annual');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('cheque', 'online', 'cash', 'bank_transfer');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('posted', 'voided');--> statement-breakpoint
CREATE TYPE "public"."payout_frequency" AS ENUM('monthly', 'quarterly', 'semi_annual', 'annual', 'other');--> statement-breakpoint
CREATE TYPE "public"."priority" AS ENUM('normal', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."receipt_kind" AS ENUM('receipt', 'credit_note');--> statement-breakpoint
CREATE TYPE "public"."receipt_status" AS ENUM('issued', 'voided');--> statement-breakpoint
CREATE TYPE "public"."recipient_kind" AS ENUM('user', 'tenant');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('platform_admin', 'manager', 'accounts', 'maintenance', 'contracts');--> statement-breakpoint
CREATE TYPE "public"."schedule_status" AS ENUM('open', 'paid', 'written_off', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."security_status" AS ENUM('held', 'returned', 'applied');--> statement-breakpoint
CREATE TYPE "public"."session_kind" AS ENUM('staff', 'tenant');--> statement-breakpoint
CREATE TYPE "public"."tenant_status" AS ENUM('active', 'former', 'archived');--> statement-breakpoint
CREATE TYPE "public"."unit_status" AS ENUM('available', 'reserved', 'occupied', 'notice_given', 'vacated', 'under_inspection', 'inspected');--> statement-breakpoint
CREATE TYPE "public"."unit_type" AS ENUM('apartment', 'villa', 'studio', 'shop', 'office', 'warehouse');--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"entity_type" varchar(40) NOT NULL,
	"entity_id" uuid NOT NULL,
	"kind" varchar(40) DEFAULT 'photo' NOT NULL,
	"internal" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"seq" bigserial PRIMARY KEY NOT NULL,
	"org_id" uuid,
	"actor_kind" varchar(16) NOT NULL,
	"actor_id" uuid,
	"actor_name" varchar(200),
	"actor_role" varchar(24),
	"action" varchar(80) NOT NULL,
	"entity_type" varchar(40) NOT NULL,
	"entity_id" varchar(64),
	"before" jsonb,
	"after" jsonb,
	"meta" jsonb,
	"elevated" boolean DEFAULT false NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "buildings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"name_en" varchar(200) NOT NULL,
	"name_ar" varchar(200),
	"area" varchar(120),
	"address" text,
	"notes" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cheques" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"schedule_item_id" uuid NOT NULL,
	"unit_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"cheque_number" varchar(40) NOT NULL,
	"bank" varchar(120) NOT NULL,
	"amount_baisa" bigint NOT NULL,
	"cheque_date" date NOT NULL,
	"status" "cheque_status" DEFAULT 'received' NOT NULL,
	"deposited_on" date,
	"collected_on" date,
	"bounced_on" date,
	"bounce_reason" text,
	"follow_up_note" text,
	"scan_file_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"reference" varchar(40) NOT NULL,
	"unit_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"monthly_rent_baisa" bigint NOT NULL,
	"payment_frequency" "payment_frequency" DEFAULT 'monthly' NOT NULL,
	"status" "contract_status" DEFAULT 'pending' NOT NULL,
	"outcome" "contract_outcome",
	"previous_contract_id" uuid,
	"renewed_to_id" uuid,
	"notice_given_on" date,
	"move_out_date" date,
	"ended_on" date,
	"signed_doc_file_id" uuid,
	"sanad_reference" varchar(80),
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "file_blobs" (
	"file_id" uuid PRIMARY KEY NOT NULL,
	"data" "bytea" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid,
	"name" varchar(255) NOT NULL,
	"mime" varchar(100) NOT NULL,
	"size" integer NOT NULL,
	"driver" varchar(16) NOT NULL,
	"storage_key" text,
	"category" varchar(40) DEFAULT 'document' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"entity" varchar(30) NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"status" "import_status" DEFAULT 'committed' NOT NULL,
	"total_rows" integer NOT NULL,
	"created_count" integer NOT NULL,
	"mapping" jsonb NOT NULL,
	"created" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rolled_back_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "inspections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"unit_id" uuid NOT NULL,
	"contract_id" uuid,
	"status" "inspection_status" DEFAULT 'pending' NOT NULL,
	"condition" varchar(20),
	"findings" text,
	"inspected_by" uuid,
	"inspected_at" timestamp with time zone,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maintenance_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"key" varchar(40) NOT NULL,
	"name_en" varchar(100) NOT NULL,
	"name_ar" varchar(100),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maintenance_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"status" "maintenance_status" NOT NULL,
	"actor_name" varchar(200),
	"actor_kind" varchar(20),
	"note" text,
	"internal" boolean DEFAULT false NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maintenance_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"reference" varchar(40) NOT NULL,
	"unit_id" uuid NOT NULL,
	"building_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"tenant_id" uuid,
	"title" varchar(200) NOT NULL,
	"description" text NOT NULL,
	"priority" "priority" DEFAULT 'normal' NOT NULL,
	"category_id" uuid,
	"status" "maintenance_status" DEFAULT 'submitted' NOT NULL,
	"created_by_user_id" uuid,
	"assigned_to_user_id" uuid,
	"seen_at" timestamp with time zone,
	"assigned_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"completed_on" date,
	"work_performed" text,
	"technician_notes" text,
	"cost_baisa" bigint,
	"cost_logged_at" timestamp with time zone,
	"posted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"key" varchar(60) NOT NULL,
	"locale" "locale" NOT NULL,
	"body" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"recipient_kind" "recipient_kind" NOT NULL,
	"recipient_id" uuid NOT NULL,
	"channel" "channel" NOT NULL,
	"template" varchar(60) NOT NULL,
	"locale" "locale" NOT NULL,
	"subject" varchar(300),
	"body" text NOT NULL,
	"to_address" varchar(200),
	"status" "notification_status" DEFAULT 'queued' NOT NULL,
	"idempotency_key" varchar(200) NOT NULL,
	"attempts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"provider_ref" varchar(100),
	"urgent" boolean DEFAULT false NOT NULL,
	"link" varchar(300),
	"related_type" varchar(40),
	"related_id" uuid,
	"scheduled_for" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "online_payment_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"schedule_item_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"amount_baisa" bigint NOT NULL,
	"fee_baisa" bigint DEFAULT 0 NOT NULL,
	"status" "intent_status" DEFAULT 'pending' NOT NULL,
	"gateway_ref" varchar(80) NOT NULL,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "organisations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"name_ar" varchar(200),
	"status" "org_status" DEFAULT 'active' NOT NULL,
	"default_locale" "locale" DEFAULT 'ar' NOT NULL,
	"logo_file_id" uuid,
	"phone" varchar(32),
	"email" varchar(200),
	"address" text,
	"cr_number" varchar(64),
	"default_commission_bp" integer DEFAULT 500 NOT NULL,
	"default_payout_frequency" "payout_frequency" DEFAULT 'monthly' NOT NULL,
	"receipt_prefix" varchar(12) DEFAULT 'R' NOT NULL,
	"rent_increase_cap_bp" integer,
	"contract_alert_days" integer DEFAULT 60 NOT NULL,
	"tenant_schedule_visible" boolean DEFAULT true NOT NULL,
	"online_payments_enabled" boolean DEFAULT true NOT NULL,
	"gateway_fee_bp" integer DEFAULT 200 NOT NULL,
	"gateway_fee_mode" "gateway_fee_mode" DEFAULT 'office_absorbs' NOT NULL,
	"vat_enabled" boolean DEFAULT false NOT NULL,
	"vat_bp" integer DEFAULT 500 NOT NULL,
	"notification_prefs" jsonb DEFAULT '{"channels":{"whatsapp":true,"sms":true,"email":true},"quietHours":{"enabled":false,"startHour":21,"endHour":7},"reminderDaysBefore":[7,1],"staffAlerts":{"chequeDue":true,"chequeBounced":true,"maintenanceNew":true,"contractExpiring":true}}'::jsonb NOT NULL,
	"onboarding_completed_at" timestamp with time zone,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "otps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purpose" "otp_purpose" NOT NULL,
	"subject_id" uuid NOT NULL,
	"phone" varchar(32),
	"code_hash" varchar(64) DEFAULT '' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "owners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name_en" varchar(200) NOT NULL,
	"name_ar" varchar(200),
	"phone" varchar(32),
	"email" varchar(200),
	"commission_bp" integer DEFAULT 500 NOT NULL,
	"payout_frequency" "payout_frequency" DEFAULT 'monthly' NOT NULL,
	"receipt_prefix" varchar(12) DEFAULT 'R' NOT NULL,
	"rent_increase_cap_bp" integer,
	"notes" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"unit_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"schedule_item_id" uuid NOT NULL,
	"cheque_id" uuid,
	"amount_baisa" bigint NOT NULL,
	"gateway_fee_baisa" bigint DEFAULT 0 NOT NULL,
	"method" "payment_method" NOT NULL,
	"reference" varchar(120),
	"paid_on" date NOT NULL,
	"status" "payment_status" DEFAULT 'posted' NOT NULL,
	"voided_at" timestamp with time zone,
	"recorded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" varchar(200) PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"window_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_until" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "receipt_counters" (
	"owner_id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"last_number" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"kind" "receipt_kind" DEFAULT 'receipt' NOT NULL,
	"number" integer NOT NULL,
	"display_number" varchar(40) NOT NULL,
	"amount_baisa" bigint NOT NULL,
	"status" "receipt_status" DEFAULT 'issued' NOT NULL,
	"related_receipt_id" uuid,
	"void_reason" text,
	"voided_at" timestamp with time zone,
	"voided_by" uuid,
	"locale" "locale" DEFAULT 'ar' NOT NULL,
	"snapshot" jsonb NOT NULL,
	"issued_by" uuid,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedule_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"unit_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"due_date" date NOT NULL,
	"amount_baisa" bigint NOT NULL,
	"status" "schedule_status" DEFAULT 'open' NOT NULL,
	"paid_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "security_deposits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"amount_baisa" bigint NOT NULL,
	"cheque_number" varchar(40),
	"bank" varchar(120),
	"cheque_date" date,
	"scan_file_id" uuid,
	"status" "security_status" DEFAULT 'held' NOT NULL,
	"resolved_on" date,
	"resolution_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sequences" (
	"key" varchar(120) PRIMARY KEY NOT NULL,
	"org_id" uuid,
	"value" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"kind" "session_kind" NOT NULL,
	"user_id" uuid,
	"tenant_id" uuid,
	"org_id" uuid,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"pending_2fa" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "statements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"number" varchar(40) NOT NULL,
	"period_from" date NOT NULL,
	"period_to" date NOT NULL,
	"locale" "locale" DEFAULT 'ar' NOT NULL,
	"snapshot" jsonb NOT NULL,
	"net_baisa" bigint NOT NULL,
	"generated_by" uuid,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_shared_at" timestamp with time zone,
	"share_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name_en" varchar(200) NOT NULL,
	"name_ar" varchar(200),
	"phone" varchar(32) NOT NULL,
	"email" varchar(200),
	"id_number" varchar(40) NOT NULL,
	"id_doc_file_id" uuid,
	"password_hash" text,
	"activated_at" timestamp with time zone,
	"status" "tenant_status" DEFAULT 'active' NOT NULL,
	"locale" "locale" DEFAULT 'ar' NOT NULL,
	"consent_at" timestamp with time zone,
	"internal_notes" text,
	"portal_access_until" date,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"building_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"label" varchar(60) NOT NULL,
	"label_ar" varchar(60),
	"floor" varchar(20),
	"type" "unit_type" DEFAULT 'apartment' NOT NULL,
	"bedrooms" integer,
	"commercial" boolean DEFAULT false NOT NULL,
	"rent_baisa" bigint NOT NULL,
	"status" "unit_status" DEFAULT 'available' NOT NULL,
	"status_since" timestamp with time zone DEFAULT now() NOT NULL,
	"rent_increase_cap_bp" integer,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid,
	"email" varchar(200) NOT NULL,
	"name" varchar(200) NOT NULL,
	"phone" varchar(32),
	"role" "role" NOT NULL,
	"password_hash" text NOT NULL,
	"two_factor_enabled" boolean DEFAULT false NOT NULL,
	"locale" "locale" DEFAULT 'ar' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cheques" ADD CONSTRAINT "cheques_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cheques" ADD CONSTRAINT "cheques_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cheques" ADD CONSTRAINT "cheques_schedule_item_id_schedule_items_id_fk" FOREIGN KEY ("schedule_item_id") REFERENCES "public"."schedule_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cheques" ADD CONSTRAINT "cheques_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cheques" ADD CONSTRAINT "cheques_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cheques" ADD CONSTRAINT "cheques_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_blobs" ADD CONSTRAINT "file_blobs_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports" ADD CONSTRAINT "imports_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_categories" ADD CONSTRAINT "maintenance_categories_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_events" ADD CONSTRAINT "maintenance_events_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_events" ADD CONSTRAINT "maintenance_events_request_id_maintenance_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."maintenance_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_category_id_maintenance_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."maintenance_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_assigned_to_user_id_users_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "online_payment_intents" ADD CONSTRAINT "online_payment_intents_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "online_payment_intents" ADD CONSTRAINT "online_payment_intents_schedule_item_id_schedule_items_id_fk" FOREIGN KEY ("schedule_item_id") REFERENCES "public"."schedule_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "online_payment_intents" ADD CONSTRAINT "online_payment_intents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owners" ADD CONSTRAINT "owners_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_schedule_item_id_schedule_items_id_fk" FOREIGN KEY ("schedule_item_id") REFERENCES "public"."schedule_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_cheque_id_cheques_id_fk" FOREIGN KEY ("cheque_id") REFERENCES "public"."cheques"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_counters" ADD CONSTRAINT "receipt_counters_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_counters" ADD CONSTRAINT "receipt_counters_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_items" ADD CONSTRAINT "schedule_items_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_items" ADD CONSTRAINT "schedule_items_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_items" ADD CONSTRAINT "schedule_items_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_items" ADD CONSTRAINT "schedule_items_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_items" ADD CONSTRAINT "schedule_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_deposits" ADD CONSTRAINT "security_deposits_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_deposits" ADD CONSTRAINT "security_deposits_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statements" ADD CONSTRAINT "statements_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statements" ADD CONSTRAINT "statements_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attach_entity_idx" ON "attachments" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_org_at_idx" ON "audit_log" USING btree ("org_id","at");--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_action_idx" ON "audit_log" USING btree ("action");--> statement-breakpoint
CREATE INDEX "buildings_org_idx" ON "buildings" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "buildings_owner_idx" ON "buildings" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "cheques_org_status_idx" ON "cheques" USING btree ("org_id","status","cheque_date");--> statement-breakpoint
CREATE INDEX "cheques_schedule_idx" ON "cheques" USING btree ("schedule_item_id");--> statement-breakpoint
CREATE INDEX "cheques_contract_idx" ON "cheques" USING btree ("contract_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contracts_org_ref_uq" ON "contracts" USING btree ("org_id","reference");--> statement-breakpoint
CREATE INDEX "contracts_org_status_idx" ON "contracts" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "contracts_unit_idx" ON "contracts" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "contracts_tenant_idx" ON "contracts" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "files_org_idx" ON "files" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "imports_org_idx" ON "imports" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "inspections_unit_idx" ON "inspections" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "inspections_org_status_idx" ON "inspections" USING btree ("org_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "mcat_org_key_uq" ON "maintenance_categories" USING btree ("org_id","key");--> statement-breakpoint
CREATE INDEX "mevent_request_idx" ON "maintenance_events" USING btree ("request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mreq_org_ref_uq" ON "maintenance_requests" USING btree ("org_id","reference");--> statement-breakpoint
CREATE INDEX "mreq_org_status_idx" ON "maintenance_requests" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "mreq_unit_idx" ON "maintenance_requests" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "mreq_owner_completed_idx" ON "maintenance_requests" USING btree ("owner_id","completed_on");--> statement-breakpoint
CREATE INDEX "mreq_tenant_idx" ON "maintenance_requests" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mtpl_uq" ON "message_templates" USING btree ("org_id","key","locale");--> statement-breakpoint
CREATE UNIQUE INDEX "notif_idem_uq" ON "notifications" USING btree ("org_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "notif_recipient_idx" ON "notifications" USING btree ("recipient_kind","recipient_id","created_at");--> statement-breakpoint
CREATE INDEX "notif_org_idx" ON "notifications" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "intent_ref_uq" ON "online_payment_intents" USING btree ("gateway_ref");--> statement-breakpoint
CREATE INDEX "intent_item_idx" ON "online_payment_intents" USING btree ("schedule_item_id");--> statement-breakpoint
CREATE INDEX "otps_subject_idx" ON "otps" USING btree ("subject_id","purpose");--> statement-breakpoint
CREATE INDEX "owners_org_idx" ON "owners" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "payments_org_paid_idx" ON "payments" USING btree ("org_id","owner_id","paid_on");--> statement-breakpoint
CREATE INDEX "payments_schedule_idx" ON "payments" USING btree ("schedule_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "receipts_owner_number_uq" ON "receipts" USING btree ("owner_id","number");--> statement-breakpoint
CREATE INDEX "receipts_org_idx" ON "receipts" USING btree ("org_id","issued_at");--> statement-breakpoint
CREATE INDEX "receipts_payment_idx" ON "receipts" USING btree ("payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "schedule_contract_seq_uq" ON "schedule_items" USING btree ("contract_id","seq");--> statement-breakpoint
CREATE INDEX "schedule_org_due_idx" ON "schedule_items" USING btree ("org_id","status","due_date");--> statement-breakpoint
CREATE INDEX "schedule_tenant_idx" ON "schedule_items" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "security_contract_uq" ON "security_deposits" USING btree ("contract_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_uq" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "statements_org_number_uq" ON "statements" USING btree ("org_id","number");--> statement-breakpoint
CREATE INDEX "statements_owner_idx" ON "statements" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tenants_org_idnumber_uq" ON "tenants" USING btree ("org_id","id_number");--> statement-breakpoint
CREATE UNIQUE INDEX "tenants_org_phone_uq" ON "tenants" USING btree ("org_id","phone");--> statement-breakpoint
CREATE INDEX "tenants_idnumber_idx" ON "tenants" USING btree ("id_number");--> statement-breakpoint
CREATE UNIQUE INDEX "units_building_label_uq" ON "units" USING btree ("building_id","label");--> statement-breakpoint
CREATE INDEX "units_org_status_idx" ON "units" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "units_owner_idx" ON "units" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_org_idx" ON "users" USING btree ("org_id");