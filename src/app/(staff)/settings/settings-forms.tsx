"use client";

import { Check } from "lucide-react";
import { Badge, Card, CardBody, CardHeader } from "@/components/ui/display";
import { ActionForm, Alert, Checkbox, Field, FormActions, FormGrid, Input, Select, SubmitButton, Switch, Textarea } from "@/components/ui/form";
import { DocumentPicker } from "@/components/ui/file-input";
import { ActionDialog } from "@/components/ui/overlays";
import { QuickAction } from "@/components/ui/quick-action";
import { useI18n } from "@/components/i18n-provider";
import { bpToPercentString } from "@/lib/money";
import type { NotificationPrefs } from "@/db/schema";
import {
  changeRoleAction, forceSignOutAction, inviteStaffAction, resetTemplateAction, saveTemplateAction, setActiveAction, toggleTwoFactorAction,
  revokeSessionAction, updateFinanceAction, updateNotificationPrefsAction, updateOrgAction, upsertCategoryAction,
} from "@/app/actions/settings";

interface Org {
  name: string; nameAr: string | null; phone: string | null; email: string | null; address: string | null; crNumber: string | null; defaultLocale: string; logoFileId: string | null;
  defaultCommissionBp: number; defaultPayoutFrequency: string; receiptPrefix: string; rentIncreaseCapBp: number | null; contractAlertDays: number;
  gatewayFeeBp: number; gatewayFeeMode: string; vatBp: number; vatEnabled: boolean; onlinePaymentsEnabled: boolean; tenantScheduleVisible: boolean;
}

export function OrgForm({ org }: { org: Org }) {
  const { t } = useI18n();
  return (
    <Card><CardHeader title={t("settings.org")} description={t("settings.org_hint")} /><CardBody>
      <ActionForm action={updateOrgAction} encType="multipart/form-data">
        <FormGrid>
          <Field label={t("owner.name_en")} name="name" required><Input name="name" defaultValue={org.name} /></Field>
          <Field label={t("owner.name_ar")} name="nameAr" optional><Input name="nameAr" dir="rtl" defaultValue={org.nameAr ?? ""} /></Field>
          <Field label={t("common.phone")} name="phone" optional><Input name="phone" type="tel" defaultValue={org.phone ?? ""} /></Field>
          <Field label={t("common.email")} name="email" optional><Input name="email" type="email" defaultValue={org.email ?? ""} /></Field>
          <Field label={t("settings.cr")} name="crNumber" optional><Input name="crNumber" defaultValue={org.crNumber ?? ""} /></Field>
          <Field label={t("settings.default_language")} name="defaultLocale"><Select name="defaultLocale" defaultValue={org.defaultLocale}><option value="ar">{t("common.arabic")}</option><option value="en">{t("common.english")}</option></Select></Field>
        </FormGrid>
        <Field label={t("building.address")} name="address" optional><Textarea name="address" rows={2} defaultValue={org.address ?? ""} /></Field>
        <DocumentPicker name="logo" label={t("settings.logo")} accept="image/jpeg,image/png,image/webp" hint={t("settings.logo_hint")} />
        <FormActions><SubmitButton>{t("common.save")}</SubmitButton></FormActions>
      </ActionForm>
    </CardBody></Card>
  );
}

export function FinanceForm({ org }: { org: Org }) {
  const { t } = useI18n();
  return (
    <ActionForm action={updateFinanceAction}>
      <Card><CardHeader title={t("settings.commission")} description={t("settings.commission_hint")} /><CardBody className="space-y-4">
        <FormGrid>
          <Field label={t("owner.commission")} name="defaultCommission" required><Input name="defaultCommission" inputMode="decimal" defaultValue={bpToPercentString(org.defaultCommissionBp)} /></Field>
          <Field label={t("owner.payout")} name="defaultPayoutFrequency"><Select name="defaultPayoutFrequency" defaultValue={org.defaultPayoutFrequency}>{["monthly", "quarterly", "semi_annual", "annual", "other"].map((f) => <option key={f} value={f}>{t(`freq.${f}` as never)}</option>)}</Select></Field>
          <Field label={t("settings.receipt_default")} name="receiptPrefix" hint={t("settings.receipt_hint")} required><Input name="receiptPrefix" defaultValue={org.receiptPrefix} className="uppercase" maxLength={8} /></Field>
          <Field label={t("settings.alert_days")} name="contractAlertDays" hint={t("settings.alert_days_hint")}><Input name="contractAlertDays" type="number" min={1} max={365} defaultValue={org.contractAlertDays} /></Field>
        </FormGrid>
      </CardBody></Card>
      <Card><CardHeader title={t("settings.rent_cap")} description={t("settings.rent_cap_hint")} /><CardBody>
        <Field label={t("owner.cap")} name="rentCap" optional><Input name="rentCap" inputMode="decimal" defaultValue={org.rentIncreaseCapBp != null ? bpToPercentString(org.rentIncreaseCapBp) : ""} /></Field>
      </CardBody></Card>
      <Card><CardHeader title={t("settings.online")} description={t("settings.online_hint")} /><CardBody className="space-y-4">
        <Switch name="onlinePayments" defaultChecked={org.onlinePaymentsEnabled} label={t("settings.online_enable")} description={t("settings.online_enable_hint")} />
        <FormGrid>
          <Field label={t("settings.gateway_fee")} name="gatewayFee"><Input name="gatewayFee" inputMode="decimal" defaultValue={bpToPercentString(org.gatewayFeeBp)} /></Field>
          <Field label={t("settings.gateway_mode")} name="gatewayFeeMode" hint={t("settings.gateway_mode_hint")}><Select name="gatewayFeeMode" defaultValue={org.gatewayFeeMode}>
            <option value="office_absorbs">{t("settings.mode_a")}</option><option value="owner_net">{t("settings.mode_b")}</option><option value="owner_line">{t("settings.mode_c")}</option>
          </Select></Field>
        </FormGrid>
        <Switch name="tenantSchedule" defaultChecked={org.tenantScheduleVisible} label={t("settings.tenant_schedule")} description={t("settings.tenant_schedule_hint")} />
      </CardBody></Card>
      <Card><CardHeader title={t("settings.vat")} description={t("settings.vat_hint")} /><CardBody className="space-y-4">
        <Switch name="vatEnabled" defaultChecked={org.vatEnabled} label={t("settings.vat_enable")} />
        <Field label={t("settings.vat_rate")} name="vatBp"><Input name="vatBp" inputMode="decimal" defaultValue={bpToPercentString(org.vatBp)} /></Field>
      </CardBody></Card>
      <FormActions><SubmitButton>{t("common.save")}</SubmitButton></FormActions>
    </ActionForm>
  );
}

export function NotificationForm({ prefs }: { prefs: NotificationPrefs }) {
  const { t } = useI18n();
  return (
    <ActionForm action={updateNotificationPrefsAction}>
      <Card><CardHeader title={t("settings.channels")} description={t("settings.channels_hint")} /><CardBody className="space-y-3">
        <Switch name="whatsapp" defaultChecked={prefs.channels.whatsapp} label={t("channel.whatsapp")} description={t("settings.whatsapp_hint")} />
        <Switch name="sms" defaultChecked={prefs.channels.sms} label={t("channel.sms")} />
        <Switch name="email" defaultChecked={prefs.channels.email} label={t("channel.email")} />
      </CardBody></Card>
      <Card><CardHeader title={t("settings.reminders")} /><CardBody className="space-y-4">
        <Field label={t("settings.reminder_days")} name="reminders" hint={t("settings.reminder_days_hint")}><Input name="reminders" defaultValue={prefs.reminderDaysBefore.join(", ")} /></Field>
        <Switch name="quiet" defaultChecked={prefs.quietHours.enabled} label={t("settings.quiet")} description={t("settings.quiet_hint")} />
        <FormGrid>
          <Field label={t("settings.quiet_start")} name="quietStart"><Input name="quietStart" type="number" min={0} max={23} defaultValue={prefs.quietHours.startHour} /></Field>
          <Field label={t("settings.quiet_end")} name="quietEnd"><Input name="quietEnd" type="number" min={0} max={23} defaultValue={prefs.quietHours.endHour} /></Field>
        </FormGrid>
      </CardBody></Card>
      <Card><CardHeader title={t("settings.staff_alerts")} /><CardBody className="space-y-2.5">
        <Checkbox name="chequeDue" label={t("settings.alert_cheque_due")} defaultChecked={prefs.staffAlerts.chequeDue} />
        <Checkbox name="chequeBounced" label={t("settings.alert_bounced")} defaultChecked={prefs.staffAlerts.chequeBounced} />
        <Checkbox name="maintenanceNew" label={t("settings.alert_maintenance")} defaultChecked={prefs.staffAlerts.maintenanceNew} />
        <Checkbox name="contractExpiring" label={t("settings.alert_expiring")} defaultChecked={prefs.staffAlerts.contractExpiring} />
      </CardBody></Card>
      <FormActions><SubmitButton>{t("common.save")}</SubmitButton></FormActions>
    </ActionForm>
  );
}

export function CategoriesPanel({ cats }: { cats: { id: string; nameEn: string; nameAr: string | null; active: boolean }[] }) {
  const { t } = useI18n();
  return (
    <Card><CardHeader title={t("settings.categories")} description={t("settings.categories_hint")} actions={
      <ActionDialog trigger={t("common.add")} triggerVariant="primary" title={t("settings.category_add")} action={upsertCategoryAction}>
        <Field label={t("owner.name_en")} name="nameEn" required><Input name="nameEn" /></Field>
        <Field label={t("owner.name_ar")} name="nameAr" optional><Input name="nameAr" dir="rtl" /></Field>
      </ActionDialog>} />
      <ul className="divide-y divide-line">
        {cats.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3 md:px-5">
            <span className="text-[14px] font-medium">{c.nameEn}{c.nameAr ? <span className="ms-2 text-ink-3">{c.nameAr}</span> : null} {!c.active ? <Badge>{t("settings.inactive")}</Badge> : null}</span>
            <ActionDialog trigger={t("common.edit")} triggerVariant="ghost" title={t("common.edit")} action={upsertCategoryAction} hidden={{ id: c.id }} submitLabel={t("common.save")}>
              <Field label={t("owner.name_en")} name="nameEn" required><Input name="nameEn" defaultValue={c.nameEn} /></Field>
              <Field label={t("owner.name_ar")} name="nameAr" optional><Input name="nameAr" dir="rtl" defaultValue={c.nameAr ?? ""} /></Field>
              <Checkbox name="active" label={t("settings.active")} defaultChecked={c.active} />
            </ActionDialog>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function StaffPanel({ staff, meId }: { staff: { id: string; name: string; email: string; role: string; active: boolean; lastLoginAt: string | null }[]; meId: string }) {
  const { t } = useI18n();
  const roles = ["manager", "accounts", "maintenance", "contracts"];
  return (
    <Card><CardHeader title={t("settings.staff")} description={t("settings.staff_hint")} actions={
      <ActionDialog trigger={t("settings.staff_add")} triggerVariant="primary" title={t("settings.staff_add")} action={inviteStaffAction} submitLabel={t("common.create")}>
        <FormGrid>
          <Field label={t("common.name")} name="name" required><Input name="name" /></Field>
          <Field label={t("common.email")} name="email" required><Input name="email" type="email" /></Field>
          <Field label={t("common.phone")} name="phone" optional><Input name="phone" type="tel" /></Field>
          <Field label={t("settings.role")} name="role"><Select name="role" defaultValue="accounts">{roles.map((r) => <option key={r} value={r}>{t(`role.${r}` as never)}</option>)}</Select></Field>
          <Field label={t("common.language")} name="locale"><Select name="locale" defaultValue="ar"><option value="ar">{t("common.arabic")}</option><option value="en">{t("common.english")}</option></Select></Field>
          <Field label={t("settings.temp_password")} name="password" hint={t("auth.password_hint")} required><Input name="password" type="password" autoComplete="new-password" /></Field>
        </FormGrid>
      </ActionDialog>} />
      <ul className="divide-y divide-line">
        {staff.map((u) => (
          <li key={u.id} className="space-y-2 px-4 py-3 md:px-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><p className="text-[14px] font-semibold">{u.name} {u.id === meId ? <Badge tone="brand">{t("common.you")}</Badge> : null} {!u.active ? <Badge tone="bad">{t("settings.inactive")}</Badge> : null}</p><p className="text-[12.5px] text-ink-3" dir="ltr">{u.email}</p></div>
              <Badge tone="brass">{t(`role.${u.role}` as never)}</Badge>
            </div>
            {u.id !== meId ? (
              <div className="flex flex-wrap gap-2">
                <ActionDialog trigger={t("settings.change_role")} title={t("settings.change_role")} description={t("settings.change_role_hint")} action={changeRoleAction} hidden={{ id: u.id }} submitLabel={t("common.save")}>
                  <Field label={t("settings.role")} name="role"><Select name="role" defaultValue={u.role}>{roles.map((r) => <option key={r} value={r}>{t(`role.${r}` as never)}</option>)}</Select></Field>
                </ActionDialog>
                <QuickAction action={setActiveAction} hidden={{ id: u.id, active: u.active ? "0" : "1" }} variant="ghost">{u.active ? t("settings.deactivate") : t("settings.reactivate")}</QuickAction>
                <QuickAction action={forceSignOutAction} hidden={{ id: u.id }} variant="ghost">{t("settings.force_signout")}</QuickAction>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function TemplatesPanel({ templates }: { templates: { key: string; audience: string; vars: string[]; en: string; ar: string; customEn: boolean; customAr: boolean; titleEn: string }[] }) {
  const { t } = useI18n();
  return (
    <div className="space-y-4">
      <Alert tone="info">{t("settings.templates_hint")}</Alert>
      {templates.map((tp) => (
        <Card key={tp.key}>
          <CardHeader title={tp.titleEn} description={<>{tp.audience === "tenant" ? t("common.tenant") : t("notif.staff")} · {tp.vars.map((v) => `{${v}}`).join(" ")}</>} />
          <CardBody className="grid gap-4 md:grid-cols-2">
            {(["en", "ar"] as const).map((l) => (
              <ActionForm key={l} action={saveTemplateAction} className="space-y-2">
                <input type="hidden" name="key" value={tp.key} /><input type="hidden" name="locale" value={l} />
                <Field label={l === "en" ? t("common.english") : t("common.arabic")} name="body"><Textarea name="body" rows={3} dir={l === "ar" ? "rtl" : "ltr"} defaultValue={tp[l]} /></Field>
                <div className="flex items-center gap-2"><SubmitButton size="sm" variant="secondary"><Check className="size-4" aria-hidden />{t("common.save")}</SubmitButton>
                  {(l === "en" ? tp.customEn : tp.customAr) ? <QuickAction action={resetTemplateAction} hidden={{ key: tp.key, locale: l }} variant="ghost">{t("settings.template_reset")}</QuickAction> : null}</div>
              </ActionForm>
            ))}
          </CardBody>
        </Card>
      ))}
    </div>
  );
}

export function SecurityPanel({ enabled, sessions }: { enabled: boolean; sessions: { id: string; agent: string; lastSeen: string; current: boolean }[] }) {
  const { t } = useI18n();
  return (
    <div className="space-y-5">
    <Card><CardHeader title={t("settings.security")} description={t("settings.two_factor_hint")} /><CardBody>
      <p className="mb-3 text-[14px]">{t("settings.two_factor")}: <Badge tone={enabled ? "ok" : "neutral"}>{enabled ? t("common.yes") : t("common.no")}</Badge></p>
      <QuickAction action={toggleTwoFactorAction} hidden={{ enabled: enabled ? "0" : "1" }} variant="secondary" size="md">{enabled ? t("settings.two_factor_off") : t("settings.two_factor_on")}</QuickAction>
    </CardBody></Card>
    <Card><CardHeader title={t("settings.devices")} description={t("settings.devices_hint")} />
      <ul className="divide-y divide-line">
        {sessions.map((x) => (
          <li key={x.id} className="flex items-center justify-between gap-3 px-4 py-3 md:px-5">
            <div className="min-w-0"><p className="truncate text-[14px] font-medium">{x.agent} {x.current ? <Badge tone="brand">{t("settings.this_device")}</Badge> : null}</p><p className="text-[12.5px] text-ink-3">{t("settings.last_seen", { date: x.lastSeen })}</p></div>
            {!x.current ? <QuickAction action={revokeSessionAction} hidden={{ id: x.id }} variant="ghost">{t("nav.sign_out")}</QuickAction> : null}
          </li>
        ))}
      </ul>
    </Card>
    </div>
  );
}
