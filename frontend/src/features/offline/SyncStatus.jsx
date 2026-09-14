import { useEffect, useState } from "react";

import PosLayout from "../../layouts/PosLayout";
import { offlineStats } from "./localStore";
import { syncNow } from "./syncEngine";

export default function SyncStatus() {
  const [stats, setStats] = useState({ pending: 0, failed: 0, lastSync: "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const refresh = () => offlineStats().then(setStats);
  useEffect(() => { refresh(); }, []);
  const synchronize = async () => {
    setBusy(true); setMessage("");
    try { await syncNow(); setMessage("Sinkronisasi selesai."); }
    catch (error) { setMessage(error.response?.data?.detail || error.message || "Sinkronisasi gagal."); }
    finally { setBusy(false); refresh(); }
  };
  return (
    <PosLayout title="Sinkronisasi">
      <section className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-xs font-bold text-slate-500">Menunggu dikirim</p><p className="text-3xl font-black text-blue-700">{stats.pending}</p></div>
          <div className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-xs font-bold text-slate-500">Perlu diperiksa</p><p className="text-3xl font-black text-red-600">{stats.failed}</p></div>
        </div>
        <div className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-xs font-bold text-slate-500">Sinkron terakhir</p><p className="mt-1 font-semibold text-slate-800">{stats.lastSync ? new Date(stats.lastSync).toLocaleString("id-ID") : "Belum pernah"}</p></div>
        {message && <p className="rounded-xl bg-slate-200 p-3 text-sm font-semibold">{message}</p>}
        <button type="button" disabled={busy || !navigator.onLine} onClick={synchronize} className="w-full rounded-xl bg-blue-700 p-3 font-extrabold text-white disabled:opacity-50">{busy ? "Menyinkronkan…" : navigator.onLine ? "Sinkronkan sekarang" : "Perangkat offline"}</button>
      </section>
    </PosLayout>
  );
}
