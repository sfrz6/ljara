import type { DB } from "@/db/client";
import { auditLog } from "@/db/schema";
import type { Ctx } from "./context";

const REDACT = new Set(["passwordHash", "password_hash", "tokenHash", "token_hash"]);

function clean(value: unknown): unknown {
  if (value === undefined) return null;
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(clean);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = REDACT.has(k) ? "[redacted]" : clean(v);
  }
  return out;
}

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  meta?: Record<string, unknown>;
  /** Financial and security events are retained longer (proposal 4.9). */
  elevated?: boolean;
}

/** Actions that are always stored at the elevated retention class. */
const ELEVATED_PREFIXES = ["receipt.", "payment.", "statement.", "role.", "user.role", "auth.failed", "access.refused", "cheque."];

export async function writeAudit(q: DB, ctx: Ctx | { orgId: string | null; actor: Ctx["actor"] }, entry: AuditEntry): Promise<void> {
  await q.insert(auditLog).values({
    orgId: ctx.orgId,
    actorKind: ctx.actor.kind,
    actorId: ctx.actor.id,
    actorName: ctx.actor.name,
    actorRole: ctx.actor.role,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    before: clean(entry.before) as never,
    after: clean(entry.after) as never,
    meta: clean(entry.meta) as never,
    elevated: entry.elevated ?? ELEVATED_PREFIXES.some((p) => entry.action.startsWith(p)),
  });
}

/** Shallow diff so the audit row stores only what actually changed. */
export function diff<T extends Record<string, unknown>>(before: T, after: Partial<T>): { before: Partial<T>; after: Partial<T> } {
  const b: Partial<T> = {};
  const a: Partial<T> = {};
  for (const key of Object.keys(after) as (keyof T)[]) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      b[key] = before[key];
      a[key] = after[key];
    }
  }
  return { before: b, after: a };
}
