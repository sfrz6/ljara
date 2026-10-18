import type { Translate, Key } from "@/i18n";
import { Badge, type Tone } from "./ui/display";

const TONES: Record<string, Record<string, Tone>> = {
  unit: {
    available: "ok",
    reserved: "info",
    occupied: "brand",
    notice_given: "warn",
    vacated: "warn",
    under_inspection: "bad",
    inspected: "brass",
  },
  cheque: {
    received: "neutral",
    due: "warn",
    deposited: "info",
    collected: "ok",
    bounced: "bad",
    follow_up: "bad",
    written_off: "neutral",
    returned: "neutral",
  },
  maint: { submitted: "info", in_progress: "warn", waiting: "brass", completed: "ok" },
  contract: { pending: "info", active: "ok", ended: "neutral" },
  receipt: { issued: "ok", voided: "bad" },
  notif: { queued: "neutral", sent: "info", delivered: "ok", failed: "bad" },
  tenant: { active: "ok", former: "neutral", archived: "neutral" },
  sched: { upcoming: "neutral", due: "warn", paid: "ok", action_needed: "bad" },
  schedule: { open: "neutral", paid: "ok", written_off: "neutral", cancelled: "neutral" },
  request: { received: "info", in_progress: "warn", waiting: "brass", completed: "ok" },
  priority: { normal: "neutral", urgent: "bad" },
};

const KEY_PREFIX: Record<string, string> = {
  unit: "unit.status.",
  cheque: "cheque.status.",
  maint: "maint.status.",
  contract: "contract.status.",
  receipt: "receipt.status.",
  notif: "notif.status.",
  tenant: "tenant.status.",
  sched: "tenant.sched.",
  schedule: "schedule.status.",
  request: "tenant.request.",
  priority: "priority.",
};

export type StatusKind = keyof typeof TONES;

export function toneOf(kind: StatusKind, status: string): Tone {
  return TONES[kind]?.[status] ?? "neutral";
}

export function StatusBadge({ kind, status, t, dot = true }: { kind: StatusKind; status: string; t: Translate; dot?: boolean }) {
  return (
    <Badge tone={toneOf(kind, status)} dot={dot}>
      {t((KEY_PREFIX[kind] + status) as Key)}
    </Badge>
  );
}
