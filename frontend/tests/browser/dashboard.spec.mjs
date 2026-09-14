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

test.beforeEach(async ({ page }) => {
  await page.addInitScript((profile) => {
    localStorage.setItem("finance.server.v1", JSON.stringify(profile));
    localStorage.setItem("token", "active-token");
    localStorage.setItem("username", "finance-user");
  }, serverProfile);

  await page.route("https://finance.example.com/health", (route) => route.fulfill({ json: { status: "ok" } }));
  await page.route("https://finance.example.com/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/auth/token/verify/")) return route.fulfill({ json: { detail: "Token valid." } });
    if (url.pathname.endsWith("/expenses/")) return route.fulfill({ json: { count: 1, next: null, results: [{ id: 1, date: "2026-09-05", amount: "250000", is_posted: false }] } });
    if (url.pathname.endsWith("/income/lite")) return route.fulfill({ json: { success: true, data: { store: [{ id: 2, transaction_date: "2026-09-06", final_total: "1000000", payment_status: "paid" }] } } });
    if (url.pathname.endsWith("/payroll/employees/")) return route.fulfill({ json: { count: 3, next: null, results: [] } });
    if (url.pathname.endsWith("/payroll/slips/")) return route.fulfill({ json: { count: 3, next: null, results: [
      { id: 3, slip_type: "weekly", period_start: "2026-09-01", status: "paid", total_before_adjustments: "500000", net_pay: "400000" },
      { id: 5, slip_type: "monthly", period_start: "2026-09-01", status: "paid", total_before_adjustments: "2000000", net_pay: "1600000" },
      { id: 6, slip_type: "weekly", period_start: "2026-09-01", status: "draft", total_before_adjustments: "550000", net_pay: "450000" },
    ] } });
    if (url.pathname.endsWith("/payroll/receivables/")) return route.fulfill({ json: { count: 1, next: null, results: [{ id: 4, disbursed_at: "2026-09-02", status: "active", current_balance: "50000" }] } });
    return route.fulfill({ status: 404, json: { detail: "Not found" } });
  });
});

test("pengguna yang sudah login dialihkan dari login ke dashboard", async ({ page }) => {
  await page.goto("/login");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Selamat datang, finance-user" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Bulan ini" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Rp 1.000.000", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Rp 250.000", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Rp 750.000", { exact: true })).toBeVisible();
  await expect(page.getByText("Rp 500.000", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Total sebelum potongan", { exact: true })).toBeVisible();
  await expect(page.getByText("Rp 400.000", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Slip mingguan terbit/dibayar").locator("..").getByText("1", { exact: true })).toBeVisible();
  await expect(page.getByText("Rp 1.600.000", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Karyawan aktif").locator("..").getByText("3", { exact: true })).toBeVisible();
});

test("alias home membuka dashboard", async ({ page }) => {
  await page.goto("/home");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("button", { name: "Tahun lalu" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Tahun ini" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Bulan lalu" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Bulan ini" })).toBeVisible();
});

test("token yang ditolak server dibersihkan dan pengguna tetap di login", async ({ page }) => {
  await page.route("https://finance.example.com/api/v1/auth/token/verify/", (route) => route.fulfill({ status: 401, json: { detail: "Token invalid." } }));
  await page.goto("/login");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Masuk ke akun Anda" })).toBeVisible();
  await expect(page.evaluate(() => localStorage.getItem("token"))).resolves.toBeNull();
});

test("callback SSO tetap diproses sebelum pemeriksaan sesi lama", async ({ page }) => {
  let verifyRequests = 0;
  await page.route("https://finance.example.com/api/v1/auth/token/verify/", (route) => {
    verifyRequests += 1;
    return route.fulfill({ json: { detail: "Token valid." } });
  });
  await page.goto("/login?sso_error=access_denied");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText("Login ASAS Account gagal atau tidak memiliki akses Finance.")).toBeVisible();
  expect(verifyRequests).toBe(0);
});
