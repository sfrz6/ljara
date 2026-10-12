"use client";

import type { ReactNode } from "react";
import { ActionForm, SubmitButton, type FormAction } from "./form";
import type { ButtonVariant } from "./button";

/** One tap action (for example Mark collected) that posts to a server action with hidden ids. */
export function QuickAction({
  action,
  hidden,
  children,
  variant = "primary",
  size = "sm",
  className,
  icon,
}: {
  action: FormAction;
  hidden: Record<string, string>;
  children: ReactNode;
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  className?: string;
  icon?: ReactNode;
}) {
  return (
    <ActionForm action={action} className="inline-block" hideBanner>
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <SubmitButton variant={variant} size={size} className={className} pendingLabel="...">
        {icon}
        {children}
      </SubmitButton>
    </ActionForm>
  );
}
