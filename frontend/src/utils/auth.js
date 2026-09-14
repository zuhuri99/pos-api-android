import { readServerProfile } from "../config/serverProfile";
import { getApiBaseUrl } from "../config/apiEndpoints";
import { FinanceNative, isNative } from "../platform/native";

export const MAX_AUTH_ACCOUNTS = 5;

const ACCOUNTS_KEY = "pos.auth.accounts.v1";
const ACTIVE_ACCOUNT_KEY = "pos.auth.active.v1";
const SESSION_ACTIVE_KEY = "pos.session.active";
const LEGACY_KEYS = ["token", "token_expires_at", "user", "username", "user_id", "is_superuser"];
const sessionServer = () => readServerProfile()?.apiUrl || getApiBaseUrl();
const tokenStorageKey = (accountKey) => `pos.auth.token.${encodeURIComponent(accountKey)}`;
const makeAccountKey = (server, userId) => `${server}::${String(userId)}`;

let nativeToken = null;
let nativeAccountKey = null;

function readAccounts() {
  try {
    const accounts = JSON.parse(localStorage.getItem(ACCOUNTS_KEY));
    return Array.isArray(accounts)
      ? accounts.filter((account) => account?.key && account?.server && account?.user?.id != null).slice(0, MAX_AUTH_ACCOUNTS)
      : [];
  } catch {
    return [];
  }
}

function saveAccounts(accounts) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts.slice(0, MAX_AUTH_ACCOUNTS)));
  localStorage.setItem(SESSION_ACTIVE_KEY, accounts.length ? "true" : "false");
}

function activeAccountFrom(accounts = readAccounts()) {
  const activeKey = localStorage.getItem(ACTIVE_ACCOUNT_KEY);
  return accounts.find((account) => account.key === activeKey) || accounts[0] || null;
}

function syncLegacyIdentity(account, token = null) {
  if (!account) {
    LEGACY_KEYS.forEach((key) => localStorage.removeItem(key));
    localStorage.removeItem(ACTIVE_ACCOUNT_KEY);
    localStorage.removeItem(SESSION_ACTIVE_KEY);
    return;
  }
  localStorage.setItem(ACTIVE_ACCOUNT_KEY, account.key);
  localStorage.setItem(SESSION_ACTIVE_KEY, "true");
  localStorage.setItem("user", JSON.stringify(account.user));
  localStorage.setItem("username", account.user.username || "");
  localStorage.setItem("user_id", String(account.user.id));
  localStorage.setItem("is_superuser", String(Boolean(account.user.is_superuser)));
  if (account.expiresAt) localStorage.setItem("token_expires_at", account.expiresAt);
  else localStorage.removeItem("token_expires_at");
  if (isNative) localStorage.removeItem("token");
  else if (token) localStorage.setItem("token", token);
  else localStorage.removeItem("token");
}

function migrateLegacySession() {
  const existing = readAccounts();
  if (existing.length) return existing;
  const hasSession = isNative
    ? localStorage.getItem(SESSION_ACTIVE_KEY) === "true"
    : Boolean(localStorage.getItem("token"));
  let user;
  try { user = JSON.parse(localStorage.getItem("user")); } catch { user = null; }
  const userId = user?.id ?? localStorage.getItem("user_id") ?? localStorage.getItem("username");
  if (userId == null || !hasSession) return [];
  user = user && typeof user === "object" ? user : {
    id: userId,
    username: localStorage.getItem("username") || "User",
    is_superuser: localStorage.getItem("is_superuser") === "true",
  };
  const server = sessionServer();
  const account = {
    key: makeAccountKey(server, user.id),
    server,
    user,
    expiresAt: localStorage.getItem("token_expires_at") || "",
  };
  saveAccounts([account]);
  localStorage.setItem(ACTIVE_ACCOUNT_KEY, account.key);
  if (!isNative) localStorage.setItem(tokenStorageKey(account.key), localStorage.getItem("token"));
  return [account];
}

async function loadToken(account) {
  if (!account) return null;
  if (!isNative) return localStorage.getItem(tokenStorageKey(account.key)) || null;
  const result = await FinanceNative.getToken({ accountId: account.key, server: account.server });
  return result.token || null;
}

export async function initializeAuthSession() {
  const accounts = migrateLegacySession();
  const active = activeAccountFrom(accounts);
  if (!active) {
    nativeToken = null;
    nativeAccountKey = null;
    syncLegacyIdentity(null);
    return;
  }
  const token = await loadToken(active);
  if (!token) {
    await logout(active.key);
    return;
  }
  nativeToken = isNative ? token : null;
  nativeAccountKey = isNative ? active.key : null;
  syncLegacyIdentity(active, token);
}

export function getStoredAccounts() {
  const activeKey = localStorage.getItem(ACTIVE_ACCOUNT_KEY);
  return readAccounts().map((account) => ({ ...account, isActive: account.key === activeKey }));
}

export const getActiveAccount = () => activeAccountFrom();

export function getAuthContext() {
  const account = getActiveAccount();
  const token = isNative
    ? (account?.key === nativeAccountKey ? nativeToken : null)
    : (account ? localStorage.getItem(tokenStorageKey(account.key)) : null);
  return { account, accountKey: account?.key || null, token };
}

export const getAuthToken = () => getAuthContext().token;

export async function switchAccount(accountKey) {
  const account = readAccounts().find((item) => item.key === accountKey);
  if (!account) throw new Error("Akun tidak ditemukan.");
  const token = await loadToken(account);
  if (!token) throw new Error("Sesi akun tidak tersedia. Silakan login kembali.");
  nativeToken = isNative ? token : null;
  nativeAccountKey = isNative ? account.key : null;
  syncLegacyIdentity(account, token);
  return account;
}

export async function logout(accountKey = getActiveAccount()?.key) {
  if (!accountKey) {
    syncLegacyIdentity(null);
    return null;
  }
  const accounts = readAccounts();
  const removed = accounts.find((account) => account.key === accountKey);
  const remaining = accounts.filter((account) => account.key !== accountKey);
  if (removed) {
    if (isNative) await FinanceNative.clearToken({ accountId: removed.key, server: removed.server });
    else localStorage.removeItem(tokenStorageKey(removed.key));
  }
  saveAccounts(remaining);
  if (nativeAccountKey === accountKey) {
    nativeToken = null;
    nativeAccountKey = null;
  }
  const next = activeAccountFrom(remaining);
  if (!next) {
    syncLegacyIdentity(null);
    return null;
  }
  await switchAccount(next.key);
  return next;
}

export async function logoutAll() {
  const accounts = readAccounts();
  if (isNative) await FinanceNative.clearAllTokens();
  else accounts.forEach((account) => localStorage.removeItem(tokenStorageKey(account.key)));
  localStorage.removeItem(ACCOUNTS_KEY);
  nativeToken = null;
  nativeAccountKey = null;
  syncLegacyIdentity(null);
}

export async function storeAuthSession(data) {
  if (!data?.token || !data?.user || data.user.id == null) throw new Error("Respons sesi tidak lengkap.");
  const accounts = readAccounts();
  const server = sessionServer();
  const key = makeAccountKey(server, data.user.id);
  const existingIndex = accounts.findIndex((account) => account.key === key);
  if (existingIndex < 0 && accounts.length >= MAX_AUTH_ACCOUNTS) {
    throw new Error(`Maksimal ${MAX_AUTH_ACCOUNTS} akun dapat disimpan. Hapus salah satu akun terlebih dahulu.`);
  }
  const account = { key, server, user: data.user, expiresAt: data.token_expires_at || "" };
  if (isNative) await FinanceNative.setToken({ accountId: key, token: data.token, server });
  else localStorage.setItem(tokenStorageKey(key), data.token);
  if (existingIndex >= 0) accounts[existingIndex] = account;
  else accounts.push(account);
  saveAccounts(accounts);
  nativeToken = isNative ? data.token : null;
  nativeAccountKey = isNative ? key : null;
  syncLegacyIdentity(account, data.token);
  return account;
}

export const isSessionExpired = (accountKey = getActiveAccount()?.key) => {
  const account = readAccounts().find((item) => item.key === accountKey);
  const expiresAt = account?.expiresAt || (accountKey ? null : localStorage.getItem("token_expires_at"));
  if (!expiresAt) return false;
  const expiryTime = Date.parse(expiresAt);
  return Number.isNaN(expiryTime) || Date.now() >= expiryTime;
};

let expiring = false;
export const expireSession = async (message = "Token telah kedaluwarsa. Silakan login kembali.", accountKey = getActiveAccount()?.key) => {
  if (expiring) return;
  expiring = true;
  try { await logout(accountKey); }
  catch { /* Sesi lokal tetap tidak akan menggunakan token yang ditolak. */ }
  finally {
    sessionStorage.setItem("auth_message", message);
    window.location.replace(getAuthToken() ? "/dashboard" : "/login");
    expiring = false;
  }
};
