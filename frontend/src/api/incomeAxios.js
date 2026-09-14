import { getAuthContext } from "../utils/auth";
import axios from "axios";
import {
  INCOME_API_BASE,
  INCOME_API_FALLBACK_BASE,
} from "../config/incomeApi";
import { expireSession, isSessionExpired } from "../utils/auth";

const incomeApi = axios.create({
  baseURL: INCOME_API_BASE,
  timeout: 60000,
  headers: {
    Accept: "application/json",
  },
});

incomeApi.interceptors.request.use(
  (config) => {
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

incomeApi.interceptors.response.use(
  (res) => res,
  (err) => {
    const config = err.config;
    const status = err.response?.status;
    const isServerFailure =
      status >= 500 || [404, 408, 425, 429].includes(status);
    const shouldUseFallback =
      INCOME_API_FALLBACK_BASE &&
      INCOME_API_FALLBACK_BASE !== INCOME_API_BASE &&
      config &&
      !config.skipIncomeFallback &&
      !config._incomeFallbackAttempted &&
      (!err.response || isServerFailure);

    if (shouldUseFallback) {
      config._incomeFallbackAttempted = true;
      config.baseURL = INCOME_API_FALLBACK_BASE;
      return incomeApi.request(config);
    }

    if (err.response?.status === 401 && window.location.pathname !== "/login") {
      expireSession(
        err.response.data?.message || "Sesi tidak valid. Silakan login kembali.",
        err.config?._authAccountKey,
      );
    }

    if (err.code === "ECONNABORTED") {
      err.isTimeout = true;
    }

    return Promise.reject(err);
  }
);

export default incomeApi;
