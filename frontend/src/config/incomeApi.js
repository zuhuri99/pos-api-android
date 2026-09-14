import { readServerProfile } from "./serverProfile";
const profile = readServerProfile();
export const INCOME_API_BASE = profile?.incomeApiUrl || import.meta.env.VITE_INCOME_API_BASE || "http://127.0.0.1:8000";
// A saved profile may come from an older installation without an income fallback.
// Keep the production fallback available unless the profile explicitly supplies one.
export const INCOME_API_FALLBACK_BASE = profile?.incomeFallbackApiUrl || import.meta.env.VITE_INCOME_API_BASE_2 || "";
export const INCOME_API_KEY = profile ? "" : import.meta.env.VITE_INCOME_API_KEY || "";
