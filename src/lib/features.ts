import { isDemoMode } from "./demo";

/**
 * Central switches that decide what is real and what is simulated. Everything that behaves differently between the
 * demo environment and a live office reads from here, so there is one place to review before going live.
 */

/** Online payments need a real gateway integration (production) or the simulated gateway (demo). */
export function gatewayAvailable(): boolean {
  return isDemoMode() || !!process.env.PAYMENT_GATEWAY;
}

/** Public signup is open in demo mode. For a live deployment offices are created by the platform administrator. */
export function signupEnabled(): boolean {
  if (process.env.SIGNUP_ENABLED === "true") return true;
  if (process.env.SIGNUP_ENABLED === "false") return false;
  return isDemoMode();
}

export type Channel = "whatsapp" | "sms" | "email";

/** A channel is live when a real provider is configured. In demo mode every channel is simulated on purpose. */
export function channelLive(channel: Channel): boolean {
  if (channel === "email") return !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM;
  return false; // SMS and WhatsApp providers are plugged in by the production developer (see providers.ts)
}

/** Whether a message on this channel can actually leave the system. */
export function channelUsable(channel: Channel): boolean {
  return isDemoMode() || channelLive(channel);
}

export function messagingStatus(): { channel: Channel; mode: "live" | "simulated" | "off" }[] {
  return (["whatsapp", "sms", "email"] as const).map((channel) => ({
    channel,
    mode: channelLive(channel) ? "live" : isDemoMode() ? "simulated" : "off",
  }));
}

/** True when at least one channel is not live, so staff must be told delivery is not guaranteed. */
export function messagingIncomplete(): boolean {
  return messagingStatus().some((s) => s.mode !== "live");
}
