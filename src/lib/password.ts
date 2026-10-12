import { randomBytes, scrypt as scryptCb, timingSafeEqual, createHash } from "node:crypto";

const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;
const MAXMEM = 64 * 1024 * 1024;

export const MIN_PASSWORD_LENGTH = 10;

function scrypt(password: string, salt: Buffer, len: number, params: { N: number; r: number; p: number }) {
  return new Promise<Buffer>((resolve, reject) => {
    scryptCb(password, salt, len, { ...params, maxmem: MAXMEM }, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEYLEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) {
    // Spend comparable time so missing accounts are not distinguishable by timing.
    await scrypt(password, Buffer.alloc(16), KEYLEN, { N, r: R, p: P });
    return false;
  }
  const [scheme, n, r, p, saltB64, keyB64] = stored.split("$");
  if (scheme !== "scrypt") return false;
  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(keyB64, "base64");
  const actual = await scrypt(password, salt, expected.length, { N: Number(n), r: Number(r), p: Number(p) });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Returns an i18n error key or null when acceptable. */
export function validatePasswordStrength(password: string): "password_too_short" | "password_weak" | null {
  if (password.length < MIN_PASSWORD_LENGTH) return "password_too_short";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "password_weak";
  return null;
}
