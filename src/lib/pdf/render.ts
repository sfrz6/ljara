import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * HTML to PDF through headless Chromium, which has the best Arabic shaping available (proposal 4.7).
 * Locally the installed Chrome or Edge is used; on Vercel @sparticuz/chromium provides the binary.
 * Fonts are embedded from the @fontsource packages so the Arabic never falls back to boxes.
 */

const LOCAL_BROWSERS = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter((p): p is string => !!p);

const FONT_FILES: [string, string, number][] = [
  ["IBM Plex Sans Arabic", "ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-400-normal.woff2", 400],
  ["IBM Plex Sans Arabic", "ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-600-normal.woff2", 600],
  ["IBM Plex Sans Arabic", "ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-700-normal.woff2", 700],
  ["IBM Plex Sans Arabic", "ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-latin-400-normal.woff2", 400],
  ["IBM Plex Sans Arabic", "ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-latin-600-normal.woff2", 600],
  ["IBM Plex Sans", "ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff2", 400],
  ["IBM Plex Sans", "ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff2", 600],
];

let fontCss: string | null = null;
export function embeddedFontCss(): string {
  if (fontCss) return fontCss;
  const base = path.join(process.cwd(), "node_modules", "@fontsource");
  fontCss = FONT_FILES.map(([family, rel, weight]) => {
    const file = path.join(base, rel);
    if (!existsSync(file)) return "";
    const b64 = readFileSync(file).toString("base64");
    const isArabic = rel.includes("-arabic-arabic-");
    const range = isArabic ? "unicode-range: U+0600-06FF, U+0750-077F, U+FB50-FDFF, U+FE70-FEFF, U+200C-200F;" : "unicode-range: U+0000-00FF, U+2000-206F, U+20AC;";
    return `@font-face{font-family:'${family}';font-weight:${weight};src:url(data:font/woff2;base64,${b64}) format('woff2');${range}}`;
  }).join("\n");
  return fontCss;
}

async function launch() {
  const puppeteer = (await import("puppeteer-core")).default;
  const local = LOCAL_BROWSERS.find((p) => existsSync(p));
  if (local && !process.env.VERCEL) {
    return puppeteer.launch({ executablePath: local, headless: true, args: ["--no-sandbox", "--disable-gpu"] });
  }
  const chromium = (await import("@sparticuz/chromium")).default;
  return puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true,
  });
}

export async function renderPdf(html: string): Promise<Buffer> {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    const pdf = await page.pdf({ format: "A4", printBackground: true, margin: { top: "14mm", bottom: "16mm", left: "14mm", right: "14mm" }, preferCSSPageSize: false });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

export type RenderedDocument = { kind: "pdf"; body: Buffer } | { kind: "html"; body: string };

/**
 * Render to PDF; if headless Chromium cannot start (memory limit, missing binary) fall back to the same document as
 * printable HTML so the office can still use the browser's Save as PDF instead of seeing an error.
 */
export async function renderDocument(html: string): Promise<RenderedDocument> {
  try {
    return { kind: "pdf", body: await renderPdf(html) };
  } catch (e) {
    console.error("PDF rendering failed, serving printable HTML", e);
    const printable = html.replace("</body>", `<script>window.addEventListener("load",function(){setTimeout(function(){window.print()},400)})</script></body>`);
    return { kind: "html", body: printable };
  }
}

export function documentResponse(doc: RenderedDocument, filename: string): Response {
  const headers = { "Cache-Control": "private, no-store" };
  if (doc.kind === "html") return new Response(doc.body, { headers: { ...headers, "Content-Type": "text/html; charset=utf-8", "X-Ijara-Fallback": "html" } });
  return new Response(new Uint8Array(doc.body), { headers: { ...headers, "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${filename}"` } });
}
