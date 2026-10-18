import Link from "next/link";
import { SearchX } from "lucide-react";
import { EmptyState } from "@/components/ui/display";
import { buttonClass } from "@/components/ui/button";
import { getT } from "@/lib/session";

export default async function NotFound() {
  const t = await getT();
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg items-center px-4">
      <EmptyState className="w-full" icon={<SearchX className="size-5" />} title={t("err.not_found")} action={<Link href="/" className={buttonClass("primary")}>{t("nav.home")}</Link>} />
    </main>
  );
}
