"use client";

import { FileDown, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonClass } from "@/components/ui/button";
import { useI18n } from "@/components/i18n-provider";

/**
 * Delivery is the manager's call (proposal 14.5): download the PDF or share it from his own phone to WhatsApp.
 * On phones the native share sheet attaches the PDF; on desktop it opens WhatsApp Web with a message and downloads the file.
 * Every share is recorded in the audit trail by the PDF route.
 */
export function ShareBar({ id, number }: { id: string; number: string }) {
  const { t, locale } = useI18n();
  async function share() {
    try {
      const res = await fetch(`/api/pdf/statement/${id}?lang=${locale}&share=whatsapp`);
      if (!res.ok || !(res.headers.get("content-type") ?? "").includes("pdf")) throw new Error();
      const blob = await res.blob();
      const file = new File([blob], `${number}.pdf`, { type: "application/pdf" });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file], title: number });
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${number}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      window.open(`https://wa.me/?text=${encodeURIComponent(`${t("statement.share_text")} ${number}`)}`, "_blank", "noopener");
      toast.success(t("statement.share_downloaded"));
    } catch {
      toast.error(t("err.generic"));
    }
  }
  return (
    <>
      <a className={buttonClass("secondary")} href={`/api/pdf/statement/${id}?lang=ar&share=download`} target="_blank" rel="noreferrer"><FileDown className="size-4" aria-hidden />PDF · العربية</a>
      <a className={buttonClass("secondary")} href={`/api/pdf/statement/${id}?lang=en&share=download`} target="_blank" rel="noreferrer"><FileDown className="size-4" aria-hidden />PDF · English</a>
      <Button onClick={share}><MessageCircle className="size-4" aria-hidden />{t("statement.share_whatsapp")}</Button>
    </>
  );
}
