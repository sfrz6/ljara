import { expect, test, type Page } from "@playwright/test";

const PASSWORD = "Ijara-Demo-2026";

async function staffLogin(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel(/email|البريد/i).fill(email);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.locator('form button[type="submit"]').filter({ hasText: /sign in|تسجيل الدخول/i }).click();
  await page.waitForURL(/dashboard|platform/, { timeout: 60_000 });
}

async function noHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "page must not scroll sideways").toBeLessThanOrEqual(1);
}

test.describe("staff", () => {
  test("manager sees the bounced cheque alert and the cheque queue", async ({ page }) => {
    await staffLogin(page, "manager@alsahil.demo");
    await expect(page.getByText(/bounced cheques need action|شيكات مرتجعة تحتاج إجراء/i)).toBeVisible();
    await noHorizontalOverflow(page);
    await page.goto("/cheques");
    await expect(page.locator("main")).toContainText(/Insufficient funds/);
    await noHorizontalOverflow(page);
  });

  test("switching to Arabic flips the layout to RTL", async ({ page }) => {
    await staffLogin(page, "manager@alsahil.demo");
    const html = page.locator("html");
    const wasAr = (await html.getAttribute("lang")) === "ar";
    const menu = page.getByRole("button", { name: /menu|القائمة/i });
    if (await menu.isVisible()) await menu.click();
    await page.locator('form:has(input[name="locale"]) button:visible').first().click();
    await expect(html).toHaveAttribute("lang", wasAr ? "en" : "ar");
    await expect(html).toHaveAttribute("dir", wasAr ? "ltr" : "rtl");
    await noHorizontalOverflow(page);
  });

  test("role walls: maintenance staff cannot open finance screens", async ({ page }) => {
    await staffLogin(page, "maintenance@alsahil.demo");
    for (const path of ["/cheques", "/receipts", "/statements", "/settings", "/owners", "/audit"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/forbidden/);
    }
    await page.goto("/maintenance");
    await expect(page).toHaveURL(/maintenance/);
  });

  test("key screens fit a phone without sideways scrolling", async ({ page }) => {
    await staffLogin(page, "manager@alsahil.demo");
    for (const path of ["/units", "/contracts", "/maintenance", "/receipts", "/tenants", "/statements", "/settings"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await noHorizontalOverflow(page);
    }
  });
});

test.describe("tenant portal", () => {
  test("activate with the fixed OTP, then see the portal", async ({ page }, info) => {
    // The seeded inactive tenant can only be activated once per database, so the phone project reuses the desktop run.
    test.skip(info.project.name === "mobile", "already activated by the desktop project");
    await page.goto("/portal/activate");
    await page.locator('input[name="idNumber"]').fill("87654321");
    await page.locator("form").filter({ has: page.locator('input[name="idNumber"]') }).locator('button[type="submit"]').click();
    await page.locator('input[aria-label="1"]').waitFor();
    await page.locator('input[aria-label="1"]').click();
    await page.keyboard.type("123456");
    await page.locator('input[name="password"]').fill("Tenant-Pass-2026");
    await page.locator("form").filter({ has: page.locator('input[name="password"]') }).locator('button[type="submit"]').click();
    await page.waitForURL(/\/portal$/, { timeout: 60_000 });
    await noHorizontalOverflow(page);
  });

  test("tenant signs in and cannot reach staff pages or another tenant's receipt", async ({ page }) => {
    await page.goto("/portal/login");
    await page.locator('input[name="idNumber"]').fill("12345678");
    await page.locator('input[name="password"]').fill(PASSWORD);
    await page.locator("form").filter({ has: page.locator('input[name="idNumber"]') }).locator('button[type="submit"]').click();
    await page.waitForURL(/\/portal$/, { timeout: 60_000 });
    await noHorizontalOverflow(page);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/portal/);
    const res = await page.request.get("/api/pdf/statement/00000000-0000-0000-0000-000000000000");
    expect([401, 403]).toContain(res.status());
  });

  test("a wrong password and an unknown ID give the same answer", async ({ page }) => {
    const attempt = async (id: string) => {
      await page.goto("/portal/login");
      await page.locator('input[name="idNumber"]').fill(id);
      await page.locator('input[name="password"]').fill("wrong-password-1");
      await page.locator("form").filter({ has: page.locator('input[name="idNumber"]') }).locator('button[type="submit"]').click();
      const alert = page.locator('[role="alert"]').first();
      await alert.waitFor();
      return alert.innerText();
    };
    expect(await attempt("11111111")).toBe(await attempt("12345679"));
  });
});
