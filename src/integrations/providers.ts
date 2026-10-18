import { randomUUID } from "node:crypto";

/**
 * Messaging providers. In this validation build every provider is SIMULATED: nothing leaves the server.
 * The shapes below are what the production developer replaces with real clients:
 *
 *   sms       Tamimah SMS (Omani provider). Primary channel for OTP. Needs a registered sender ID.
 *   whatsapp  Meta WhatsApp Business Cloud API. Messages outside a 24h window must use approved templates.
 *   email     Resend. Third choice fallback and document delivery.
 *
 * Contract for a real provider: resolve { ok: true, providerRef } when the provider accepted the message,
 * resolve { ok: false, reason } on a hard failure (the messaging service then falls back to the next channel),
 * and throw only on transient errors (the service retries with backoff).
 */

export type ExternalChannel = "whatsapp" | "sms" | "email";

export interface OutgoingMessage {
  to: string;
  subject: string | null;
  body: string;
}

export type ProviderResult = { ok: true; providerRef: string } | { ok: false; reason: string };

export interface MessageProvider {
  channel: ExternalChannel;
  send(message: OutgoingMessage): Promise<ProviderResult>;
}

class SimulatedProvider implements MessageProvider {
  constructor(
    readonly channel: ExternalChannel,
    private readonly prefix: string,
  ) {}

  async send(message: OutgoingMessage): Promise<ProviderResult> {
    if (!message.to) return { ok: false, reason: "missing_recipient" };
    return { ok: true, providerRef: `${this.prefix}_${randomUUID().slice(0, 12)}` };
  }
}

/** Real email through Resend's HTTP API. Used when RESEND_API_KEY and EMAIL_FROM are set. */
class ResendProvider implements MessageProvider {
  readonly channel = "email" as const;

  async send(message: OutgoingMessage): Promise<ProviderResult> {
    if (!message.to) return { ok: false, reason: "missing_recipient" };
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [message.to], subject: message.subject ?? "Ijara", text: message.body }),
        signal: AbortSignal.timeout(10_000),
      });
      const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
      if (res.ok && json.id) return { ok: true, providerRef: json.id };
      return { ok: false, reason: json.message ?? `http_${res.status}` };
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message.slice(0, 120) : "network_error" };
    }
  }
}

export const providers: Record<ExternalChannel, MessageProvider> = {
  sms: new SimulatedProvider("sms", "tmm"),
  whatsapp: new SimulatedProvider("whatsapp", "wamid"),
  email: process.env.RESEND_API_KEY && process.env.EMAIL_FROM ? new ResendProvider() : new SimulatedProvider("email", "rsnd"),
};

/** Test hook: replace a provider (for example to force a hard failure and prove the fallback chain). */
export function setProviderForTests(channel: ExternalChannel, provider: MessageProvider | null): void {
  providers[channel] = provider ?? new SimulatedProvider(channel, channel);
}
