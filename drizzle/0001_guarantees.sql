-- Custom migration: database level guarantees that must hold regardless of application code.

-- 1. The audit log is append only. No role can update or delete a row.
CREATE OR REPLACE FUNCTION ijara_audit_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append only';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER audit_log_append_only
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION ijara_audit_immutable();
--> statement-breakpoint

-- 2. Issued receipts are immutable. Only the void markers may change; the number, amount and snapshot never can.
CREATE OR REPLACE FUNCTION ijara_receipt_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'receipts cannot be deleted; void and issue a credit note instead';
  END IF;
  IF NEW.number <> OLD.number
     OR NEW.owner_id <> OLD.owner_id
     OR NEW.payment_id <> OLD.payment_id
     OR NEW.amount_baisa <> OLD.amount_baisa
     OR NEW.kind <> OLD.kind
     OR NEW.display_number <> OLD.display_number
     OR NEW.snapshot IS DISTINCT FROM OLD.snapshot THEN
    RAISE EXCEPTION 'issued receipts are immutable; void and issue a credit note instead';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER receipts_immutable
  BEFORE UPDATE OR DELETE ON receipts
  FOR EACH ROW EXECUTE FUNCTION ijara_receipt_guard();
--> statement-breakpoint

-- 3. Money sanity constraints. Whole baisa integers only, and never negative where it makes no sense.
ALTER TABLE payments ADD CONSTRAINT payments_amount_positive CHECK (amount_baisa > 0);
--> statement-breakpoint
ALTER TABLE payments ADD CONSTRAINT payments_fee_non_negative CHECK (gateway_fee_baisa >= 0);
--> statement-breakpoint
ALTER TABLE cheques ADD CONSTRAINT cheques_amount_positive CHECK (amount_baisa > 0);
--> statement-breakpoint
ALTER TABLE schedule_items ADD CONSTRAINT schedule_amount_positive CHECK (amount_baisa > 0);
--> statement-breakpoint
ALTER TABLE receipts ADD CONSTRAINT receipts_amount_positive CHECK (amount_baisa > 0);
--> statement-breakpoint
ALTER TABLE security_deposits ADD CONSTRAINT security_amount_positive CHECK (amount_baisa > 0);
--> statement-breakpoint
ALTER TABLE units ADD CONSTRAINT units_rent_non_negative CHECK (rent_baisa >= 0);
--> statement-breakpoint
ALTER TABLE maintenance_requests ADD CONSTRAINT mreq_cost_non_negative CHECK (cost_baisa IS NULL OR cost_baisa >= 0);
--> statement-breakpoint
ALTER TABLE contracts ADD CONSTRAINT contracts_dates_ordered CHECK (end_date >= start_date);
--> statement-breakpoint
ALTER TABLE contracts ADD CONSTRAINT contracts_rent_positive CHECK (monthly_rent_baisa > 0);
--> statement-breakpoint

-- 4. A schedule item can carry at most one posted payment at any time.
CREATE UNIQUE INDEX payments_one_posted_per_item ON payments (schedule_item_id) WHERE status = 'posted';
--> statement-breakpoint

-- 5. A unit can have at most one active contract.
CREATE UNIQUE INDEX contracts_one_active_per_unit ON contracts (unit_id) WHERE status = 'active';
--> statement-breakpoint

-- 6. A cheque that is not rejected or written off is unique per schedule item (no double cheques for one instalment).
CREATE UNIQUE INDEX cheques_one_live_per_item ON cheques (schedule_item_id)
  WHERE status IN ('received', 'due', 'deposited', 'collected', 'bounced', 'follow_up');
