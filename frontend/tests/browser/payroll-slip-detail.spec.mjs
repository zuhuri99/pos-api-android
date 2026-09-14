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

test("detail slip menampilkan tarif dan total upah serta transport", async ({ page }) => {
  await page.addInitScript((profile) => {
    localStorage.setItem("finance.server.v1", JSON.stringify(profile));
    localStorage.setItem("token", "active-token");
    localStorage.setItem("username", "finance-user");
  }, serverProfile);
  await page.route("https://finance.example.com/health", (route) => route.fulfill({ json: { status: "ok" } }));
  await page.route("https://finance.example.com/api/v1/payroll/slips/42/", (route) => route.fulfill({ json: {
    id: 42,
    slip_type: "weekly",
    status: "draft",
    document_reference: "PAY-W-202609-001",
    employee_name: "Budi",
    employee_code: "EMP-001",
    employee_nik: "1234",
    employee: 1,
    period_start: "2026-09-01",
    period_end: "2026-09-07",
    wage_days: "5.00",
    transport_days: "4.00",
    daily_wage: "100000.00",
    daily_transport: "7000.00",
    base_wage: "500000.00",
    transport_total: "28000.00",
    additions_total: "0.00",
    deductions_total: "0.00",
    total_before_adjustments: "528000.00",
    net_pay: "528000.00",
    attendance_details: [],
    adjustments: [],
    receivable_details: [],
    outstanding_receivables: [],
    available_actions: [],
    verification_path: "/api/v1/payroll/verify/token/",
  } }));

  await page.goto("/payroll/slips/42");
  await expect(page.getByText("Tarif harian")).toBeVisible();
  await expect(page.getByText("5 hari × Rp 100.000", { exact: true })).toBeVisible();
  await expect(page.getByText("4 hari × Rp 7.000", { exact: true })).toBeVisible();
  await expect(page.getByText("Rp 500.000", { exact: true })).toBeVisible();
  await expect(page.getByText("Rp 28.000", { exact: true })).toBeVisible();
});
