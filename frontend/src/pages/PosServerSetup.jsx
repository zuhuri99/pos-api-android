import { useState } from "react";

import { createServerProfile, saveServerProfile } from "../config/serverProfile";
import { probeHealth } from "../platform/health";
import { logoutAll } from "../utils/auth";

export default function PosServerSetup() {
  const [serverUrl, setServerUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const profile = createServerProfile({ serverUrl });
      const health = await probeHealth(profile.healthUrl);
      if (!health.ok) throw new Error(health.message || "Health check server gagal.");
      await logoutAll();
      saveServerProfile(profile);
      window.location.replace("/login");
    } catch (setupError) {
      setError(setupError.message || "Server tidak dapat digunakan.");
    } finally { setBusy(false); }
  };
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-slate-100 p-5">
      <form onSubmit={submit} className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl">
        <div className="flex items-center gap-3">
          <img src="/asas-pos-logo.png" alt="Logo ASAS POS" className="h-14 w-14 object-contain" />
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-blue-600">ASAS POS</p>
            <h1 className="mt-1 text-2xl font-black">Konfigurasi awal</h1>
          </div>
        </div>
        <h2 className="mt-5 text-lg font-black">Hubungkan POS ke server</h2>
        <p className="mt-2 text-sm text-slate-500">Gunakan alamat HTTPS backend POS. API dan health endpoint akan ditentukan otomatis.</p>
        {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
        <label className="mt-5 block text-sm font-bold">Alamat server
          <input value={serverUrl} onChange={(event) => setServerUrl(event.target.value)} placeholder="https://pos.example.com" className="mt-1 w-full rounded-xl border border-slate-300 p-3" required />
        </label>
        <button disabled={busy} className="mt-5 w-full rounded-xl bg-blue-700 p-3 font-extrabold text-white disabled:opacity-50">{busy ? "Memeriksa server…" : "Hubungkan"}</button>
      </form>
    </main>
  );
}
