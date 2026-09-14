import { useEffect, useState } from "react";

import MobileLayout from "../layouts/MobileLayout";
import { posApi } from "../features/pos/api/posApi";
import {
  getPaymentAliases,
  savePaymentAliases,
} from "../features/pos/paymentAliases";
import { getPosApiError } from "../features/pos/posUtils";

export default function PaymentAliasSettings() {
  const [sourceUser, setSourceUser] = useState("");
  const [sources, setSources] = useState([]);
  const [methods, setMethods] = useState([]);
  const [aliases, setAliases] = useState({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = async (requestedSource) => {
    setLoading(true);
    setError("");
    try {
      const response = await posApi.bootstrap(requestedSource || undefined);
      const data = response.data?.data || {};
      const selectedSource = data.source_user || requestedSource || "";
      setSourceUser(selectedSource);
      setSources(data.available_sources || []);
      setMethods(data.payment_methods || []);
      setAliases(getPaymentAliases(selectedSource));
    } catch (requestError) {
      setError(getPosApiError(requestError, "Metode pembayaran gagal dimuat."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(""); }, []);

  const save = () => {
    savePaymentAliases(sourceUser, aliases);
    setMessage("Alias pembayaran berhasil disimpan.");
  };

  return (
    <MobileLayout title="Alias Pembayaran">
      <div className="mx-auto w-full min-w-0 max-w-2xl overflow-x-hidden pb-24">
        <section className="rounded-[26px] border border-white/80 bg-white/80 p-4 shadow-sm backdrop-blur-xl sm:p-5">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#0067b8]">Pengaturan POS</p>
          <h1 className="mt-1 text-xl font-black text-slate-900">Alias pembayaran</h1>
          <p className="mt-1 text-xs leading-5 text-slate-500">Nama asli tetap dikirim ke UltimatePOS. Alias hanya mengubah nama yang terlihat di kasir dan invoice.</p>

          {sources.length > 1 && (
            <label className="mt-4 block text-xs font-bold text-slate-600">Akun POS
              <select value={sourceUser} onChange={(event) => load(event.target.value)} className="mt-1 h-11 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold">
                {sources.map((source) => <option key={source} value={source}>{source.toUpperCase()}</option>)}
              </select>
            </label>
          )}

          {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-700">{error}</p>}
          {message && <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-xs font-semibold text-emerald-700">{message}</p>}

          <div className="mt-4 space-y-3">
            {methods.map((method) => {
              const name = method.name || method.method;
              const originalLabel = method.label || name;
              return (
                <label key={name} className="grid min-w-0 grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <span className="min-w-0"><span className="block truncate text-xs font-extrabold text-slate-800">{name}</span><span className="block truncate text-[10px] text-slate-400">{originalLabel}</span></span>
                  <input value={aliases[name] || ""} onChange={(event) => { setMessage(""); setAliases((current) => ({ ...current, [name]: event.target.value })); }} placeholder={`Contoh: ${originalLabel}`} maxLength={50} className="h-10 min-w-0 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold outline-none focus:border-blue-400" />
                </label>
              );
            })}
            {!loading && !methods.length && !error && <p className="py-8 text-center text-sm text-slate-400">Tidak ada metode pembayaran.</p>}
          </div>

          <button type="button" onClick={save} disabled={loading || !methods.length} className="mt-5 w-full rounded-2xl bg-[#0067b8] px-4 py-3 text-sm font-extrabold text-white disabled:opacity-50">{loading ? "Memuat…" : "Simpan Alias"}</button>
        </section>
      </div>
    </MobileLayout>
  );
}
