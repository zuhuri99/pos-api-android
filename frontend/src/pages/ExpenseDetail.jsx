import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../api/axios";
import MobileLayout from "../layouts/MobileLayout";
import ReceiptImage from "../components/ReceiptImage";
import { downloadUrl, saveBlob } from "../platform/files";

const formatCurrency = (value) => new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
}).format(Number(value) || 0);

const formatDate = (value) => value
  ? new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString("id-ID", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    })
  : "-";

function DetailItem({ label, children }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1.5 break-words text-sm font-semibold text-slate-900">{children || "-"}</dd>
    </div>
  );
}

export default function ExpenseDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [expense, setExpense] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [activeReceipt, setActiveReceipt] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [downloading, setDownloading] = useState(false);
  const [viewerMessage, setViewerMessage] = useState("");
  const viewerRef = useRef(null);
  const pointersRef = useRef(new Map());
  const gestureRef = useRef(null);

  const loadExpense = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await api.get(`/expenses/${id}/`);
      setExpense(response.data);
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Detail expense tidak dapat dimuat.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadExpense(); }, [loadExpense]);

  useEffect(() => {
    setZoom(1);
    setPosition({ x: 0, y: 0 });
    setViewerMessage("");
    pointersRef.current.clear();
    gestureRef.current = null;
  }, [activeReceipt?.id]);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(expense.transaction_code || "");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const receipts = Array.isArray(expense?.receipts) ? expense.receipts : [];
  const activeReceiptIndex = activeReceipt ? receipts.findIndex((item) => item.id === activeReceipt.id) : -1;

  const clampPosition = useCallback((nextPosition, nextZoom = zoom) => {
    if (nextZoom <= 1) return { x: 0, y: 0 };
    const rect = viewerRef.current?.getBoundingClientRect();
    if (!rect) return nextPosition;
    const maxX = (rect.width * (nextZoom - 1)) / 2;
    const maxY = (rect.height * (nextZoom - 1)) / 2;
    return {
      x: Math.max(-maxX, Math.min(maxX, nextPosition.x)),
      y: Math.max(-maxY, Math.min(maxY, nextPosition.y)),
    };
  }, [zoom]);

  const changeZoom = useCallback((value) => {
    const nextZoom = Math.max(1, Math.min(5, value));
    setZoom(nextZoom);
    setPosition((current) => clampPosition(current, nextZoom));
  }, [clampPosition]);

  const resetZoom = useCallback(() => {
    setZoom(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  const beginGesture = (event) => {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...pointersRef.current.values()];
    if (points.length === 1) {
      gestureRef.current = { type: "pan", start: points[0], position };
    } else if (points.length === 2) {
      gestureRef.current = {
        type: "pinch",
        distance: Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y) || 1,
        center: { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 },
        position,
        zoom,
      };
    }
  };

  const moveGesture = (event) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...pointersRef.current.values()];
    const gesture = gestureRef.current;
    if (points.length === 2 && gesture?.type === "pinch") {
      const distance = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
      const center = { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 };
      const nextZoom = Math.max(1, Math.min(5, gesture.zoom * (distance / gesture.distance)));
      const nextPosition = clampPosition({
        x: gesture.position.x + center.x - gesture.center.x,
        y: gesture.position.y + center.y - gesture.center.y,
      }, nextZoom);
      setZoom(nextZoom);
      setPosition(nextPosition);
    } else if (points.length === 1 && gesture?.type === "pan" && zoom > 1) {
      setPosition(clampPosition({
        x: gesture.position.x + points[0].x - gesture.start.x,
        y: gesture.position.y + points[0].y - gesture.start.y,
      }));
    }
  };

  const endGesture = (event) => {
    pointersRef.current.delete(event.pointerId);
    const remaining = [...pointersRef.current.values()];
    gestureRef.current = remaining.length === 1
      ? { type: "pan", start: remaining[0], position }
      : null;
  };

  const downloadReceipt = async () => {
    if (!activeReceipt || downloading) return;
    setDownloading(true);
    setViewerMessage("");
    let sourceUrl = activeReceipt.url;
    const filename = activeReceipt.filename || `${expense?.transaction_code || "bukti-expense"}-${activeReceiptIndex + 1}.jpg`;
    try {
      let response = await fetch(sourceUrl, { referrerPolicy: "no-referrer" });
      if (!response.ok) {
        const refreshed = await api.get(`/expenses/${expense.id}/receipts/${activeReceipt.id}/`);
        sourceUrl = refreshed.data?.url || sourceUrl;
        setActiveReceipt((current) => ({ ...current, url: sourceUrl }));
        response = await fetch(sourceUrl, { referrerPolicy: "no-referrer" });
      }
      if (!response.ok) throw new Error("Foto tidak dapat diunduh.");
      await saveBlob(await response.blob(), filename);
      setViewerMessage("Foto siap disimpan atau dibagikan.");
    } catch {
      try {
        await downloadUrl(sourceUrl, filename);
        setViewerMessage("Unduhan foto dibuka.");
      } catch {
        setViewerMessage("Foto gagal diunduh. Coba muat ulang detail expense.");
      }
    } finally {
      setDownloading(false);
    }
  };

  return (
    <MobileLayout title="Detail Expense">
      <div className="mx-auto max-w-5xl pb-10">
        {loading && <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500" role="status">Memuat detail expense…</div>}

        {!loading && error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700" role="alert">
            <p className="font-semibold">{error}</p>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => navigate("/expense")} className="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-bold">Kembali</button>
              <button type="button" onClick={loadExpense} className="rounded-lg bg-red-700 px-4 py-2 text-sm font-bold text-white">Coba lagi</button>
            </div>
          </div>
        )}

        {!loading && expense && (
          <div className="space-y-5">
            <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-[#063b64] via-[#07558d] to-[#0086cf] text-white shadow-lg">
              <div className="p-5 sm:p-7">
                <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-3 py-1 text-xs font-bold ${expense.is_posted ? "bg-emerald-300/20 text-emerald-100 ring-1 ring-emerald-200/30" : "bg-amber-300/20 text-amber-100 ring-1 ring-amber-200/30"}`}>
                        {expense.is_posted ? "Sudah diposting" : "Belum diposting"}
                      </span>
                      <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold ring-1 ring-white/20">
                        {expense.status === "produksi" ? "Produksi" : "Non Produksi"}
                      </span>
                    </div>
                    <p className="mt-5 text-sm text-blue-100">Nilai transaksi</p>
                    <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">{formatCurrency(expense.amount)}</h1>
                    <p className="mt-3 text-sm text-blue-100">{formatDate(expense.date)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => navigate("/expense")} className="rounded-xl bg-white/10 px-4 py-2.5 text-sm font-bold ring-1 ring-white/25 hover:bg-white/20">← Daftar</button>
                    <button type="button" onClick={() => navigate(`/expense/${expense.id}/edit`)} className="rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-[#0067b8] shadow hover:bg-blue-50">Edit expense</button>
                  </div>
                </div>
              </div>
            </section>

            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.72fr)]">
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="flex items-center justify-between gap-3">
                  <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0067b8]">Informasi transaksi</p><h2 className="mt-1 text-xl font-bold text-slate-900">{expense.category || "Tanpa kategori"}</h2></div>
                  <button type="button" onClick={copyCode} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">{copied ? "Tersalin ✓" : "Salin kode"}</button>
                </div>
                <dl className="mt-5 grid gap-3 sm:grid-cols-2">
                  <DetailItem label="Kode transaksi">{expense.transaction_code}</DetailItem>
                  <DetailItem label="Dibuat oleh">{expense.username}</DetailItem>
                  <DetailItem label="Kategori">{expense.category}</DetailItem>
                  <DetailItem label="Jenis biaya">{expense.status === "produksi" ? "Produksi" : "Non Produksi"}</DetailItem>
                </dl>
                <div className="mt-3 rounded-xl border border-slate-200 p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Keterangan</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{expense.detail || "Tidak ada keterangan."}</p>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="flex items-center justify-between gap-3">
                  <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0067b8]">Bukti transaksi</p><h2 className="mt-1 text-lg font-bold text-slate-900">{receipts.length} lampiran</h2></div>
                </div>
                {receipts.length ? (
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    {receipts.map((receipt, index) => (
                      <button key={receipt.id || receipt.url} type="button" onClick={() => setActiveReceipt(receipt)} className="group relative aspect-[4/3] overflow-hidden rounded-xl border border-slate-200 bg-slate-100 text-left">
                        <ReceiptImage expenseId={expense.id} receipt={receipt} alt={`Bukti transaksi ${index + 1}`} className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
                        <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-3 pb-2 pt-8 text-xs font-bold text-white">Bukti {index + 1}</span>
                      </button>
                    ))}
                  </div>
                ) : <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">Belum ada bukti transaksi.</div>}
              </section>
            </div>
          </div>
        )}
      </div>

      {activeReceipt && (
        <div className="fixed inset-0 z-[200] flex flex-col bg-slate-950/95 p-3 text-white sm:p-6" role="dialog" aria-modal="true" aria-label="Pratinjau bukti transaksi">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
            <div><p className="font-bold">Bukti transaksi {activeReceiptIndex + 1}</p><p className="max-w-[65vw] truncate text-xs text-slate-300">{activeReceipt.filename || expense?.transaction_code}</p></div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={downloadReceipt} disabled={downloading} className="rounded-full bg-white px-4 py-2 text-sm font-bold text-slate-900 hover:bg-slate-100 disabled:opacity-60">{downloading ? "Mengunduh…" : "Unduh foto"}</button>
              <button type="button" onClick={() => setActiveReceipt(null)} className="rounded-full bg-white/10 px-4 py-2 text-sm font-bold hover:bg-white/20">Tutup ✕</button>
            </div>
          </div>
          <div
            ref={viewerRef}
            onPointerDown={beginGesture}
            onPointerMove={moveGesture}
            onPointerUp={endGesture}
            onPointerCancel={endGesture}
            onDoubleClick={() => zoom > 1 ? resetZoom() : changeZoom(2)}
            onWheel={(event) => {
              event.preventDefault();
              changeZoom(zoom + (event.deltaY < 0 ? 0.25 : -0.25));
            }}
            className={`flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-xl bg-black/30 select-none ${zoom > 1 ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in"}`}
            style={{ touchAction: "none" }}
          >
            <ReceiptImage
              expenseId={expense?.id}
              receipt={activeReceipt}
              alt="Bukti transaksi ukuran penuh"
              draggable="false"
              className="max-h-full max-w-full select-none object-contain will-change-transform"
              style={{ transform: `translate3d(${position.x}px, ${position.y}px, 0) scale(${zoom})`, transition: pointersRef.current.size ? "none" : "transform 160ms ease-out" }}
            />
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-3">
            {receipts.length > 1 && <button type="button" disabled={zoom > 1} onClick={() => setActiveReceipt(receipts[(activeReceiptIndex - 1 + receipts.length) % receipts.length])} className="rounded-xl bg-white/10 px-4 py-2 text-sm font-bold hover:bg-white/20 disabled:opacity-40">← Sebelumnya</button>}
            <div className="flex items-center overflow-hidden rounded-xl bg-white/10">
              <button type="button" onClick={() => changeZoom(zoom - 0.5)} disabled={zoom <= 1} aria-label="Perkecil foto" className="px-4 py-2 text-lg font-bold disabled:opacity-40">−</button>
              <button type="button" onClick={resetZoom} className="min-w-20 border-x border-white/10 px-3 py-2 text-xs font-bold" aria-label="Reset zoom">{Math.round(zoom * 100)}%</button>
              <button type="button" onClick={() => changeZoom(zoom + 0.5)} disabled={zoom >= 5} aria-label="Perbesar foto" className="px-4 py-2 text-lg font-bold disabled:opacity-40">+</button>
            </div>
            {receipts.length > 1 && <button type="button" disabled={zoom > 1} onClick={() => setActiveReceipt(receipts[(activeReceiptIndex + 1) % receipts.length])} className="rounded-xl bg-white/10 px-4 py-2 text-sm font-bold hover:bg-white/20 disabled:opacity-40">Berikutnya →</button>}
          </div>
          <p className={`min-h-5 pt-2 text-center text-xs ${viewerMessage.includes("gagal") ? "text-red-300" : "text-slate-300"}`}>{viewerMessage || "Cubit atau klik dua kali foto untuk memperbesar. Geser saat foto diperbesar."}</p>
        </div>
      )}
    </MobileLayout>
  );
}
