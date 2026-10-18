import { and, desc, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import {
  defaultNotificationPrefs,
  messageTemplates,
  notifications,
  organisations,
  tenants,
  users,
  type DeliveryAttempt,
  type NotificationPrefs,
} from "@/db/schema";
import { hourInMuscat } from "@/lib/dates";
import { providers, type ExternalChannel } from "@/integrations/providers";
import { channelUsable } from "@/lib/features";
import { TEMPLATE_BY_KEY, interpolate } from "./templates";
import type { Role } from "./permissions";

type Locale = "en" | "ar";
type Vars = Record<string, string | number>;

export interface SendResult {
  id: string;
  status: "sent" | "delivered" | "queued" | "failed";
  channel: ExternalChannel | "in_app";
  duplicate: boolean;
}

export async function orgPrefs(q: DB, orgId: string): Promise<NotificationPrefs> {
  const [org] = await q.select({ p: organisations.notificationPrefs }).from(organisations).where(eq(organisations.id, orgId));
  return { ...defaultNotificationPrefs, ...(org?.p ?? {}) };
}

/** Resolve the wording: organisation override first, then the default catalogue. */
export async function renderMessage(
  q: DB,
  orgId: string,
  key: string,
  locale: Locale,
  vars: Vars,
): Promise<{ subject: string; body: string }> {
  const def = TEMPLATE_BY_KEY[key];
  if (!def) throw new Error(`Unknown template ${key}`);
  const [override] = await q
    .select({ body: messageTemplates.body })
    .from(messageTemplates)
    .where(and(eq(messageTemplates.orgId, orgId), eq(messageTemplates.key, key), eq(messageTemplates.locale, locale)));
  return {
    subject: interpolate(def.subject[locale], vars),
    body: interpolate(override?.body ?? def.body[locale], vars),
  };
}

function nextQuietEnd(prefs: NotificationPrefs, now: Date): Date {
  const out = new Date(now);
  for (let i = 0; i < 48; i++) {
    out.setTime(out.getTime() + 30 * 60_000);
    if (!inQuietHours(prefs, out)) return out;
  }
  return out;
}

export function inQuietHours(prefs: NotificationPrefs, at: Date): boolean {
  if (!prefs.quietHours.enabled) return false;
  const h = hourInMuscat(at);
  const { startHour: s, endHour: e } = prefs.quietHours;
  return s > e ? h >= s || h < e : h >= s && h < e;
}

export interface TenantMessage {
  orgId: string;
  tenantId: string;
  template: string;
  vars: Vars;
  /** Same key twice means the message is sent once (CR-9.4). */
  idempotencyKey: string;
  link?: string;
  related?: { type: string; id: string };
  now?: Date;
}

/**
 * Send a message to a tenant. One delivery record per message with the full attempt trail:
 * WhatsApp, then SMS, then email (proposal 2.3.3). An in-app copy is always created for the portal inbox.
 */
export async function notifyTenant(q: DB, msg: TenantMessage): Promise<SendResult> {
  const def = TEMPLATE_BY_KEY[msg.template];
  if (!def) throw new Error(`Unknown template ${msg.template}`);
  const now = msg.now ?? new Date();

  const [existing] = await q
    .select({ id: notifications.id, status: notifications.status, channel: notifications.channel })
    .from(notifications)
    .where(and(eq(notifications.orgId, msg.orgId), eq(notifications.idempotencyKey, msg.idempotencyKey)));
  if (existing) {
    return { id: existing.id, status: existing.status, channel: existing.channel as SendResult["channel"], duplicate: true };
  }

  const [tenant] = await q
    .select({ id: tenants.id, phone: tenants.phone, email: tenants.email, locale: tenants.locale })
    .from(tenants)
    .where(and(eq(tenants.id, msg.tenantId), eq(tenants.orgId, msg.orgId)));
  if (!tenant) throw new Error("Tenant not found for notification");

  const prefs = await orgPrefs(q, msg.orgId);
  const { subject, body } = await renderMessage(q, msg.orgId, msg.template, tenant.locale, msg.vars);

  // In-app copy for the portal inbox (OTP codes are never stored in the inbox).
  if (!def.smsOnly) {
    await q
      .insert(notifications)
      .values({
        orgId: msg.orgId,
        recipientKind: "tenant",
        recipientId: tenant.id,
        channel: "in_app",
        template: msg.template,
        locale: tenant.locale,
        subject,
        body,
        status: "delivered",
        idempotencyKey: `${msg.idempotencyKey}:inapp`,
        urgent: def.urgent,
        link: msg.link,
        relatedType: msg.related?.type,
        relatedId: msg.related?.id,
        sentAt: now,
        deliveredAt: now,
      })
      .onConflictDoNothing();
  }

  // Quiet hours: hold non urgent messages until the window ends.
  if (!def.urgent && inQuietHours(prefs, now)) {
    const [row] = await q
      .insert(notifications)
      .values({
        orgId: msg.orgId,
        recipientKind: "tenant",
        recipientId: tenant.id,
        channel: "sms",
        template: msg.template,
        locale: tenant.locale,
        subject,
        body,
        toAddress: tenant.phone,
        status: "queued",
        idempotencyKey: msg.idempotencyKey,
        urgent: false,
        relatedType: msg.related?.type,
        relatedId: msg.related?.id,
        scheduledFor: nextQuietEnd(prefs, now),
      })
      .returning({ id: notifications.id });
    return { id: row.id, status: "queued", channel: "sms", duplicate: false };
  }

  const order: ExternalChannel[] = def.smsOnly ? ["sms"] : ["whatsapp", "sms", "email"];
  const attempts: DeliveryAttempt[] = [];
  let sent: { channel: ExternalChannel; providerRef: string; to: string } | null = null;

  for (const channel of order) {
    const at = new Date().toISOString();
    if (channel !== "sms" && !prefs.channels[channel]) {
      attempts.push({ channel, status: "skipped", reason: "channel_disabled", at });
      continue;
    }
    if (channel === "sms" && !prefs.channels.sms && !def.smsOnly) {
      attempts.push({ channel, status: "skipped", reason: "channel_disabled", at });
      continue;
    }
    if (!channelUsable(channel)) {
      attempts.push({ channel, status: "skipped", reason: "provider_not_configured", at });
      continue;
    }
    const to = channel === "email" ? tenant.email : tenant.phone;
    if (!to) {
      attempts.push({ channel, status: "skipped", reason: "no_address", at });
      continue;
    }
    const result = await providers[channel].send({ to, subject: channel === "email" ? subject : null, body });
    if (result.ok) {
      attempts.push({ channel, status: "sent", at });
      sent = { channel, providerRef: result.providerRef, to };
      break;
    }
    attempts.push({ channel, status: "failed", reason: result.reason, at });
  }

  const firstTarget = sent?.channel ?? order.find((c) => attempts.find((a) => a.channel === c)?.status === "failed") ?? order[0];
  const [row] = await q
    .insert(notifications)
    .values({
      orgId: msg.orgId,
      recipientKind: "tenant",
      recipientId: tenant.id,
      channel: sent?.channel ?? firstTarget,
      template: msg.template,
      locale: tenant.locale,
      subject,
      body,
      toAddress: sent?.to ?? (firstTarget === "email" ? tenant.email : tenant.phone),
      status: sent ? (sent.channel === "email" ? "sent" : "delivered") : "failed",
      idempotencyKey: msg.idempotencyKey,
      attempts,
      providerRef: sent?.providerRef,
      urgent: def.urgent,
      link: msg.link,
      relatedType: msg.related?.type,
      relatedId: msg.related?.id,
      sentAt: sent ? now : null,
      deliveredAt: sent && sent.channel !== "email" ? now : null,
    })
    .returning({ id: notifications.id, status: notifications.status });
  return { id: row.id, status: row.status, channel: sent?.channel ?? firstTarget, duplicate: false };
}

export interface StaffMessage {
  orgId: string;
  roles: Role[];
  template: string;
  vars: Vars;
  idempotencyKey: string;
  link?: string;
  related?: { type: string; id: string };
  /** Restrict to specific users instead of every user holding the role. */
  userIds?: string[];
  pref?: keyof NotificationPrefs["staffAlerts"];
}

/** In-app notification to every active staff member holding one of the roles. */
export async function notifyStaff(q: DB, msg: StaffMessage): Promise<number> {
  const prefs = await orgPrefs(q, msg.orgId);
  if (msg.pref && prefs.staffAlerts[msg.pref] === false) return 0;
  const def = TEMPLATE_BY_KEY[msg.template];
  if (!def) throw new Error(`Unknown template ${msg.template}`);
  const rows = await q
    .select({ id: users.id, locale: users.locale })
    .from(users)
    .where(and(eq(users.orgId, msg.orgId), eq(users.active, true), inArray(users.role, msg.roles)));
  const recipients = msg.userIds ? rows.filter((r) => msg.userIds!.includes(r.id)) : rows;
  let created = 0;
  for (const u of recipients) {
    const { subject, body } = await renderMessage(q, msg.orgId, msg.template, u.locale, msg.vars);
    const inserted = await q
      .insert(notifications)
      .values({
        orgId: msg.orgId,
        recipientKind: "user",
        recipientId: u.id,
        channel: "in_app",
        template: msg.template,
        locale: u.locale,
        subject,
        body,
        status: "delivered",
        idempotencyKey: `${msg.idempotencyKey}:${u.id}`,
        urgent: def.urgent,
        link: msg.link,
        relatedType: msg.related?.type,
        relatedId: msg.related?.id,
        sentAt: new Date(),
        deliveredAt: new Date(),
      })
      .onConflictDoNothing()
      .returning({ id: notifications.id });
    created += inserted.length;
  }
  return created;
}

/** Send messages that were held for quiet hours and are now due. Called by the daily job. */
export async function flushQueued(q: DB, orgId: string, now = new Date()): Promise<number> {
  const due = await q
    .select()
    .from(notifications)
    .where(
      and(eq(notifications.orgId, orgId), eq(notifications.status, "queued"), lte(notifications.scheduledFor, now)),
    );
  let flushed = 0;
  for (const n of due) {
    if (n.recipientKind !== "tenant") continue;
    const prefs = await orgPrefs(q, orgId);
    const [tenant] = await q.select().from(tenants).where(eq(tenants.id, n.recipientId));
    if (!tenant) continue;
    const attempts: DeliveryAttempt[] = [];
    let sentVia: ExternalChannel | null = null;
    let ref = "";
    for (const channel of ["whatsapp", "sms", "email"] as ExternalChannel[]) {
      const at = new Date().toISOString();
      const to = channel === "email" ? tenant.email : tenant.phone;
      if (!prefs.channels[channel] || !to || !channelUsable(channel)) {
        attempts.push({ channel, status: "skipped", reason: !channelUsable(channel) ? "provider_not_configured" : !to ? "no_address" : "channel_disabled", at });
        continue;
      }
      const r = await providers[channel].send({ to, subject: channel === "email" ? n.subject : null, body: n.body });
      if (r.ok) {
        attempts.push({ channel, status: "sent", at });
        sentVia = channel;
        ref = r.providerRef;
        break;
      }
      attempts.push({ channel, status: "failed", reason: r.reason, at });
    }
    await q
      .update(notifications)
      .set({
        channel: sentVia ?? n.channel,
        status: sentVia ? (sentVia === "email" ? "sent" : "delivered") : "failed",
        attempts,
        providerRef: ref || null,
        sentAt: sentVia ? now : null,
        deliveredAt: sentVia && sentVia !== "email" ? now : null,
      })
      .where(eq(notifications.id, n.id));
    flushed += 1;
  }
  return flushed;
}

/* ----------------------------- Reading / inbox ----------------------------- */

export async function inboxFor(q: DB, orgId: string, kind: "user" | "tenant", recipientId: string, limit = 50) {
  return q
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.orgId, orgId),
        eq(notifications.recipientKind, kind),
        eq(notifications.recipientId, recipientId),
        eq(notifications.channel, "in_app"),
      ),
    )
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function unreadCount(q: DB, orgId: string, kind: "user" | "tenant", recipientId: string): Promise<number> {
  const [row] = await q
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(
      and(
        eq(notifications.orgId, orgId),
        eq(notifications.recipientKind, kind),
        eq(notifications.recipientId, recipientId),
        eq(notifications.channel, "in_app"),
        isNull(notifications.readAt),
      ),
    );
  return row?.n ?? 0;
}

export async function markAllRead(q: DB, orgId: string, kind: "user" | "tenant", recipientId: string): Promise<void> {
  await q
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.orgId, orgId),
        eq(notifications.recipientKind, kind),
        eq(notifications.recipientId, recipientId),
        eq(notifications.channel, "in_app"),
        isNull(notifications.readAt),
      ),
    );
}
