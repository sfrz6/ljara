import { test, type Page } from "@playwright/test";

/** Visual review helper. Writes screenshots to .data/shots. Run: npx playwright test e2e/shots.spec.ts --project=mobile */
const PASSWORD = "Ijara-Demo-2026";
const lang = process.env.SHOT_LANG ?? "ar";

async function setLang(page: Page, l: string) {
  await page.addInitScript(() => localStorage.setItem("ijara_install_dismissed", String(Date.now())));
  await page.context().addCookies([{ name: "ijara_locale", value: l, url: "http://localhost:3201" }]);
}

test.use({ viewport: { width: Number(process.env.SHOT_W ?? 360), height: 760 } });

test("staff pages", async ({ page }) => {
  await setLang(page, lang);
  await page.goto("/login");
  await page.screenshot({ path: `.data/shots/${lang}-login.png`, fullPage: true });
  await page.locator('input[name="email"]').fill("manager@alsahil.demo");
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.locator('input[name="email"]').locator("xpath=ancestor::form").locator('button[type="submit"]').click();
  await page.waitForURL(/dashboard/, { timeout: 60_000 });
  await setLang(page, lang);
  for (const [name, path] of [["dashboard", "/dashboard"], ["cheques", "/cheques"], ["units", "/units"], ["contracts", "/contracts"], ["contract-new", "/contracts/new"], ["maintenance", "/maintenance"], ["statements", "/statements"], ["settings", "/settings?tab=finance"], ["tenants", "/tenants"]]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: `.data/shots/${lang}-${name}.png`, fullPage: true });
  }
  await page.goto("/dashboard");
  await page.getByRole("button", { name: /menu|القائمة|more|المزيد/i }).first().click();
  await page.screenshot({ path: `.data/shots/${lang}-drawer.png` });
});

test("tenant pages", async ({ page }) => {
  await setLang(page, lang);
  await page.goto("/portal/login");
  await page.screenshot({ path: `.data/shots/${lang}-portal-login.png`, fullPage: true });
  await page.locator('input[name="idNumber"]').fill("12345678");
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.locator('input[name="idNumber"]').locator("xpath=ancestor::form").locator('button[type="submit"]').click();
  await page.waitForURL(/\/portal$/, { timeout: 60_000 });
  await setLang(page, lang);
  for (const [name, path] of [["portal-home", "/portal"], ["portal-schedule", "/portal/schedule"], ["portal-requests", "/portal/maintenance"], ["portal-new", "/portal/maintenance/new"], ["portal-receipts", "/portal/receipts"]]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: `.data/shots/${lang}-${name}.png`, fullPage: true });
  }
});
