import { useState } from "react";
import { createServerProfile, readServerProfile, saveServerProfile, environmentServerProfile, profileEndpoints } from "../config/serverProfile";
import { selectHealthyEndpoint } from "../platform/health";
import { logoutAll } from "../utils/auth";

export default function ServerSetup() {
  const [existing] = useState(readServerProfile);
  const [defaults] = useState(() => environmentServerProfile(import.meta.env));
  const [form, setForm] = useState(() => existing || defaults || { serverUrl: "", apiUrl: "", healthUrl: "", fallbackApiUrl: "", fallbackHealthUrl: "", incomeApiUrl: "", incomeFallbackApiUrl: "", turnstileEnabled: false, turnstileSiteKey: "", ssoEnabled: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const change = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const profile = createServerProfile(form);
      const { endpoint, checks } = await selectHealthyEndpoint(profileEndpoints(profile));
      if (!endpoint) {
        throw new Error(`Server belum dapat dihubungi.\n${checks.map((check) => `${check.url}: ${check.message}`).join("\n")}`);
      }
      // Persist first: storage errors must not log the user out of their current server.
      saveServerProfile(profile);
      await logoutAll();
      sessionStorage.removeItem("auth_message");
      window.location.replace("/login");
    } catch (err) { setError(err.message || "Pengaturan server gagal disimpan."); }
    finally { setBusy(false); }
  };
  const inputClass = "mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 disabled:opacity-60";
  return <main className="min-h-[100dvh] bg-gradient-to-br from-slate-950 via-[#063b64] to-[#0078d4] px-5 py-12 flex items-center justify-center">
    <form onSubmit={submit} className="w-full max-w-md rounded-3xl bg-white p-7 shadow-2xl sm:p-9">
      <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-2xl font-bold text-blue-700" aria-hidden="true">F</div>
      <p className="text-xs font-bold uppercase tracking-widest text-blue-700">Finance System</p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">Hubungkan ke server</h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">Masukkan alamat server Finance milik organisasi Anda. Alamat ini akan disimpan untuk penggunaan berikutnya.</p>
      {error && <div role="alert" className="mt-5 whitespace-pre-line break-words rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <fieldset disabled={busy} className="mt-6 space-y-5">
        {defaults && <button type="button" onClick={() => { setForm(defaults); setError(""); }} className="text-sm font-semibold text-blue-700 underline">Gunakan konfigurasi production</button>}
        <label className="block text-sm font-medium text-slate-700">Alamat server
          <input name="serverUrl" autoComplete="url" inputMode="url" autoCapitalize="none" spellCheck={false} required placeholder="https://finance.perusahaan.id" value={form.serverUrl} onChange={(e) => setForm((current) => ({ ...current, serverUrl: e.target.value, apiUrl: "", healthUrl: "", fallbackApiUrl: "", fallbackHealthUrl: "", incomeApiUrl: "", incomeFallbackApiUrl: "", turnstileEnabled: false, turnstileSiteKey: "", ssoEnabled: false }))} className={inputClass} />
        </label>
        <details className="text-sm text-slate-600">
          <summary className="cursor-pointer py-2 font-medium">Pengaturan lanjutan</summary>
          <div className="mt-3 space-y-4">
            <p className="text-xs leading-5">API utama dan pendapatan boleh memakai domain atau port berbeda. Isi endpoint cadangan bila tersedia; aplikasi akan mencobanya jika endpoint utama tidak dapat dihubungi.</p>
            <label className="block">Alamat API utama<input name="apiUrl" inputMode="url" autoCapitalize="none" value={form.apiUrl} onChange={(e) => change("apiUrl", e.target.value)} placeholder="Otomatis: alamat server/api/v1" className={inputClass} /></label>
            <label className="block">Alamat API pendapatan<input name="incomeApiUrl" inputMode="url" autoCapitalize="none" value={form.incomeApiUrl} onChange={(e) => change("incomeApiUrl", e.target.value)} placeholder="Sama dengan API utama" className={inputClass} /></label>
            <label className="block">Alamat health check<input name="healthUrl" inputMode="url" autoCapitalize="none" value={form.healthUrl || ""} onChange={(e) => change("healthUrl", e.target.value)} placeholder="Otomatis: alamat server/health" className={inputClass} /></label>
            <label className="block">API utama cadangan<input name="fallbackApiUrl" inputMode="url" autoCapitalize="none" value={form.fallbackApiUrl || ""} onChange={(e) => change("fallbackApiUrl", e.target.value)} placeholder="https://server-cadangan.id/api/v1" className={inputClass} /></label>
            <label className="block">Health check cadangan<input name="fallbackHealthUrl" inputMode="url" autoCapitalize="none" value={form.fallbackHealthUrl || ""} onChange={(e) => change("fallbackHealthUrl", e.target.value)} placeholder="https://server-cadangan.id/health" className={inputClass} /></label>
            <label className="block">API pendapatan cadangan<input name="incomeFallbackApiUrl" inputMode="url" autoCapitalize="none" value={form.incomeFallbackApiUrl || ""} onChange={(e) => change("incomeFallbackApiUrl", e.target.value)} placeholder="Opsional" className={inputClass} /></label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.turnstileEnabled} onChange={(e) => change("turnstileEnabled", e.target.checked)} />Server menggunakan Turnstile</label>
            {form.turnstileEnabled && <label className="block">Site key Turnstile<input required value={form.turnstileSiteKey} onChange={(e) => change("turnstileSiteKey", e.target.value)} className={inputClass} /></label>}
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.ssoEnabled} onChange={(e) => change("ssoEnabled", e.target.checked)} />Server mendukung login SSO</label>
          </div>
        </details>
        {existing && <p className="text-xs leading-5 text-slate-500">Menyimpan pengaturan akan mengakhiri sesi saat ini. Anda akan login kembali pada server yang dipilih.</p>}
        <button type="submit" className="w-full rounded-xl bg-[#0067b8] px-4 py-3 font-semibold text-white hover:bg-blue-800 disabled:opacity-60">{busy ? "Memeriksa koneksi…" : "Hubungkan & lanjutkan"}</button>
      </fieldset>
      {existing && <a href="/login" className="mt-5 block text-center text-sm text-blue-700">Batal</a>}
    </form>
  </main>;
}
