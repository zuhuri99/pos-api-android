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

test("opsi QR tersedia ketika menambah akun", async ({ page }) => {
  const accountKey = `${serverProfile.apiUrl}::7`;
  await page.addInitScript(({ profile, key }) => {
    localStorage.setItem("finance.server.v1", JSON.stringify(profile));
    localStorage.setItem("finance.auth.accounts.v1", JSON.stringify([{
      key,
      server: profile.apiUrl,
      user: { id: 7, username: "akun-lama", is_superuser: false },
      expiresAt: "",
    }]));
    localStorage.setItem("finance.auth.active.v1", key);
    localStorage.setItem(`finance.auth.token.${encodeURIComponent(key)}`, "existing-token");
  }, { profile: serverProfile, key: accountKey });
  await page.route("https://finance.example.com/health", (route) =>
    route.fulfill({ json: { status: "ok" } }),
  );

  await page.goto("/login?add_account=1");

  await expect(page.getByRole("heading", { name: "Masuk dengan akun lain" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Masuk dengan QR perangkat lain" })).toBeVisible();
});

test("perangkat baru login setelah QR disetujui", async ({ page }) => {
  let exchangeAttempts = 0;
  await page.addInitScript((profile) => {
    localStorage.setItem("finance.server.v1", JSON.stringify(profile));
  }, serverProfile);

  await page.route("https://finance.example.com/health", (route) =>
    route.fulfill({ json: { status: "ok" } }),
  );
  await page.route("https://finance.example.com/api/v1/**", (route) =>
    route.fulfill({ json: { count: 0, results: [] } }),
  );
  await page.route("https://finance.example.com/api/v1/auth/device-login/start/", async (route) => {
    const body = route.request().postDataJSON();
    expect(body.device).toBeTruthy();
    await route.fulfill({
      status: 201,
      json: {
        challenge_id: "11111111-1111-4111-8111-111111111111",
        exchange_token: "exchange-secret-only-for-new-device",
        qr_payload: "finance-login:v1:approval-secret-visible-in-qr-code",
        display_code: "123456",
        expires_at: new Date(Date.now() + 120_000).toISOString(),
        poll_interval: 2,
      },
    });
  });
  await page.route("https://finance.example.com/api/v1/auth/device-login/exchange/", async (route) => {
    exchangeAttempts += 1;
    const body = route.request().postDataJSON();
    expect(body.challenge_id).toBe("11111111-1111-4111-8111-111111111111");
    expect(body.exchange_token).toBe("exchange-secret-only-for-new-device");
    if (exchangeAttempts === 1) {
      await route.fulfill({ status: 202, json: { status: "pending" } });
      return;
    }
    await route.fulfill({
      json: {
        token: "new-device-session-token",
        token_expires_at: "2026-10-12T00:00:00Z",
        user: { id: 17, username: "qr-user", is_superuser: false },
      },
    });
  });
  await page.route("https://finance.example.com/api/v1/auth/token/verify/", (route) =>
    route.fulfill({ json: { detail: "Token valid." } }),
  );

  await page.goto("/login");
  await page.getByRole("button", { name: "Masuk dengan QR perangkat lain" }).click();

  await expect(page.getByRole("heading", { name: "Pindai QR untuk masuk" })).toBeVisible();
  await expect(page.getByText("123 456", { exact: true })).toBeVisible();
  await expect(page.locator("svg")).toBeVisible();
  await expect(page.getByText("Menunggu persetujuan dari perangkat lain…", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 10_000 });
  await expect(page.evaluate(() => localStorage.getItem("token"))).resolves.toBe("new-device-session-token");
  expect(exchangeAttempts).toBeGreaterThanOrEqual(2);
});
