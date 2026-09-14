const PAGE_SIZES = [10, 25, 50, 100, 250, 500, 1000];

export default function ListPagination({ total, page, pageSize, onPageChange, onPageSizeChange }) {
  const all = pageSize === "all";
  const size = all ? Math.max(total, 1) : Number(pageSize);
  const totalPages = all ? 1 : Math.max(1, Math.ceil(total / size));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = total ? (currentPage - 1) * size + 1 : 0;
  const end = total ? Math.min(total, currentPage * size) : 0;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/80 bg-white/90 px-3 py-3 text-xs shadow-sm">
      <div className="flex items-center gap-2 font-bold text-slate-600">
        <span>Tampilkan</span>
        <select value={pageSize} onChange={(event) => onPageSizeChange(event.target.value)} className="h-9 rounded-xl border border-slate-200 bg-white px-2 font-extrabold text-slate-800 outline-none focus:border-blue-400">
          {PAGE_SIZES.map((value) => <option key={value} value={String(value)}>{value}</option>)}
          <option value="all">Semua</option>
        </select>
      </div>
      <p className="font-semibold text-slate-500">{start}–{end} dari {total}</p>
      {!all && (
        <div className="flex items-center gap-2">
          <button type="button" disabled={currentPage <= 1} onClick={() => onPageChange(currentPage - 1)} className="h-9 rounded-xl border border-slate-200 px-3 font-extrabold text-slate-700 disabled:opacity-35">←</button>
          <span className="min-w-16 text-center font-extrabold text-slate-700">{currentPage} / {totalPages}</span>
          <button type="button" disabled={currentPage >= totalPages} onClick={() => onPageChange(currentPage + 1)} className="h-9 rounded-xl border border-slate-200 px-3 font-extrabold text-slate-700 disabled:opacity-35">→</button>
        </div>
      )}
    </div>
  );
}
