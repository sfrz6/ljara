"use client";

import { createContext, useActionState, useContext, useEffect, useId, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, Check, Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import type { ActionState } from "@/lib/action";
import { Button, type ButtonProps } from "./button";
import { useI18n } from "../i18n-provider";

/* ----------------------------- Form state context ----------------------------- */

interface FormCtx {
  state: ActionState | null;
  pending: boolean;
}
const FormContext = createContext<FormCtx>({ state: null, pending: false });
export const useFormState = () => useContext(FormContext);

export type FormAction = (prev: ActionState | null, form: FormData) => Promise<ActionState>;

export interface ActionFormProps extends Omit<ComponentProps<"form">, "action"> {
  action: FormAction;
  /** Called after a successful submit (for example close a dialog). */
  onSuccess?: (state: ActionState) => void;
  /** Keep the submitted values after success (default resets the form). */
  keepValues?: boolean;
  /** Do not show a toast for the success message. */
  silent?: boolean;
  hideBanner?: boolean;
}

/** Form wired to a server action: pending state, error banner, field errors, toast on success. */
export function ActionForm({ action, onSuccess, silent, hideBanner, children, className, encType: _enc, method: _method, ...props }: ActionFormProps) {
  const [state, formAction, pending] = useActionState(action, null);
  const handled = useRef<ActionState | null>(null);
  useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;
    if (state.ok) {
      if (state.message && !silent) toast.success(state.message);
      onSuccess?.(state);
    }
  }, [state, onSuccess, silent]);
  return (
    <FormContext.Provider value={{ state, pending }}>
      <form action={formAction} className={cn("space-y-4", className)} noValidate {...props}>
        {!hideBanner && state?.error ? <Alert tone="bad">{state.error}</Alert> : null}
        {children}
      </form>
    </FormContext.Provider>
  );
}

export function Alert({ tone = "info", children, className, title }: { tone?: "info" | "bad" | "warn" | "ok"; children: ReactNode; className?: string; title?: string }) {
  const tones = {
    info: "border-info-100 bg-info-50 text-info-700",
    bad: "border-bad-100 bg-bad-50 text-bad-700",
    warn: "border-warn-100 bg-warn-50 text-warn-700",
    ok: "border-ok-100 bg-ok-50 text-ok-700",
  };
  return (
    <div role={tone === "bad" ? "alert" : "status"} className={cn("flex items-start gap-2.5 rounded-md border px-3.5 py-3 text-[14px]", tones[tone], className)}>
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0">
        {title ? <p className="font-semibold">{title}</p> : null}
        <div className={title ? "mt-0.5" : undefined}>{children}</div>
      </div>
    </div>
  );
}

export function SubmitButton({ children, pendingLabel, variant = "primary", size, className, disabled, ...props }: ButtonProps & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  const { t } = useI18n();
  return (
    <Button type="submit" variant={variant} size={size} className={className} disabled={pending || disabled} aria-busy={pending} {...props}>
      {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
      {pending ? (pendingLabel ?? t("common.saving")) : children}
    </Button>
  );
}

/* --------------------------------- Fields --------------------------------- */

export const controlClass =
  "block w-full rounded-sm border border-line-strong bg-surface px-3 text-ink placeholder:text-ink-3 transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-canvas disabled:text-ink-3 aria-[invalid=true]:border-bad-600 aria-[invalid=true]:ring-bad-600/15 h-11 md:h-9 text-[15px] md:text-[14px]";

function useFieldError(name?: string) {
  const { state } = useFormState();
  return name ? state?.fieldErrors?.[name] : undefined;
}

function useEcho(name: string | undefined, fallback: unknown): string | undefined {
  const { state } = useFormState();
  if (name && state?.values && name in state.values) return state.values[name];
  return fallback === undefined || fallback === null ? undefined : String(fallback);
}

export function Field({
  label,
  name,
  hint,
  required,
  optional,
  children,
  className,
  error: errorProp,
}: {
  label: ReactNode;
  name?: string;
  hint?: ReactNode;
  required?: boolean;
  optional?: boolean;
  children: ReactNode;
  className?: string;
  error?: string;
}) {
  const id = useId();
  const fieldError = useFieldError(name);
  const error = errorProp ?? fieldError;
  const { t } = useI18n();
  return (
    <div className={cn("space-y-1.5", className)} data-field={name}>
      <label htmlFor={`${id}-${name ?? "f"}`} className="flex items-baseline gap-1.5 text-[13px] font-medium text-ink-2">
        <span>{label}</span>
        {required ? <span className="text-bad-600" aria-hidden>*</span> : null}
        {optional ? <span className="text-[12px] font-normal text-ink-3">({t("common.optional")})</span> : null}
      </label>
      <FieldIdContext.Provider value={{ id: `${id}-${name ?? "f"}`, describedBy: error ? `${id}-err` : hint ? `${id}-hint` : undefined, invalid: !!error }}>
        {children}
      </FieldIdContext.Provider>
      {hint && !error ? (
        <p id={`${id}-hint`} className="text-[12.5px] text-ink-3">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-err`} className="flex items-center gap-1.5 text-[12.5px] font-medium text-bad-600" role="alert">
          <AlertCircle className="size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}
    </div>
  );
}

const FieldIdContext = createContext<{ id?: string; describedBy?: string; invalid?: boolean }>({});

export function Input({ className, name, defaultValue, type = "text", ...props }: ComponentProps<"input">) {
  const f = useContext(FieldIdContext);
  const echo = useEcho(name, defaultValue);
  const error = useFieldError(name);
  const [show, setShow] = useState(false);
  const { t } = useI18n();
  const isPassword = type === "password";
  const isLtr = type === "email" || type === "tel" || type === "url" || type === "number" || type === "date";
  const input = (
    <input
      id={f.id}
      name={name}
      type={isPassword && show ? "text" : type}
      defaultValue={props.value !== undefined || type === "file" || type === "password" ? undefined : echo}
      key={props.value !== undefined || type === "file" || type === "password" ? undefined : echo}
      aria-invalid={f.invalid || !!error || undefined}
      aria-describedby={f.describedBy}
      dir={isLtr ? "ltr" : props.dir}
      className={cn(controlClass, isLtr && "rtl:text-right", isPassword && "pe-10", className)}
      {...props}
    />
  );
  if (!isPassword) return input;
  return (
    <div className="relative">
      {input}
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute inset-y-0 end-0 flex w-10 items-center justify-center text-ink-3 hover:text-ink"
        aria-label={show ? t("common.hide_password") : t("common.show_password")}
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

export function Textarea({ className, name, defaultValue, rows = 3, ...props }: ComponentProps<"textarea">) {
  const f = useContext(FieldIdContext);
  const echo = useEcho(name, defaultValue);
  const error = useFieldError(name);
  return (
    <textarea
      id={f.id}
      name={name}
      rows={rows}
      defaultValue={props.value !== undefined ? undefined : echo}
      key={props.value !== undefined ? undefined : echo}
      aria-invalid={f.invalid || !!error || undefined}
      aria-describedby={f.describedBy}
      className={cn(controlClass, "h-auto min-h-20 py-2.5 leading-relaxed", className)}
      {...props}
    />
  );
}

export function Select({ className, name, defaultValue, children, ...props }: ComponentProps<"select">) {
  const f = useContext(FieldIdContext);
  const echo = useEcho(name, defaultValue);
  const error = useFieldError(name);
  return (
    <select
      id={f.id}
      name={name}
      defaultValue={props.value !== undefined ? undefined : echo}
      key={props.value !== undefined ? undefined : echo}
      aria-invalid={f.invalid || !!error || undefined}
      aria-describedby={f.describedBy}
      className={cn(controlClass, "appearance-none bg-[length:16px] bg-[position:right_0.65rem_center] rtl:bg-[position:left_0.65rem_center] bg-no-repeat pe-8", className)}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%237b8584'%3E%3Cpath d='M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4Z'/%3E%3C/svg%3E\")",
      }}
      {...props}
    >
      {children}
    </select>
  );
}

export function Checkbox({ label, className, name, defaultChecked, ...props }: Omit<ComponentProps<"input">, "type"> & { label: ReactNode }) {
  const { state } = useFormState();
  const error = name ? state?.fieldErrors?.[name] : undefined;
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="flex cursor-pointer items-start gap-2.5 text-[14px] leading-snug text-ink">
        <input id={id} name={name} type="checkbox" defaultChecked={defaultChecked} className="mt-0.5 size-[18px] shrink-0 rounded-xs accent-brand-700" aria-invalid={!!error || undefined} {...props} />
        <span>{label}</span>
      </label>
      {error ? <p className="mt-1 text-[12.5px] font-medium text-bad-600" role="alert">{error}</p> : null}
    </div>
  );
}

/** Money input: shows OMR with up to three decimals. Submitted as text and parsed on the server. */
export function MoneyInput({ className, ...props }: ComponentProps<"input">) {
  return <Input inputMode="decimal" autoComplete="off" placeholder="0.000" className={cn("tabular-nums", className)} {...props} />;
}

export function Switch({ name, defaultChecked, label, description }: { name: string; defaultChecked?: boolean; label: ReactNode; description?: ReactNode }) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start justify-between gap-4 rounded-md border border-line bg-surface p-3.5">
      <span className="min-w-0">
        <span className="block text-[14px] font-medium text-ink">{label}</span>
        {description ? <span className="mt-0.5 block text-[12.5px] text-ink-3">{description}</span> : null}
      </span>
      <span className="relative mt-0.5 inline-flex h-6 w-11 shrink-0">
        <input id={id} name={name} type="checkbox" defaultChecked={defaultChecked} className="peer sr-only" />
        <span className="absolute inset-0 rounded-full bg-line-strong transition-colors peer-checked:bg-brand-700 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500 peer-focus-visible:ring-offset-2" />
        <span className="absolute start-0.5 top-0.5 size-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5 rtl:peer-checked:-translate-x-5" />
        <Check className="pointer-events-none absolute start-1.5 top-1.5 size-3 text-white opacity-0 peer-checked:opacity-100" aria-hidden />
      </span>
    </label>
  );
}

/** Fields shared by many forms. */
export function FormGrid({ children, cols = 2 }: { children: ReactNode; cols?: 1 | 2 | 3 }) {
  return <div className={cn("grid gap-4", cols === 2 && "sm:grid-cols-2", cols === 3 && "sm:grid-cols-3")}>{children}</div>;
}

export function FormActions({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:items-center sm:justify-end", className)}>{children}</div>;
}
