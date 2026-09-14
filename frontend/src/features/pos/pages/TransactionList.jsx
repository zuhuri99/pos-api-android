import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import PosLayout from "../../../layouts/PosLayout";
import { posApi } from "../api/posApi";
import { getPosApiError } from "../posUtils";

const rupiah = (value) => new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
}).format(Number(value) || 0);

const dateLabel = (value) => value ? new Date(String(value).replace(" ", "T")).toLocaleString("id-ID", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
}) : "-";

const saleTotal = (sale) => {
  if (sale.final_total !== undefined && sale.final_total !== null) return Number(sale.final_total) || 0;
  const subtotal = (sale.products || []).reduce((sum, line) => {
    const gross = Number(line.quantity || 0) * Number(line.unit_price || 0);
    const discount = line.discount_type === "percentage"
      ? gross * Number(line.discount_amount || 0) / 100
      : Number(line.discount_amount || 0);
    return sum + Math.max(0, gross - discount);
  }, 0);
  const discount = sale.discount_type === "percentage"
    ? subtotal * Number(sale.discount_amount || 0) / 100
    : Number(sale.discount_amount || 0);
  return Math.max(0, subtotal - discount + Number(sale.shipping_charges || 0) + Number(sale.packing_charge || 0));
};

export default function TransactionList() {
  const navigate = useNavigate();
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [search, setSearch] = useState("");
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await posApi.transactions({ year: Number(year), search });
      setSales(result.data?.data || []);
      setOffline(Boolean(result.data?.offline));
    } catch (requestError) {
      setError(getPosApiError(requestError, "Daftar transaksi gagal dimuat."));
    } finally {
      setLoading(false);
    }
  }, [search, year]);

  useEffect(() => {
    const timer = window.setTimeout(load, 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  const remove = async (sale) => {
    const reason = window.prompt(`Alasan menghapus ${sale.invoice_no}:`, "Transaksi salah");
    if (reason === null) return;
    if (reason.trim().length < 3) {
      setError("Alasan penghapusan minimal 3 karakter.");
      return;
    }
    if (!window.confirm(`Hapus transaksi ${sale.invoice_no}? Stok akan dikembalikan.`)) return;
    setDeleting(String(sale.id));
    setError("");
    try {
      await posApi.remove(sale.id, reason.trim());
      setSales((current) => current.filter((row) => String(row.id) !== String(sale.id)));
    } catch (requestError) {
      setError(getPosApiError(requestError, "Transaksi gagal dihapus."));
    } finally {
      setDeleting("");
    }
  };

  return (
    <PosLayout title="Daftar Transaksi">
      <div className="space-y-3 pb-24">
        <section className="rounded-[24px] border border-white/80 bg-white/90 p-4 shadow-sm">
          <div className="grid grid-cols-[100px_minmax(0,1fr)] gap-2">
            <label className="text-[10px] font-extrabold uppercase tracking-wide text-slate-500">
              Tahun
              <input type="number" min="2020" max="9999" value={year} onChange={(event) => setYear(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold outline-none focus:border-blue-400" />
            </label>
            <label className="text-[10px] font-extrabold uppercase tracking-wide text-slate-500">
              Cari nomor invoice
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Contoh P1020260001" className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-400" />
            </label>
          </div>
          {offline && <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">Mode offline: menampilkan transaksi yang tersimpan di perangkat.</p>}
          {error && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</p>}
        </section>

        {loading ? (
          <div className="flex min-h-52 items-center justify-center"><span className="h-9 w-9 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" /></div>
        ) : sales.length === 0 ? (
          <div className="rounded-[24px] border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Belum ada transaksi pada periode ini.</div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {sales.map((sale) => (
              <article key={`${sale.client_transaction_id || sale.id}-${sale.invoice_no}`} className="rounded-[24px] border border-white/80 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-black text-slate-900">{sale.invoice_no}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{dateLabel(sale.transaction_date)}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${sale.status === "draft" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>{sale.status === "draft" ? "Draft" : sale.payment_status || "Final"}</span>
                </div>
                <div className="mt-3 flex items-end justify-between border-y border-dashed border-slate-200 py-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Customer</p>
                    <p className="mt-0.5 text-sm font-bold text-slate-700">{sale.contact || "Umum"}</p>
                  </div>
                  <p className="text-base font-black text-blue-700">{rupiah(saleTotal(sale))}</p>
                </div>
                {sale.sync_state && sale.sync_state !== "synced" && <p className="mt-2 text-[10px] font-bold text-amber-700">Status sinkronisasi: {sale.sync_state}</p>}
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <button type="button" onClick={() => navigate(`/invoice/${sale.id}`)} className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-2.5 text-xs font-extrabold text-slate-700">Lihat</button>
                  <button type="button" onClick={() => navigate(`/pos/${sale.id}/edit`)} className="rounded-xl border border-blue-200 bg-blue-50 px-2 py-2.5 text-xs font-extrabold text-blue-700">Edit</button>
                  <button type="button" disabled={deleting === String(sale.id)} onClick={() => remove(sale)} className="rounded-xl border border-red-200 bg-red-50 px-2 py-2.5 text-xs font-extrabold text-red-700 disabled:opacity-50">{deleting === String(sale.id) ? "…" : "Hapus"}</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </PosLayout>
  );
}
