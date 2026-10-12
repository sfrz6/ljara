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

export const providers: Record<ExternalChannel, MessageProvider> = {
  sms: new SimulatedProvider("sms", "tmm"),
  whatsapp: new SimulatedProvider("whatsapp", "wamid"),
  email: new SimulatedProvider("email", "rsnd"),
};

/** Test hook: replace a provider (for example to force a hard failure and prove the fallback chain). */
export function setProviderForTests(channel: ExternalChannel, provider: MessageProvider | null): void {
  providers[channel] = provider ?? new SimulatedProvider(channel, channel);
}
