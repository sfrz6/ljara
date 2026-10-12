/**
 * Notification catalogue (proposal M-10). Every message exists in Arabic and English and is sent in the
 * recipient's language. Organisations can override the wording in Settings > Message templates.
 */

export type Audience = "tenant" | "staff";

export interface TemplateDef {
  key: string;
  audience: Audience;
  /** Urgent messages ignore quiet hours. */
  urgent: boolean;
  /** OTP style messages only ever go by SMS (proposal 2.3.3). */
  smsOnly?: boolean;
  subject: { en: string; ar: string };
  body: { en: string; ar: string };
  vars: string[];
}

export const TEMPLATES: TemplateDef[] = [
  {
    key: "otp_activation",
    audience: "tenant",
    urgent: true,
    smsOnly: true,
    subject: { en: "Your Ijara activation code", ar: "رمز تفعيل حسابك في إجارة" },
    body: {
      en: "Your Ijara activation code is {code}. It expires in 10 minutes. Do not share it with anyone.",
      ar: "رمز تفعيل حسابك في إجارة هو {code}. ينتهي خلال 10 دقائق. لا تشاركه مع أحد.",
    },
    vars: ["code"],
  },
  {
    key: "otp_reset",
    audience: "tenant",
    urgent: true,
    smsOnly: true,
    subject: { en: "Your Ijara password reset code", ar: "رمز إعادة تعيين كلمة المرور" },
    body: {
      en: "Your Ijara password reset code is {code}. It expires in 10 minutes. Do not share it with anyone.",
      ar: "رمز إعادة تعيين كلمة المرور في إجارة هو {code}. ينتهي خلال 10 دقائق. لا تشاركه مع أحد.",
    },
    vars: ["code"],
  },
  {
    key: "tenant_welcome",
    audience: "tenant",
    urgent: false,
    subject: { en: "Activate your tenant account", ar: "فعّل حسابك كمستأجر" },
    body: {
      en: "Welcome {name}. {org} created your tenant account. Activate it with your ID number and a code sent to this number: {link}",
      ar: "مرحباً {name}. أنشأ مكتب {org} حسابك كمستأجر. فعّل الحساب برقم بطاقتك ورمز يصلك على هذا الرقم: {link}",
    },
    vars: ["name", "org", "link"],
  },
  {
    key: "rent_reminder",
    audience: "tenant",
    urgent: false,
    subject: { en: "Rent due soon", ar: "اقترب موعد سداد الإيجار" },
    body: {
      en: "{org}: your rent of {amount} for unit {unit} is due on {date}. You can pay online or through your post-dated cheque.",
      ar: "{org}: إيجار الوحدة {unit} بقيمة {amount} يستحق بتاريخ {date}. يمكنك السداد إلكترونياً أو عبر الشيك المسلّم.",
    },
    vars: ["org", "amount", "unit", "date"],
  },
  {
    key: "receipt_issued",
    audience: "tenant",
    urgent: false,
    subject: { en: "Your receipt", ar: "إيصال الدفع" },
    body: {
      en: "Receipt {number} for {amount} received on {date}. Thank you. Download it: {link}",
      ar: "تم استلام {amount} بتاريخ {date}، رقم الإيصال {number}. شكراً لك. حمّل الإيصال: {link}",
    },
    vars: ["number", "amount", "date", "link"],
  },
  {
    key: "payment_link",
    audience: "tenant",
    urgent: false,
    subject: { en: "Pay your rent online", ar: "ادفع إيجارك إلكترونياً" },
    body: {
      en: "{org}: pay {amount} due {date} securely online: {link}",
      ar: "{org}: ادفع مبلغ {amount} المستحق بتاريخ {date} بشكل آمن عبر الإنترنت: {link}",
    },
    vars: ["org", "amount", "date", "link"],
  },
  {
    key: "payment_failed",
    audience: "tenant",
    urgent: false,
    subject: { en: "Payment not completed", ar: "لم تكتمل عملية الدفع" },
    body: {
      en: "Your online payment of {amount} was not completed. No money was taken. You can try again from the app: {link}",
      ar: "لم تكتمل عملية الدفع الإلكتروني بقيمة {amount}. لم يتم خصم أي مبلغ. يمكنك المحاولة مجدداً من التطبيق: {link}",
    },
    vars: ["amount", "link"],
  },
  {
    key: "maintenance_received",
    audience: "tenant",
    urgent: false,
    subject: { en: "Maintenance request received", ar: "تم استلام طلب الصيانة" },
    body: {
      en: "We received your maintenance request {reference}: {title}. We will update you as it progresses.",
      ar: "تم استلام طلب الصيانة {reference}: {title}. سنوافيك بالتحديثات أولاً بأول.",
    },
    vars: ["reference", "title"],
  },
  {
    key: "maintenance_in_progress",
    audience: "tenant",
    urgent: false,
    subject: { en: "Maintenance in progress", ar: "الصيانة قيد التنفيذ" },
    body: {
      en: "Work has started on your request {reference}: {title}.",
      ar: "بدأ العمل على طلبك {reference}: {title}.",
    },
    vars: ["reference", "title"],
  },
  {
    key: "maintenance_completed",
    audience: "tenant",
    urgent: false,
    subject: { en: "Maintenance completed", ar: "اكتملت الصيانة" },
    body: {
      en: "Your request {reference}: {title} has been completed. Please contact the office if anything is still wrong.",
      ar: "اكتمل طلبك {reference}: {title}. يرجى التواصل مع المكتب إذا بقيت أي مشكلة.",
    },
    vars: ["reference", "title"],
  },
  {
    key: "cheque_due",
    audience: "staff",
    urgent: false,
    subject: { en: "Cheques due for deposit", ar: "شيكات مستحقة للإيداع" },
    body: {
      en: "Cheque {number} ({amount}) from {tenant} for {unit} is now due for deposit.",
      ar: "الشيك {number} بقيمة {amount} من {tenant} للوحدة {unit} أصبح مستحقاً للإيداع.",
    },
    vars: ["number", "amount", "tenant", "unit"],
  },
  {
    key: "cheque_bounced",
    audience: "staff",
    urgent: true,
    subject: { en: "Cheque bounced", ar: "شيك مرتجع" },
    body: {
      en: "BOUNCED: cheque {number} ({amount}) from {tenant} for {unit}. Follow up is required.",
      ar: "مرتجع: الشيك {number} بقيمة {amount} من {tenant} للوحدة {unit}. يلزم المتابعة.",
    },
    vars: ["number", "amount", "tenant", "unit"],
  },
  {
    key: "maintenance_new",
    audience: "staff",
    urgent: false,
    subject: { en: "New maintenance request", ar: "طلب صيانة جديد" },
    body: {
      en: "New request {reference} for {unit}: {title}.",
      ar: "طلب صيانة جديد {reference} للوحدة {unit}: {title}.",
    },
    vars: ["reference", "unit", "title"],
  },
  {
    key: "maintenance_assigned",
    audience: "staff",
    urgent: false,
    subject: { en: "Request assigned to you", ar: "تم إسناد طلب إليك" },
    body: {
      en: "Request {reference} for {unit} was assigned to you: {title}.",
      ar: "تم إسناد الطلب {reference} للوحدة {unit} إليك: {title}.",
    },
    vars: ["reference", "unit", "title"],
  },
  {
    key: "contract_expiring",
    audience: "staff",
    urgent: false,
    subject: { en: "Contract expiring", ar: "عقد قارب على الانتهاء" },
    body: {
      en: "Contract {reference} for {unit} ({tenant}) ends on {date}. Decide: renew or move out.",
      ar: "العقد {reference} للوحدة {unit} ({tenant}) ينتهي بتاريخ {date}. يلزم القرار: تجديد أو إخلاء.",
    },
    vars: ["reference", "unit", "tenant", "date"],
  },
  {
    key: "inspection_ready",
    audience: "staff",
    urgent: false,
    subject: { en: "Inspection ready for approval", ar: "فحص جاهز للاعتماد" },
    body: {
      en: "Unit {unit} was inspected. Review and approve it to make it available again.",
      ar: "تم فحص الوحدة {unit}. راجع واعتمد لإعادتها إلى الحالة المتاحة.",
    },
    vars: ["unit"],
  },
  {
    key: "inspection_requested",
    audience: "staff",
    urgent: false,
    subject: { en: "Move-out inspection needed", ar: "مطلوب فحص ما بعد الإخلاء" },
    body: {
      en: "Unit {unit} was vacated and needs an inspection.",
      ar: "تم إخلاء الوحدة {unit} وتحتاج إلى فحص.",
    },
    vars: ["unit"],
  },
  {
    key: "online_payment_received",
    audience: "staff",
    urgent: false,
    subject: { en: "Online payment received", ar: "تم استلام دفعة إلكترونية" },
    body: {
      en: "{tenant} paid {amount} online for unit {unit}. Receipt {number} was issued.",
      ar: "دفع {tenant} مبلغ {amount} إلكترونياً للوحدة {unit}. تم إصدار الإيصال {number}.",
    },
    vars: ["tenant", "amount", "unit", "number"],
  },
];

export const TEMPLATE_BY_KEY: Record<string, TemplateDef> = Object.fromEntries(TEMPLATES.map((t) => [t.key, t]));

export function interpolate(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
}
