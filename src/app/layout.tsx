import type { Metadata, Viewport } from "next";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-sans/700.css";
import "@fontsource/ibm-plex-sans-arabic/400.css";
import "@fontsource/ibm-plex-sans-arabic/500.css";
import "@fontsource/ibm-plex-sans-arabic/600.css";
import "@fontsource/ibm-plex-sans-arabic/700.css";
import "./globals.css";
import { I18nProvider } from "@/components/i18n-provider";
import { AppToaster, FlashToaster } from "@/components/toaster";
import { PwaRuntime } from "@/components/pwa";
import { dirOf } from "@/i18n";
import { getLocale } from "@/lib/session";

export const metadata: Metadata = {
  title: { default: "Ijara", template: "%s | Ijara" },
  description: "Property management for letting offices in Oman. Cheques, rent, maintenance and owner statements in Arabic and English.",
  applicationName: "Ijara",
  robots: { index: false, follow: false },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Ijara", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
  other: { "apple-mobile-web-app-capable": "yes", "mobile-web-app-capable": "yes" },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }, { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0f3d3a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} dir={dirOf(locale)} suppressHydrationWarning>
      <body>
        <I18nProvider locale={locale}>
          {children}
          <AppToaster dir={dirOf(locale)} />
          <FlashToaster />
          <PwaRuntime />
        </I18nProvider>
      </body>
    </html>
  );
}
