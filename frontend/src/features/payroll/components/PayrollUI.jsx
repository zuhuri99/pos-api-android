import { statusClass, statusLabels } from "../payrollUtils";

export function LoadingState({ label = "Memuat data payroll...", description = "" }) {
  return (
    <div className="bg-white border border-gray-200 p-8 text-center text-sm text-gray-500">
      <div>
        <span className="inline-block w-5 h-5 border-2 border-[#0067b8] border-t-transparent rounded-full animate-spin mr-2 align-middle" />
        {label}
      </div>
      {description && <p className="mt-2 text-xs text-gray-400 max-w-2xl mx-auto leading-relaxed">{description}</p>}
    </div>
  );
}

export function EmptyState({ title = "Belum ada data", description, action }) {
  return (
    <div className="bg-white border border-dashed border-gray-300 p-8 text-center">
      <div className="w-10 h-10 mx-auto mb-3 bg-blue-50 text-[#0067b8] flex items-center justify-center text-xl">＋</div>
      <h3 className="font-semibold text-gray-800">{title}</h3>
      {description && <p className="text-sm text-gray-500 mt-1">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorBanner({ message, onRetry }) {
  if (!message) return null;
  return (
    <div className="mb-4 border border-red-200 bg-red-50 p-3 flex items-start justify-between gap-3 text-sm text-red-700">
      <span>{message}</span>
      {onRetry && <button onClick={onRetry} className="font-semibold underline">Coba lagi</button>}
    </div>
  );
}

export function SuccessBanner({ message, onClose }) {
  if (!message) return null;
  return (
    <div className="mb-4 border border-green-200 bg-green-50 p-3 flex items-start justify-between gap-3 text-sm text-green-700">
      <span>{message}</span>
      {onClose && <button onClick={onClose} className="font-semibold">×</button>}
    </div>
  );
}

export function StatusPill({ status }) {
  return <span className={`inline-flex px-2 py-1 border text-[11px] font-semibold ${statusClass(status)}`}>{statusLabels[status] || status || "-"}</span>;
}

export function Field({ label, required, children, hint }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-gray-600 mb-1">{label}{required && <span className="text-red-600"> *</span>}</span>
      {children}
      {hint && <span className="block text-[11px] text-gray-400 mt-1">{hint}</span>}
    </label>
  );
}

export const inputClass = "w-full bg-white border border-gray-300 px-3 py-2.5 text-sm text-gray-800 outline-none focus:border-[#0067b8] focus:ring-1 focus:ring-[#0067b8] disabled:bg-gray-100";
export const primaryButton = "bg-[#0067b8] hover:bg-[#005a9e] disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-4 py-2.5 text-sm font-semibold transition-colors";
export const secondaryButton = "bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 px-4 py-2.5 text-sm font-semibold transition-colors";

export function Pagination({ page, count, pageSize = 25, onPageChange, onPageSizeChange }) {
  const showAll = pageSize === "all";
  const totalPages = showAll ? 1 : Math.max(1, Math.ceil((count || 0) / pageSize));
  return <div className="mt-4 bg-white border border-gray-200 px-4 py-3 flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap items-center gap-3"><label className="flex items-center gap-2 text-xs text-gray-600"><span>Tampilkan</span><select className="bg-white border border-gray-300 px-2 py-1.5 outline-none focus:border-[#0067b8]" value={pageSize} onChange={(event) => onPageSizeChange?.(event.target.value === "all" ? "all" : Number(event.target.value))}>{[10, 25, 50, 100, 250, 500, 1000].map((size) => <option key={size} value={size}>{size}</option>)}<option value="all">Semua</option></select><span>data</span></label><p className="text-xs text-gray-500">{showAll ? `${count} data` : `Halaman ${page} dari ${totalPages} · ${count} data`}</p></div>{!showAll && totalPages > 1 && <div className="flex gap-2"><button disabled={page <= 1} onClick={() => onPageChange(page - 1)} className={secondaryButton}>Sebelumnya</button><button disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} className={secondaryButton}>Berikutnya</button></div>}</div>;
}

export function Modal({ title, children, onClose, size = "max-w-xl" }) {
  return (
    <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-[1px] flex items-center justify-center p-4" onMouseDown={onClose}>
      <div className={`bg-white w-full ${size} max-h-[90dvh] overflow-y-auto shadow-2xl`} onMouseDown={(event) => event.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 flex items-center justify-between z-10">
          <h2 className="font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="w-8 h-8 text-xl text-gray-500 hover:bg-gray-100">×</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function ConfirmDialog({ title, message, confirmLabel = "Lanjutkan", onConfirm, onClose, busy = false, danger = false, error = "" }) {
  return <Modal title={title} onClose={busy ? undefined : onClose} size="max-w-md"><div className="space-y-5"><p className="text-sm text-gray-600 leading-relaxed">{message}</p>{error && <div className="border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}<div className="flex justify-end gap-2"><button type="button" disabled={busy} onClick={onClose} className={secondaryButton}>Batal</button><button type="button" disabled={busy} onClick={onConfirm} className={danger ? "bg-red-700 hover:bg-red-800 disabled:bg-gray-300 text-white px-4 py-2.5 text-sm font-semibold" : primaryButton}>{busy ? "Memproses..." : confirmLabel}</button></div></div></Modal>;
}
