import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { ZodType } from "zod";
import { isDomainError } from "@/domain/errors";
import type { Permission } from "@/domain/permissions";
import { errorMessage, type Key, type Translate } from "@/i18n";
import { getStaff, getTenant, type StaffContext, type TenantContext } from "./context";
import { getT } from "./session";

/**
 * Server action plumbing. Every mutation runs through here so that authentication, permission checks,
 * validation and error translation are impossible to forget (the UI hiding a button is never the control).
 */
export interface ActionState {
  ok?: boolean;
  /** Banner message for the form. */
  error?: string;
  /** Field name to message. */
  fieldErrors?: Record<string, string>;
  /** Success toast text. */
  message?: string;
  /** Arbitrary payload for client components (ids, urls). */
  data?: Record<string, unknown>;
  /** Submitted text values echoed back so a failed form keeps what the user typed. */
  values?: Record<string, string>;
}

export type ActionResult = {
  message?: Key;
  redirectTo?: string;
  revalidate?: string[];
  data?: Record<string, unknown>;
} | void;

export const FLASH_COOKIE = "ijara_flash";

export async function setFlash(key: Key): Promise<void> {
  (await cookies()).set(FLASH_COOKIE, key, { path: "/", maxAge: 30, sameSite: "lax" });
}

/** Parse FormData with zod. Messages in the schema are i18n error keys such as "err.required". */
export function parseForm<T>(schema: ZodType<T>, form: FormData | Record<string, unknown>, t: Translate): T {
  const raw = form instanceof FormData ? formToObject(form) : form;
  const res = schema.safeParse(raw);
  if (res.success) return res.data;
  const fieldErrors: Record<string, string> = {};
  for (const issue of res.error.issues) {
    const name = String(issue.path[0] ?? "form");
    if (fieldErrors[name]) continue;
    const key = issue.message as Key;
    fieldErrors[name] = key.startsWith("err.") ? t(key) : t("err.required");
  }
  throw new ValidationError(fieldErrors);
}

export class ValidationError extends Error {
  constructor(readonly fieldErrors: Record<string, string>) {
    super("validation");
  }
}

function formToObject(form: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of new Set(form.keys())) {
    const all = form.getAll(key);
    const values = all.map((v) => (typeof v === "string" ? v : v));
    out[key] = values.length > 1 ? values : values[0];
  }
  return out;
}

interface Run<C> {
  c: C;
  form: FormData;
  t: Translate;
}

function echoValues(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of form.entries()) {
    if (typeof v === "string" && !/password|code|otp/i.test(k) && !k.startsWith("$ACTION")) out[k] = v;
  }
  return out;
}

async function execute<C>(
  t: Translate,
  c: C,
  form: FormData,
  fn: (r: Run<C>) => Promise<ActionResult>,
): Promise<ActionState> {
  let result: ActionResult;
  try {
    result = await fn({ c, form, t });
  } catch (e) {
    if (e instanceof ValidationError) return { ok: false, error: t("err.validation"), fieldErrors: e.fieldErrors, values: echoValues(form) };
    if (isDomainError(e)) {
      const msg = errorMessage(t, e.code, e.params);
      return { ok: false, error: e.field ? undefined : msg, fieldErrors: e.field ? { [e.field]: msg } : undefined, values: echoValues(form) };
    }
    if (isRedirect(e)) throw e;
    console.error("Action failed", e);
    return { ok: false, error: t("err.generic"), values: echoValues(form) };
  }
  const r = result ?? {};
  for (const p of r.revalidate ?? []) revalidatePath(p);
  if (r.redirectTo) {
    if (r.message) await setFlash(r.message);
    redirect(r.redirectTo);
  }
  return { ok: true, message: r.message ? t(r.message) : undefined, data: r.data };
}

function isRedirect(e: unknown): boolean {
  return typeof e === "object" && e !== null && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_REDIRECT");
}

export type StaffRun = Run<StaffContext>;
export type TenantRun = Run<TenantContext>;

/** Wrap a staff mutation. `permission` is checked on the server for every call. */
export function staffAction(permission: Permission | null, fn: (r: StaffRun) => Promise<ActionResult>) {
  return async (_prev: ActionState | null, form: FormData): Promise<ActionState> => {
    const t = await getT();
    const staff = await getStaff();
    if (!staff) return { ok: false, error: t("err.signin_required") };
    if (permission && !staff.can(permission)) return { ok: false, error: t("err.forbidden") };
    return execute(t, staff, form, fn);
  };
}

export function tenantAction(fn: (r: TenantRun) => Promise<ActionResult>) {
  return async (_prev: ActionState | null, form: FormData): Promise<ActionState> => {
    const t = await getT();
    const tenant = await getTenant();
    if (!tenant) return { ok: false, error: t("err.signin_required") };
    return execute(t, tenant, form, fn);
  };
}

/** For public pages (login, signup, OTP). No session required. */
export function publicAction(fn: (r: Run<null>) => Promise<ActionResult>) {
  return async (_prev: ActionState | null, form: FormData): Promise<ActionState> => {
    const t = await getT();
    return execute(t, null, form, fn);
  };
}

/** Programmatic variants for actions invoked with arguments instead of a form (buttons). */
export async function runStaff(
  permission: Permission | null,
  args: Record<string, unknown>,
  fn: (r: { c: StaffContext; args: Record<string, unknown>; t: Translate }) => Promise<ActionResult>,
): Promise<ActionState> {
  const t = await getT();
  const staff = await getStaff();
  if (!staff) return { ok: false, error: t("err.signin_required") };
  if (permission && !staff.can(permission)) return { ok: false, error: t("err.forbidden") };
  const fd = new FormData();
  return execute(t, staff, fd, async ({ c }) => fn({ c, args, t }));
}

export async function runTenant(
  args: Record<string, unknown>,
  fn: (r: { c: TenantContext; args: Record<string, unknown>; t: Translate }) => Promise<ActionResult>,
): Promise<ActionState> {
  const t = await getT();
  const tenant = await getTenant();
  if (!tenant) return { ok: false, error: t("err.signin_required") };
  return execute(t, tenant, new FormData(), async ({ c }) => fn({ c, args, t }));
}
