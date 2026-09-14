import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import PosLayout from "../../../layouts/PosLayout";
import ListPagination from "../../../components/ListPagination";
import TransactionDeleteDialog from "../components/TransactionDeleteDialog";
import TransactionMarkDialog from "../components/TransactionMarkDialog";
import { posApi } from "../api/posApi";
import { getPosApiError } from "../posUtils";
import { getActiveAccount } from "../../../utils/auth";

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
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [markTarget, setMarkTarget] = useState(null);
  const [marking, setMarking] = useState("");
  const [markError, setMarkError] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState("10");
  const requiresDeletePin = !getActiveAccount()?.user?.is_superuser;
  const totalPages = pageSize === "all" ? 1 : Math.max(1, Math.ceil(sales.length / Number(pageSize)));
  const currentPage = Math.min(page, totalPages);
  const visibleSales = pageSize === "all"
    ? sales
    : sales.slice((currentPage - 1) * Number(pageSize), currentPage * Number(pageSize));

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

  const remove = async ({ reason, pin }) => {
    const sale = deleteTarget;
    if (!sale) return;
    setDeleting(String(sale.id));
    setError("");
    try {
      await posApi.remove(sale.id, reason, pin);
      setSales((current) => current.filter((row) => String(row.id) !== String(sale.id)));
      setDeleteTarget(null);
    } catch (requestError) {
      setError(getPosApiError(requestError, "Transaksi gagal dihapus."));
    } finally {
      setDeleting("");
    }
  };

  const mark = async ({ markType, reason }) => {
    const sale = markTarget;
    if (!sale) return;
    setMarking(String(sale.id));
    setMarkError("");
    try {
      const result = await posApi.mark(sale.id, markType, reason);
      const marked = result.data?.data || {};
      setSales((current) => current.map((row) => String(row.id) === String(sale.id) ? { ...row, ...marked } : row));
      setMarkTarget(null);
    } catch (requestError) {
      setMarkError(getPosApiError(requestError, "Transaksi gagal ditandai."));
    } finally {
      setMarking("");
    }
  };

  return (
    <PosLayout title="Daftar Transaksi">
      <div className="space-y-3 pb-24">
        <section className="rounded-[24px] border border-white/80 bg-white/90 p-4 shadow-sm">
          <div className="grid grid-cols-[100px_minmax(0,1fr)] gap-2">
            <label className="text-[10px] font-extrabold uppercase tracking-wide text-slate-500">
              Tahun
              <input type="number" min="2020" max="9999" value={year} onChange={(event) => { setYear(event.target.value); setPage(1); }} className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold outline-none focus:border-blue-400" />
            </label>
            <label className="text-[10px] font-extrabold uppercase tracking-wide text-slate-500">
              Cari nomor invoice
              <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Contoh P1020260001" className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-400" />
            </label>
          </div>
          {offline && <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">Mode offline: menampilkan transaksi yang tersimpan di perangkat.</p>}
          {error && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</p>}
        </section>

        {!loading && <ListPagination total={sales.length} page={currentPage} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(value) => { setPageSize(value); setPage(1); }} />}

        {loading ? (
          <div className="flex min-h-52 items-center justify-center"><span className="h-9 w-9 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" /></div>
        ) : sales.length === 0 ? (
          <div className="rounded-[24px] border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Belum ada transaksi pada periode ini.</div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {visibleSales.map((sale) => (
              <article key={`${sale.client_transaction_id || sale.id}-${sale.invoice_no}`} className={`rounded-[24px] border bg-white p-4 shadow-sm ${sale.mark_reason ? "border-amber-300 ring-2 ring-amber-100" : "border-white/80"}`}>
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
                {sale.mark_reason && <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-extrabold text-amber-900">⚑ Ditandai: {sale.mark_reason}</p>}
                <div className="mt-3 grid grid-cols-4 gap-2">
                  <button type="button" onClick={() => navigate(`/invoice/${sale.id}`)} className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-2.5 text-xs font-extrabold text-slate-700">Lihat</button>
                  <button type="button" onClick={() => navigate(`/pos/${sale.id}/edit`)} className="rounded-xl border border-blue-200 bg-blue-50 px-2 py-2.5 text-xs font-extrabold text-blue-700">Edit</button>
                  <button type="button" disabled={marking === String(sale.id)} onClick={() => { setMarkError(""); setMarkTarget(sale); }} className="rounded-xl border border-amber-300 bg-amber-50 px-1 py-2.5 text-xs font-extrabold text-amber-800 disabled:opacity-50">{marking === String(sale.id) ? "…" : "Tandai"}</button>
                  <button type="button" disabled={deleting === String(sale.id)} onClick={() => { setError(""); setDeleteTarget(sale); }} className="rounded-xl border border-red-200 bg-red-50 px-2 py-2.5 text-xs font-extrabold text-red-700 disabled:opacity-50">{deleting === String(sale.id) ? "…" : "Hapus"}</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
      {deleteTarget && <TransactionDeleteDialog sale={deleteTarget} requiresPin={requiresDeletePin} busy={Boolean(deleting)} error={error} onClose={() => { if (!deleting) setDeleteTarget(null); }} onConfirm={remove} />}
      {markTarget && <TransactionMarkDialog sale={markTarget} busy={Boolean(marking)} error={markError} onClose={() => { if (!marking) setMarkTarget(null); }} onConfirm={mark} />}
    </PosLayout>
  );
}
