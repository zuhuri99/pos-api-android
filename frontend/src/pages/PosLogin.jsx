import { useState } from "react";

import api from "../api/axios";
import { getLoginDeviceInfo } from "../platform/deviceInfo";
import { storeAuthSession } from "../utils/auth";

export default function PosLogin() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(() => {
    const message = sessionStorage.getItem("auth_message") || "";
    sessionStorage.removeItem("auth_message");
    return message;
  });

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const device = await getLoginDeviceInfo();
      const response = await api.post("/auth/login/", {
        username,
        password,
        device_id: device?.device_id || "android-pos",
      }, { skipAuth: true });
      await storeAuthSession(response.data);
      window.location.replace("/pos");
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Login gagal. Periksa akun dan koneksi.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-slate-100 p-5">
      <form onSubmit={submit} className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl">
        <div className="mb-6">
          <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-blue-600">POS Offline</p>
          <h1 className="mt-2 text-2xl font-black text-slate-900">Masuk ke kasir</h1>
          <p className="mt-1 text-sm text-slate-500">Login pertama memerlukan koneksi internet.</p>
        </div>
        {error && <div className="mb-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}
        <label className="block text-sm font-bold text-slate-700">Username
          <input autoFocus value={username} onChange={(event) => setUsername(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-3" required />
        </label>
        <label className="mt-4 block text-sm font-bold text-slate-700">Password
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-3" required />
        </label>
        <button disabled={busy} className="mt-6 w-full rounded-xl bg-blue-700 px-4 py-3 font-extrabold text-white disabled:opacity-50">
          {busy ? "Menghubungkan…" : "Masuk"}
        </button>
      </form>
    </main>
  );
}
