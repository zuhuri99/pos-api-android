import { useEffect, useState } from "react";

import PosLayout from "../../layouts/PosLayout";
import { offlineStats } from "./localStore";
import { syncNow } from "./syncEngine";
import { formatWibDateTime } from "../../utils/dateTime";

export default function SyncStatus() {
  const [stats, setStats] = useState({ pending: 0, failed: 0, lastSync: "", queue: [], recent: [] });
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
  const statusLabel = (value) => ({
    synced: "Tersinkron",
    pending: "Menunggu",
    pending_delete: "Menunggu hapus",
    pending_mark: "Menunggu tanda",
    failed: "Gagal",
  }[value] || value || "Menunggu");
  const statusClass = (value) => value === "synced"
    ? "bg-emerald-100 text-emerald-700"
    : value === "failed"
      ? "bg-red-100 text-red-700"
      : "bg-amber-100 text-amber-800";
  const actionLabel = (value) => ({ create: "Buat", update: "Ubah", delete: "Hapus", mark: "Tandai" }[value] || value);
  const dateLabel = formatWibDateTime;
  return (
    <PosLayout title="Sinkronisasi">
      <section className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-xs font-bold text-slate-500">Menunggu dikirim</p><p className="text-3xl font-black text-blue-700">{stats.pending}</p></div>
          <div className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-xs font-bold text-slate-500">Perlu diperiksa</p><p className="text-3xl font-black text-red-600">{stats.failed}</p></div>
        </div>
        <div className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-xs font-bold text-slate-500">Sinkron terakhir</p><p className="mt-1 font-semibold text-slate-800">{stats.lastSync ? formatWibDateTime(stats.lastSync) : "Belum pernah"}</p></div>
        {message && <p className="rounded-xl bg-slate-200 p-3 text-sm font-semibold">{message}</p>}
        <button type="button" disabled={busy || !navigator.onLine} onClick={synchronize} className="w-full rounded-xl bg-blue-700 p-3 font-extrabold text-white disabled:opacity-50">{busy ? "Menyinkronkan…" : navigator.onLine ? "Sinkronkan sekarang" : "Perangkat offline"}</button>

        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between"><h2 className="font-black text-slate-900">Daftar tunggu</h2><span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-black text-blue-700">{stats.queue?.length || 0} operasi</span></div>
          <div className="mt-3 space-y-2">
            {stats.queue?.length ? stats.queue.map((item) => (
              <article key={item.operation_id} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-2"><div><p className="text-sm font-black text-slate-800">{item.invoice_no}</p><p className="text-[11px] text-slate-500">{actionLabel(item.action)} · {dateLabel(item.activity_at)}</p></div><span className={`rounded-full px-2 py-1 text-[10px] font-black ${statusClass(item.status)}`}>{statusLabel(item.status)}</span></div>
                {item.error && <p className="mt-2 break-words rounded-lg bg-red-50 p-2 text-[11px] text-red-700">{item.error}</p>}
              </article>
            )) : <p className="py-5 text-center text-xs text-slate-500">Tidak ada transaksi yang menunggu.</p>}
          </div>
        </div>

        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="font-black text-slate-900">10 transaksi terakhir</h2>
          <div className="mt-3 divide-y divide-slate-100">
            {stats.recent?.length ? stats.recent.map((activity) => (
              <div key={activity.activity_id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0"><p className="truncate text-sm font-black text-slate-800">{activity.invoice_no}</p><p className="text-[11px] text-slate-500">{dateLabel(activity.activity_at)} · {actionLabel(activity.action)}</p></div>
                <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black ${statusClass(activity.status)}`}>{statusLabel(activity.status)}</span>
              </div>
            )) : <p className="py-5 text-center text-xs text-slate-500">Belum ada transaksi lokal.</p>}
          </div>
        </div>
      </section>
    </PosLayout>
  );
}
