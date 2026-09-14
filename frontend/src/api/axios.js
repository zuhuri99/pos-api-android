import { getAuthContext } from "../utils/auth";
import axios from "axios";
import { expireSession, isSessionExpired } from "../utils/auth";
import { getApiBaseUrl } from "../config/apiEndpoints";

const api = axios.create({
  timeout: 15000,
});

/* ===============================
   REQUEST INTERCEPTOR (TOKEN)
   =============================== */
api.interceptors.request.use(
  (config) => {
    config.baseURL = getApiBaseUrl();
    if (config.skipAuth) return config;
    const { token, accountKey } = getAuthContext();

    if (token) {
      if (isSessionExpired(accountKey)) {
        expireSession(undefined, accountKey);
        return Promise.reject(new Error("Sesi telah kedaluwarsa."));
      }
      config.headers.Authorization = `Token ${token}`;
      config._authAccountKey = accountKey;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

/* ===============================
   RESPONSE INTERCEPTOR
   =============================== */
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Network error / server mati
    if (!error.response) {
      // Error diteruskan ke state/banner React
      return Promise.reject(error);
    }

    const { status, data } = error.response;

    // 🔐 Auto logout jika token invalid / expired (Bukan saat di halaman login)
    if (status === 401 && window.location.pathname !== "/login") {
      expireSession(
        data?.message || "Sesi tidak valid. Silakan login kembali.",
        error.config?._authAccountKey,
      );
      return Promise.reject(error);
    }

    return Promise.reject(error);
  }
);

export default api;
