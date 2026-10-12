import { WifiOff } from "lucide-react";

export const dynamic = "force-static";

/** Shown by the service worker when the network is down. Bilingual because the locale cookie is not readable offline. */
export default function Offline() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
      <WifiOff className="size-10 text-ink-3" aria-hidden />
      <h1 className="text-xl font-semibold">You are offline</h1>
      <p className="text-ink-2">Check your connection and try again.</p>
      <h2 className="mt-4 text-xl font-semibold" dir="rtl" lang="ar">أنت غير متصل</h2>
      <p className="text-ink-2" dir="rtl" lang="ar">تحقق من اتصالك وحاول مرة أخرى.</p>
    </main>
  );
}
