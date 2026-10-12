"use client";

import { useState, type ReactNode } from "react";
import { Dialog, DropdownMenu } from "radix-ui";
import { MoreHorizontal, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button, type ButtonVariant } from "./button";
import { ActionForm, Alert, FormActions, SubmitButton, type FormAction } from "./form";
import { useI18n } from "../i18n-provider";

/**
 * Modal on desktop, bottom sheet on phones. Content scrolls inside a height capped panel so the virtual
 * keyboard never hides the submit button.
 */
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  size = "md",
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const { t } = useI18n();
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="anim-overlay fixed inset-0 z-50 bg-brand-950/45 backdrop-blur-[1px]" />
        <Dialog.Content
          className={cn(
            "anim-sheet dvh-90 fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-lg border border-line bg-surface shadow-pop outline-none",
            "pb-safe md:anim-pop md:inset-auto md:start-1/2 md:top-1/2 md:w-full md:-translate-y-1/2 md:rounded-lg md:pb-0 ltr:md:-translate-x-1/2 rtl:md:translate-x-1/2",
            size === "sm" && "md:max-w-sm",
            size === "md" && "md:max-w-lg",
            size === "lg" && "md:max-w-2xl",
          )}
        >
          <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <Dialog.Title className="text-[16px] font-semibold text-ink">{title}</Dialog.Title>
              {description ? <Dialog.Description className="mt-1 text-[13.5px] text-ink-2">{description}</Dialog.Description> : <Dialog.Description className="sr-only">{String(title)}</Dialog.Description>}
            </div>
            <Dialog.Close className="-m-1.5 rounded-sm p-1.5 text-ink-3 hover:bg-black/5 hover:text-ink" aria-label={t("common.close")}>
              <X className="size-5" />
            </Dialog.Close>
          </div>
          <div className="overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * A button that opens a dialog containing a small server action form.
 * Used for every consequential step: deposit, bounce, void, approve, assign, and so on.
 */
export function ActionDialog({
  trigger,
  title,
  description,
  action,
  hidden,
  submitLabel,
  submitVariant = "primary",
  triggerVariant = "secondary",
  triggerSize = "sm",
  triggerClassName,
  children,
  size,
  warning,
  triggerIcon,
  iconOnly,
}: {
  trigger: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action: FormAction;
  hidden?: Record<string, string>;
  submitLabel?: ReactNode;
  submitVariant?: ButtonVariant;
  triggerVariant?: ButtonVariant;
  triggerSize?: "sm" | "md" | "lg";
  triggerClassName?: string;
  children?: ReactNode;
  size?: "sm" | "md" | "lg";
  warning?: ReactNode;
  triggerIcon?: ReactNode;
  iconOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { t } = useI18n();
  return (
    <>
      <Button
        variant={triggerVariant}
        size={triggerSize}
        className={triggerClassName}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={iconOnly && typeof trigger === "string" ? trigger : undefined}
      >
        {triggerIcon}
        {iconOnly ? <span className="sr-only">{trigger}</span> : trigger}
      </Button>
      <Modal open={open} onOpenChange={setOpen} title={title} description={description} size={size}>
        <ActionForm action={action} onSuccess={() => setOpen(false)} className="space-y-4">
          {hidden ? Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />) : null}
          {warning ? <Alert tone="warn">{warning}</Alert> : null}
          {children}
          <FormActions>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <SubmitButton variant={submitVariant}>{submitLabel ?? t("common.confirm")}</SubmitButton>
          </FormActions>
        </ActionForm>
      </Modal>
    </>
  );
}

/** Dialog that is opened by app code (for example from a menu item) rather than its own trigger. */
export function ControlledActionDialog(props: Omit<Parameters<typeof ActionDialog>[0], "trigger" | "triggerVariant" | "triggerSize" | "triggerClassName" | "triggerIcon" | "iconOnly"> & { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { open, onOpenChange, title, description, action, hidden, submitLabel, submitVariant, children, size, warning } = props;
  const { t } = useI18n();
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={title} description={description} size={size}>
      <ActionForm action={action} onSuccess={() => onOpenChange(false)} className="space-y-4">
        {hidden ? Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />) : null}
        {warning ? <Alert tone="warn">{warning}</Alert> : null}
        {children}
        <FormActions>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <SubmitButton variant={submitVariant ?? "primary"}>{submitLabel ?? t("common.confirm")}</SubmitButton>
        </FormActions>
      </ActionForm>
    </Modal>
  );
}

/** Row overflow menu. Items are plain links or buttons. */
export function RowMenu({ children, label }: { children: ReactNode; label: string }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="ghost" size="sm" className="size-9 px-0" aria-label={label}>
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={4} className="anim-pop z-50 min-w-44 rounded-md border border-line bg-surface p-1 shadow-pop">
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function MenuItem({ children, onSelect, className }: { children: ReactNode; onSelect?: () => void; className?: string }) {
  return (
    <DropdownMenu.Item
      onSelect={onSelect}
      className={cn("flex cursor-pointer items-center gap-2 rounded-xs px-2.5 py-2 text-[14px] text-ink outline-none data-[highlighted]:bg-brand-50", className)}
    >
      {children}
    </DropdownMenu.Item>
  );
}
