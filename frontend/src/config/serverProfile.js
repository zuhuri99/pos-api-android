const STORAGE_KEY = "pos.server.v1";

export function normalizeUrl(value, label = "Alamat server") {
  const raw = String(value || "").trim();
  if (!raw) throw new Error(`${label} wajib diisi.`);
  let url;
  try { url = new URL(raw.includes("://") ? raw : `https://${raw}`); }
  catch { throw new Error(`${label} tidak valid.`); }
  if (url.protocol !== "https:") throw new Error(`${label} harus menggunakan HTTPS.`);
  if (url.username || url.password || url.search || url.hash) {
    throw new Error(`${label} tidak boleh memuat kredensial, query, atau fragment.`);
  }
  return url.href.replace(/\/+$/, "");
}

export function createServerProfile(input) {
  const entered = normalizeUrl(input.serverUrl);
  const serverUrl = entered.replace(/\/api\/v1$/, "");
  const apiUrl = normalizeUrl(input.apiUrl || `${serverUrl}/api/v1`, "Alamat API");
  const incomeApiUrl = normalizeUrl(input.incomeApiUrl || apiUrl, "Alamat API pendapatan");
  const healthUrl = normalizeUrl(input.healthUrl || `${serverUrl}/health`, "Alamat health check");
  const fallbackApiUrl = input.fallbackApiUrl ? normalizeUrl(input.fallbackApiUrl, "API utama cadangan") : "";
  const fallbackHealthUrl = input.fallbackHealthUrl ? normalizeUrl(input.fallbackHealthUrl, "Health check cadangan") : "";
  if (Boolean(fallbackApiUrl) !== Boolean(fallbackHealthUrl)) {
    throw new Error("API utama cadangan dan health check cadangan harus diisi bersama.");
  }
  const incomeFallbackApiUrl = input.incomeFallbackApiUrl ? normalizeUrl(input.incomeFallbackApiUrl, "API pendapatan cadangan") : "";
  const turnstileSiteKey = String(input.turnstileSiteKey || "").trim();
  if (input.turnstileEnabled && !turnstileSiteKey) throw new Error("Site key Turnstile wajib diisi.");
  return {
    version: 1, serverUrl, apiUrl, incomeApiUrl,
    healthUrl, fallbackApiUrl, fallbackHealthUrl, incomeFallbackApiUrl,
    turnstileEnabled: Boolean(input.turnstileEnabled), turnstileSiteKey,
    ssoEnabled: Boolean(input.ssoEnabled),
  };
}

export function readServerProfile() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return value?.version === 1 ? createServerProfile(value) : null;
  } catch { return null; }
}

export function saveServerProfile(profile) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(createServerProfile(profile)));
}

// Only public endpoint settings are used; never copy environment secrets into a profile.
export function environmentServerProfile(env) {
  if (!env.VITE_API_BASE_URL) return null;
  try {
    return createServerProfile({
      serverUrl: env.VITE_API_BASE_URL.replace(/\/api\/v1\/?$/, ""),
      apiUrl: env.VITE_API_BASE_URL,
      healthUrl: env.VITE_HEALTH_URL,
      fallbackApiUrl: env.VITE_API_BASE_URL_2,
      fallbackHealthUrl: env.VITE_HEALTH_URL_2,
      incomeApiUrl: env.VITE_INCOME_API_BASE,
      incomeFallbackApiUrl: env.VITE_INCOME_API_BASE_2,
      turnstileEnabled: env.VITE_TURNSTILE_ENABLED === "true",
      turnstileSiteKey: env.VITE_TURNSTILE_SITE_KEY,
      ssoEnabled: env.VITE_OIDC_ENABLED === "true",
    });
  } catch { return null; }
}

export function profileEndpoints(profile) {
  return [
    { apiUrl: profile.apiUrl, healthUrl: profile.healthUrl },
    ...(profile.fallbackApiUrl && profile.fallbackHealthUrl
      ? [{ apiUrl: profile.fallbackApiUrl, healthUrl: profile.fallbackHealthUrl }] : []),
  ];
}
