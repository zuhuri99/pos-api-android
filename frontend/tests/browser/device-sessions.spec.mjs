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

test("lists detailed browser and Android sessions and revokes another device", async ({ page }) => {
  await page.addInitScript((profile) => {
    localStorage.setItem("finance.server.v1", JSON.stringify(profile));
    localStorage.setItem("token", "current-session-token");
    localStorage.setItem("username", "finance-user");
  }, serverProfile);
  await page.route("https://finance.example.com/health", (route) => route.fulfill({ json: { status: "ok" } }));
  await page.route("https://finance.example.com/api/v1/auth/sessions/", async (route) => {
    if (route.request().method() === "DELETE") {
      await route.fulfill({ json: { detail: "Sesi berhasil dihapus." } });
      return;
    }
    await route.fulfill({ json: {
      count: 2,
      results: [
        { id: "11111111-1111-4111-8111-111111111111", is_current: true, device_type: "web", device_name: "Google Chrome 140 · Windows", browser: "Google Chrome 140", platform: "Windows", os_version: "10.0", ip_address: "203.0.113.10", auth_method: "Email OTP", created_at: "2026-09-09T08:00:00Z", last_seen_at: "2026-09-09T09:00:00Z" },
        { id: "22222222-2222-4222-8222-222222222222", is_current: false, device_type: "android", device_name: "Samsung SM-S921B", browser: "Finance Android", platform: "Android", os_version: "16", app_version: "1.1.0", ip_address: "198.51.100.20", auth_method: "Keycloak SSO", created_at: "2026-09-09T07:00:00Z", last_seen_at: "2026-09-09T08:30:00Z" },
      ],
    } });
  });
  await page.route("https://finance.example.com/api/v1/auth/sessions/*/", async (route) => {
    await route.fulfill({ json: { detail: "Sesi berhasil dihapus." } });
  });

  await page.goto("/sessions");
  await expect(page.getByText("Google Chrome 140 · Windows", { exact: true })).toBeVisible();
  await expect(page.getByText("Samsung SM-S921B", { exact: true })).toBeVisible();
  await expect(page.getByText("203.0.113.10", { exact: true })).toBeVisible();
  await expect(page.getByText("198.51.100.20", { exact: true })).toBeVisible();
  await page.locator("article").filter({ hasText: "Samsung SM-S921B" }).getByRole("button", { name: "Hapus login" }).click();
  await page.getByRole("button", { name: "Hapus login" }).last().click();
  await expect(page.getByText("Login pada Samsung SM-S921B telah dihapus.")).toBeVisible();
});
