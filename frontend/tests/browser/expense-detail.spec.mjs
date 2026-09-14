import { test, expect } from "@playwright/test";

const serverProfile = {
  version: 1,
  serverUrl: "https://finance.example.com",
  apiUrl: "https://finance.example.com/api/v1",
  incomeApiUrl: "https://finance.example.com/api/v1",
  healthUrl: "https://finance.example.com/health",
  turnstileEnabled: false,
  ssoEnabled: false,
};

const expense = {
  id: 7,
  username: "finance-user",
  transaction_code: "EXP0926007",
  date: "2026-09-10",
  status: "produksi",
  category: "Bahan baku",
  detail: "Pembelian bahan produksi harian",
  amount: "275000.00",
  is_posted: false,
  receipts: [{ id: 71, url: "https://files.example.com/nota.gif", filename: "nota.gif" }],
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript((profile) => {
    localStorage.setItem("finance.server.v1", JSON.stringify(profile));
    localStorage.setItem("token", "active-token");
    localStorage.setItem("username", "finance-user");
  }, serverProfile);
  await page.route("https://finance.example.com/health", (route) => route.fulfill({ json: { status: "ok" } }));
  await page.route("https://files.example.com/nota.gif", (route) => route.fulfill({ contentType: "image/gif", body: Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64") }));
  await page.route("https://finance.example.com/api/v1/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/expenses/7/")) return route.fulfill({ json: expense });
    if (path.endsWith("/expenses/")) return route.fulfill({ json: { count: 1, next: null, results: [expense] } });
    if (path.endsWith("/categories/")) return route.fulfill({ json: { success: true, data: [] } });
    if (path.endsWith("/income/lite")) return route.fulfill({ json: { success: true, data: {} } });
    return route.fulfill({ status: 404, json: { detail: "Not found" } });
  });
});

test("klik kartu membuka detail dan tombol edit membuka formulir", async ({ page }) => {
  await page.goto("/expense");
  await page.locator('[role="link"]').filter({ hasText: "EXP0926007" }).click();
  await expect(page).toHaveURL(/\/expense\/7$/);
  await expect(page.getByText("Rp 275.000", { exact: true })).toBeVisible();
  await expect(page.getByText("Pembelian bahan produksi harian", { exact: true })).toBeVisible();
  await expect(page.getByText("1 lampiran", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Bukti transaksi 1" }).click();
  await expect(page.getByRole("dialog", { name: "Pratinjau bukti transaksi" })).toBeVisible();
  await page.getByRole("button", { name: "Perbesar foto" }).click();
  await expect(page.getByAltText("Bukti transaksi ukuran penuh")).toHaveCSS("transform", /matrix\(1\.5/);
  await page.getByRole("button", { name: "Reset zoom" }).click();
  await expect(page.getByRole("button", { name: "Reset zoom" })).toHaveText("100%");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Unduh foto" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("nota.gif");
  await page.getByRole("button", { name: "Tutup ✕", exact: true }).click();
  await page.getByRole("button", { name: "Edit expense" }).click();
  await expect(page).toHaveURL(/\/expense\/7\/edit$/);
});

test("tombol edit pada kartu langsung membuka formulir", async ({ page }) => {
  await page.goto("/expense");
  const card = page.locator('[role="link"]').filter({ hasText: "EXP0926007" });
  await card.getByRole("button", { name: "Edit" }).click();
  await expect(page).toHaveURL(/\/expense\/7\/edit$/);
});

test("Category aktif tanpa ikut mengaktifkan submenu Expense", async ({ page }) => {
  await page.goto("/expense/categories");
  const expenseSubmenu = page.locator("#navigation-group-expense");
  await expect(expenseSubmenu.getByRole("button", { name: "Category" })).toHaveAttribute("aria-current", "page");
  await expect(expenseSubmenu.getByRole("button", { name: "Expense", exact: true })).not.toHaveAttribute("aria-current", "page");
});

test("Top Products aktif tanpa ikut mengaktifkan submenu Income", async ({ page }) => {
  await page.goto("/income/top-products");
  const incomeSubmenu = page.locator("#navigation-group-income");
  await expect(incomeSubmenu.getByRole("button", { name: "Top Products" })).toHaveAttribute("aria-current", "page");
  await expect(incomeSubmenu.getByRole("button", { name: "Income", exact: true })).not.toHaveAttribute("aria-current", "page");
});
