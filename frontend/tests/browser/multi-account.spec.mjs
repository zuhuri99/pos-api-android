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

test("pergantian akun selalu menggunakan token milik akun yang dipilih", async ({ page }) => {
  const apiUrl = serverProfile.apiUrl;
  const aliceKey = `${apiUrl}::1`;
  const bobKey = `${apiUrl}::2`;
  await page.addInitScript(({ profile, accounts, activeKey, tokens }) => {
    if (localStorage.getItem("finance.auth.accounts.v1")) return;
    localStorage.setItem("finance.server.v1", JSON.stringify(profile));
    localStorage.setItem("finance.auth.accounts.v1", JSON.stringify(accounts));
    localStorage.setItem("finance.auth.active.v1", activeKey);
    localStorage.setItem("finance.session.active", "true");
    for (const [key, token] of tokens) {
      localStorage.setItem(`finance.auth.token.${encodeURIComponent(key)}`, token);
    }
  }, {
    profile: serverProfile,
    accounts: [
      { key: aliceKey, server: apiUrl, user: { id: 1, username: "alice", is_superuser: false }, expiresAt: "" },
      { key: bobKey, server: apiUrl, user: { id: 2, username: "bob", is_superuser: true }, expiresAt: "" },
    ],
    activeKey: aliceKey,
    tokens: [[aliceKey, "token-alice"], [bobKey, "token-bob"]],
  });

  const authorizations = [];
  await page.route("https://finance.example.com/health", (route) => route.fulfill({ json: { status: "ok" } }));
  await page.route("https://finance.example.com/api/v1/**", async (route) => {
    authorizations.push(route.request().headers().authorization || "");
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/expenses/")) return route.fulfill({ json: { count: 0, next: null, results: [] } });
    if (path.endsWith("/income/lite")) return route.fulfill({ json: { success: true, data: { store: [] } } });
    if (path.endsWith("/payroll/employees/") || path.endsWith("/payroll/slips/") || path.endsWith("/payroll/receivables/")) {
      return route.fulfill({ json: { count: 0, next: null, results: [] } });
    }
    return route.fulfill({ json: {} });
  });

  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Selamat datang, alice" })).toBeVisible();
  await page.getByRole("button", { name: "Open Menu" }).click();
  await expect(page.getByRole("button", { name: "bob" })).toHaveCount(0);
  await page.getByRole("button", { name: "Buka pemilih akun" }).first().click();
  await expect(page.getByRole("heading", { name: "Pilih akun" })).toBeVisible();
  await page.getByRole("button", { name: "bob" }).click();
  await expect(page.getByRole("heading", { name: "Selamat datang, bob" })).toBeVisible();
  await expect.poll(() => authorizations.filter((value) => value === "Token token-bob").length).toBeGreaterThan(0);
  await expect(page.evaluate(() => localStorage.getItem("token"))).resolves.toBe("token-bob");
  await expect(page.evaluate(() => localStorage.getItem("finance.auth.active.v1"))).resolves.toBe(bobKey);
});

test("penambahan akun berhenti setelah lima sesi tersimpan", async ({ page }) => {
  const apiUrl = serverProfile.apiUrl;
  await page.addInitScript(({ profile, apiBase }) => {
    const accounts = Array.from({ length: 5 }, (_, index) => ({
      key: `${apiBase}::${index + 1}`,
      server: apiBase,
      user: { id: index + 1, username: `user-${index + 1}`, is_superuser: false },
      expiresAt: "",
    }));
    localStorage.setItem("finance.server.v1", JSON.stringify(profile));
    localStorage.setItem("finance.auth.accounts.v1", JSON.stringify(accounts));
    localStorage.setItem("finance.auth.active.v1", accounts[0].key);
    for (const account of accounts) {
      localStorage.setItem(`finance.auth.token.${encodeURIComponent(account.key)}`, `token-${account.user.id}`);
    }
  }, { profile: serverProfile, apiBase: apiUrl });
  await page.route("https://finance.example.com/health", (route) => route.fulfill({ json: { status: "ok" } }));
  await page.route("https://finance.example.com/api/v1/**", (route) => route.fulfill({ json: { count: 0, results: [], data: { store: [] } } }));

  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Buka pemilih akun" }).last().click();
  await expect(page.getByText("5 dari 5 akun tersimpan", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Batas 5 akun tercapai" })).toBeDisabled();
});
