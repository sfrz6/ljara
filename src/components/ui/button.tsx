import Link from "next/link";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "accent" | "quiet";
export type ButtonSize = "sm" | "md" | "lg";

const base =
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-sm font-medium transition-colors select-none disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-brand-800 text-white hover:bg-brand-700 active:bg-brand-900 shadow-card",
  secondary: "bg-surface text-ink border border-line-strong hover:bg-surface-2 active:bg-canvas",
  ghost: "text-ink-2 hover:bg-black/5 active:bg-black/10",
  quiet: "text-brand-700 hover:bg-brand-50 active:bg-brand-100",
  danger: "bg-bad-600 text-white hover:bg-bad-700 active:bg-bad-700 shadow-card",
  accent: "bg-brass-500 text-white hover:bg-brass-600 active:bg-brass-700 shadow-card",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-[13px] md:h-8",
  md: "h-11 px-4 text-[15px] md:h-9 md:text-[14px]",
  lg: "h-12 px-5 text-base md:h-11",
};

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}

export interface ButtonProps extends ComponentProps<"button"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  asChild?: boolean;
}

export function Button({ variant, size, asChild, className, type = "button", ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return <Comp type={asChild ? undefined : type} className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({
  variant,
  size,
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}
