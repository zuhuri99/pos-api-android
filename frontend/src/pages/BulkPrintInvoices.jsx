import { savePdf } from "../platform/files";
import { isNative } from "../platform/native";
import { useState, useRef, useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import MobileLayout from "../layouts/MobileLayout";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { QRCodeSVG } from "qrcode.react";
import { getPaymentStatusText } from "../utils/paymentStatus";
import { isDraftTransaction } from "../features/pos/transactionStatus";

/* ===============================
 * HELPER FORMATTING
 * =============================== */
const formatRupiah = (angka) => {
  return new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(angka) || 0);
};

const formatTanggal = (tgl) => {
  if (!tgl) return "-";
  return new Date(tgl).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

// Helper memecah array jadi grup (8 item per grup untuk 1 halaman)
const chunkArray = (array, size) => {
  const chunked = [];
  for (let i = 0; i < array.length; i += size) {
    chunked.push(array.slice(i, i + size));
  }
  return chunked;
};

export default function BulkPrintInvoice() {
  const location = useLocation();
  const navigate = useNavigate();

  const [invoices] = useState(() => location.state?.invoices || []);
  const [loading, setLoading] = useState(false);
  const [documentError, setDocumentError] = useState("");
  const [showWatermarkModal, setShowWatermarkModal] = useState(true);
  const [watermarkEnabled, setWatermarkEnabled] = useState(false);
  const [watermarkText, setWatermarkText] = useState("SALINAN");
  const [watermarkSize, setWatermarkSize] = useState(40);
  const [watermarkOpacity, setWatermarkOpacity] = useState(25);
  const [draftWatermarkEnabled, setDraftWatermarkEnabled] = useState(true);
  const [draftWatermarkText, setDraftWatermarkText] = useState("SALINAN");
  const [draftWatermarkSize, setDraftWatermarkSize] = useState(40);
  const [draftWatermarkOpacity, setDraftWatermarkOpacity] = useState(25);
  const [invoiceSortOrder, setInvoiceSortOrder] = useState("oldest");
  const [draftInvoiceSortOrder, setDraftInvoiceSortOrder] = useState("oldest");
  const [watermarkError, setWatermarkError] = useState("");
  const printRefs = useRef([]);

  useEffect(() => {
    if (!location.state?.invoices) {
      alert("Tidak ada data invoice yang dipilih untuk dicetak.");
      navigate(-1);
    }
  }, [location.state, navigate]);

  const sortedInvoices = useMemo(
    () =>
      invoices
        .map((invoice, originalIndex) => ({ invoice, originalIndex }))
        .sort((a, b) => {
          const aTime = Date.parse(a.invoice.transaction_date);
          const bTime = Date.parse(b.invoice.transaction_date);
          const aHasValidDate = Number.isFinite(aTime);
          const bHasValidDate = Number.isFinite(bTime);

          // Invoice tanpa tanggal valid selalu diletakkan paling akhir.
          if (!aHasValidDate && !bHasValidDate) {
            return a.originalIndex - b.originalIndex;
          }
          if (!aHasValidDate) return 1;
          if (!bHasValidDate) return -1;

          const dateDifference =
            invoiceSortOrder === "oldest" ? aTime - bTime : bTime - aTime;
          return dateDifference || a.originalIndex - b.originalIndex;
        })
        .map(({ invoice }) => invoice),
    [invoices, invoiceSortOrder],
  );

  const pages = chunkArray(sortedInvoices, 8); // 8 invoice per halaman

  /* ===============================
   * LOGIKA CETAK / EXPORT (Ukuran F4)
   * =============================== */
  const F4_WIDTH = 215;
  const F4_HEIGHT = 330;
  const PDF_RENDER_SCALE = 1.5;
  const PRINT_RENDER_SCALE = 2;
  const PDF_JPEG_QUALITY = 0.68;

  const generateCanvases = async (scale = PRINT_RENDER_SCALE) => {
    setLoading(true);
    const canvases = [];
    try {
      for (let i = 0; i < pages.length; i++) {
        const element = printRefs.current[i];
        if (element) {
          const canvas = await html2canvas(element, {
            scale,
            useCORS: true,
            allowTaint: false,
            backgroundColor: "#ffffff",
          });
          canvases.push(canvas);
        }
      }
    } catch (err) {
      console.error("Gagal merender cetakan", err);
    }
    setLoading(false);
    return canvases;
  };

  const handleDownloadPDF = async (print = false) => {
    const canvases = await generateCanvases(PDF_RENDER_SCALE);
    if (!canvases.length) return;

    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: [F4_WIDTH, F4_HEIGHT],
      compress: true,
      putOnlyUsedFonts: true,
    });

    canvases.forEach((canvas, index) => {
      const imgData = canvas.toDataURL("image/jpeg", PDF_JPEG_QUALITY);
      if (index > 0) pdf.addPage();

      // FAST mengurangi overhead kompresi jsPDF; dimensi dikunci ke F4 agar
      // tidak terbentuk area halaman tambahan akibat pembulatan rasio canvas.
      pdf.addImage(
        imgData,
        "JPEG",
        0,
        0,
        F4_WIDTH,
        F4_HEIGHT,
        undefined,
        "FAST",
      );
    });

    await savePdf(pdf, `Bulk-Nota-${new Date().getTime()}.pdf`, print);
  };

  const handlePrint = async () => {
    if (isNative) return handleDownloadPDF(true);
    const canvases = await generateCanvases(PRINT_RENDER_SCALE);
    if (!canvases.length) return;

    // 🔹 FIX: Gunakan Hidden Iframe alih-alih window.open agar tidak diblokir browser
    let iframe = document.getElementById("print-iframe");
    
    // Buat iframe jika belum ada di dalam DOM
    if (!iframe) {
      iframe = document.createElement("iframe");
      iframe.id = "print-iframe";
      // Sembunyikan iframe dari tampilan layar
      iframe.style.position = "fixed";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "0";
      document.body.appendChild(iframe);
    }

    let htmlContent = `
      <html>
        <head>
          <title>Bulk Print Nota</title>
          <style>
            body { margin: 0; padding: 0; background: #fff; text-align: center; }
            @page { size: ${F4_WIDTH}mm ${F4_HEIGHT}mm; margin: 0; }
            .page-img { width: ${F4_WIDTH}mm; max-width: 100%; height: auto; display: block; page-break-after: always; margin: 0 auto; }
            .page-img:last-child { page-break-after: auto; }
          </style>
        </head>
        <body>
    `;

    canvases.forEach((canvas) => {
      // JPEG rendering untuk performa print lebih cepat
      htmlContent += `<img src="${canvas.toDataURL("image/jpeg", 0.9)}" class="page-img" />`;
    });

    htmlContent += `
        </body>
      </html>
    `;

    // Tulis konten ke dalam iframe
    const iframeDoc = iframe.contentWindow.document;
    iframeDoc.open();
    iframeDoc.write(htmlContent);
    iframeDoc.close();

    // 🔹 FIX: Tunggu sebentar agar gambar Base64 selesai di-render di dalam iframe, lalu cetak
    setTimeout(() => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    }, 500); // Jeda 0.5 detik sudah sangat aman untuk render gambar Base64
  };

  const openWatermarkSettings = () => {
    setDraftWatermarkEnabled(watermarkEnabled);
    setDraftWatermarkText(watermarkText);
    setDraftWatermarkSize(watermarkSize);
    setDraftWatermarkOpacity(watermarkOpacity);
    setDraftInvoiceSortOrder(invoiceSortOrder);
    setWatermarkError("");
    setShowWatermarkModal(true);
  };

  const applyWatermark = (event) => {
    event.preventDefault();
    const normalizedText = draftWatermarkText.trim();

    if (draftWatermarkEnabled && !normalizedText) {
      setWatermarkError("Teks watermark wajib diisi.");
      return;
    }

    setWatermarkEnabled(draftWatermarkEnabled);
    if (normalizedText) setWatermarkText(normalizedText);
    setWatermarkSize(draftWatermarkSize);
    setWatermarkOpacity(draftWatermarkOpacity);
    setInvoiceSortOrder(draftInvoiceSortOrder);
    setWatermarkError("");
    setShowWatermarkModal(false);
  };

  const continueWithoutWatermark = () => {
    setWatermarkEnabled(false);
    setInvoiceSortOrder(draftInvoiceSortOrder);
    setWatermarkError("");
    setShowWatermarkModal(false);
  };

  return (
    <MobileLayout title="Bulk Print Invoice">
      <div className="pb-20">
        {documentError && <div role="alert" className="m-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{documentError}</div>}
        <div className="bg-white px-4 py-3 border-b border-gray-200 shadow-sm flex justify-between items-center">
          <button
            onClick={() => navigate(-1)}
            className="text-sm font-semibold text-[#0067b8] hover:underline flex items-center gap-1"
          >
            <span>←</span> Kembali
          </button>
          <div className="text-sm font-semibold text-gray-700">
            Total: {invoices.length} Invoice ({pages.length} Halaman)
          </div>
        </div>

        {/* TOMBOL AKSI */}
        <div className="p-4 bg-[#f3f2f1] flex flex-wrap gap-3 shadow-sm justify-center sticky top-0 z-20 border-b border-gray-300">
          <button
            onClick={openWatermarkSettings}
            disabled={loading}
            className="flex-1 py-2 text-xs font-semibold bg-white text-gray-700 border border-gray-300 hover:bg-gray-100 disabled:opacity-50"
          >
            {watermarkEnabled ? `Watermark: ${watermarkText}` : "Tanpa Watermark"}
          </button>
          <button
            onClick={() => { setDocumentError(""); handleDownloadPDF().catch((err) => setDocumentError(err.message || "Dokumen gagal diproses.")); }}
            disabled={loading}
            className="flex-1 py-2 text-xs font-semibold bg-red-100 text-red-700 border border-red-300 hover:bg-red-200 disabled:opacity-50"
          >
            {loading ? "Memproses..." : "Download PDF (F4)"}
          </button>
          <button
            onClick={() => { setDocumentError(""); handlePrint().catch((err) => setDocumentError(err.message || "Dokumen gagal diproses.")); }}
            disabled={loading}
            className="flex-1 py-2 text-xs font-semibold bg-[#0067b8] text-white border border-[#0067b8] hover:bg-[#005a9e] disabled:opacity-50"
          >
            {loading ? "Memproses..." : "Cetak Printer"}
          </button>
        </div>

        {/* CONTAINER PREVIEW */}
        <div className="w-full bg-gray-300 py-6 overflow-x-auto">
          <div className="min-w-max px-6 flex flex-col items-center gap-6">
            {pages.map((pageInvoices, pageIndex) => (
              <div
                key={pageIndex}
                ref={(el) => (printRefs.current[pageIndex] = el)}
                className="bg-white shadow-xl overflow-hidden relative"
                style={{
                  width: `${F4_WIDTH}mm`,
                  height: `${F4_HEIGHT}mm`,
                  padding: "4mm",
                  boxSizing: "border-box",
                  fontFamily: '"Courier New", Courier, monospace',
                  color: "#000",
                }}
              >
                <div className="grid grid-cols-2 grid-rows-4 gap-[3mm] w-full h-full relative z-0">
                  {pageInvoices.map((inv) => (
                    <InvoiceTicket key={inv.id} invoice={inv} />
                  ))}
                </div>
                {watermarkEnabled && (
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none select-none overflow-hidden"
                  >
                    <span
                      className="font-bold whitespace-nowrap"
                      style={{
                        color: "#6b7280",
                        opacity: watermarkOpacity / 100,
                        fontSize: `${watermarkSize}mm`,
                        letterSpacing: "2mm",
                        lineHeight: 1,
                        transform: "rotate(-45deg)",
                      }}
                    >
                      {watermarkText}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {showWatermarkModal && (
        <div
          className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="watermark-dialog-title"
        >
          <form
            onSubmit={applyWatermark}
            className="bg-white w-full max-w-md shadow-2xl"
          >
            <div className="border-b border-gray-200 px-5 py-4">
              <h2
                id="watermark-dialog-title"
                className="font-semibold text-gray-900"
              >
                Pengaturan Cetak Invoice
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                Watermark ditampilkan satu kali di tengah setiap halaman F4.
              </p>
            </div>

            <div className="p-5 space-y-4">
              <label className="block">
                <span className="block text-xs font-semibold text-gray-600 mb-1">
                  Urutan nota berdasarkan tanggal
                </span>
                <select
                  value={draftInvoiceSortOrder}
                  onChange={(event) =>
                    setDraftInvoiceSortOrder(event.target.value)
                  }
                  className="w-full bg-white border border-gray-300 px-3 py-2.5 text-sm text-gray-800 outline-none focus:border-[#0067b8] focus:ring-1 focus:ring-[#0067b8]"
                >
                  <option value="oldest">Terlama ke terbaru</option>
                  <option value="newest">Terbaru ke terlama</option>
                </select>
              </label>

              <label className="flex items-center gap-3 text-sm font-semibold text-gray-700">
                <input
                  type="checkbox"
                  checked={draftWatermarkEnabled}
                  onChange={(event) => {
                    setDraftWatermarkEnabled(event.target.checked);
                    setWatermarkError("");
                  }}
                  className="h-4 w-4 accent-[#0067b8]"
                />
                Gunakan watermark
              </label>

              <label className="block">
                <span className="block text-xs font-semibold text-gray-600 mb-1">
                  Teks watermark
                </span>
                <input
                  type="text"
                  value={draftWatermarkText}
                  maxLength={30}
                  disabled={!draftWatermarkEnabled}
                  onChange={(event) => {
                    setDraftWatermarkText(event.target.value);
                    setWatermarkError("");
                  }}
                  autoFocus
                  className="w-full border border-gray-300 px-3 py-2.5 text-sm uppercase outline-none focus:border-[#0067b8] focus:ring-1 focus:ring-[#0067b8] disabled:bg-gray-100 disabled:text-gray-400"
                  placeholder="SALINAN"
                />
              </label>

              <label className="block">
                <span className="flex items-center justify-between gap-3 text-xs font-semibold text-gray-600 mb-2">
                  <span>Ukuran watermark</span>
                  <span className="text-[#0067b8] tabular-nums">
                    {draftWatermarkSize} mm
                  </span>
                </span>
                <input
                  type="range"
                  min="10"
                  max="40"
                  step="1"
                  value={draftWatermarkSize}
                  disabled={!draftWatermarkEnabled}
                  onChange={(event) =>
                    setDraftWatermarkSize(Number(event.target.value))
                  }
                  className="w-full accent-[#0067b8] disabled:opacity-40"
                  aria-label="Ukuran watermark dalam milimeter"
                />
                <span className="mt-1 flex justify-between text-[10px] text-gray-400">
                  <span>10 mm</span>
                  <span>40 mm</span>
                </span>
              </label>

              <label className="block">
                <span className="flex items-center justify-between gap-3 text-xs font-semibold text-gray-600 mb-2">
                  <span>Opacity watermark</span>
                  <span className="text-[#0067b8] tabular-nums">
                    {draftWatermarkOpacity}%
                  </span>
                </span>
                <input
                  type="range"
                  min="5"
                  max="100"
                  step="5"
                  value={draftWatermarkOpacity}
                  disabled={!draftWatermarkEnabled}
                  onChange={(event) =>
                    setDraftWatermarkOpacity(Number(event.target.value))
                  }
                  className="w-full accent-[#0067b8] disabled:opacity-40"
                  aria-label="Opacity watermark dalam persen"
                />
                <span className="mt-1 flex justify-between text-[10px] text-gray-400">
                  <span>5%</span>
                  <span>100%</span>
                </span>
              </label>

              {watermarkError && (
                <p className="text-xs font-medium text-red-700">
                  {watermarkError}
                </p>
              )}

              <div className="relative h-28 overflow-hidden border border-gray-200 bg-gray-50 flex items-center justify-center">
                <span className="text-xs text-gray-400">Contoh halaman F4</span>
                {draftWatermarkEnabled && draftWatermarkText.trim() && (
                  <span
                    aria-hidden="true"
                    className="absolute font-bold text-3xl whitespace-nowrap select-none"
                    style={{
                      color: "#6b7280",
                      opacity: draftWatermarkOpacity / 100,
                      fontSize: `${draftWatermarkSize * 1.5}px`,
                      letterSpacing: "0.15em",
                      transform: "rotate(-45deg)",
                    }}
                  >
                    {draftWatermarkText.trim()}
                  </span>
                )}
              </div>
            </div>

            <div className="border-t border-gray-200 px-5 py-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={continueWithoutWatermark}
                className="bg-white border border-gray-300 text-gray-700 px-4 py-2.5 text-sm font-semibold hover:bg-gray-50"
              >
                Tanpa Watermark
              </button>
              <button
                type="submit"
                className="bg-[#0067b8] text-white px-4 py-2.5 text-sm font-semibold hover:bg-[#005a9e]"
              >
                Terapkan
              </button>
            </div>
          </form>
        </div>
      )}
    </MobileLayout>
  );
}

/* ===============================
 * KOMPONEN TICKET KECIL (1/8 F4)
 * =============================== */
const InvoiceTicket = ({ invoice }) => {
  const isPC = invoice.invoice_no?.toUpperCase().startsWith("PC");
  const headerImageUrl = isPC
    ? import.meta.env.VITE_INVOICE_HEADER_2
    : import.meta.env.VITE_INVOICE_HEADER_1;

  // Batasi item maksimum agar footer selalu punya ruang
  const MAX_ITEMS = 5;
  const itemsToShow = invoice.sell_lines?.slice(0, MAX_ITEMS) || [];
  const hasMoreItems = (invoice.sell_lines?.length || 0) > MAX_ITEMS;

  return (
    <div className="border border-dashed border-gray-400 p-2 flex flex-col h-full bg-white leading-tight overflow-hidden relative">
      {/* HEADER TIKET */}
      <div className="flex justify-between items-start border-b border-dashed border-gray-400 pb-1 mb-1 shrink-0">
        <div className="flex flex-col w-[60%]">
          {headerImageUrl ? (
            <img
              src={headerImageUrl}
              alt="Logo"
              crossOrigin="anonymous"
              className="object-contain object-left mb-1"
              style={{ maxHeight: "60px", maxWidth: "120mm" }}
            />
          ) : (
            <span className="font-bold text-[10px] tracking-wider mb-1">
              INVOICE
            </span>
          )}
          <span className="font-bold text-[14px] leading-tight mt-0.5">
            {invoice.invoice_no}
          </span>
          <div className="text-[11px] text-gray-600 mt-0.5 flex flex-wrap gap-x-2">
            <span>{formatTanggal(invoice.transaction_date)}</span>
            <span className="text-black font-semibold ml-3">INVOICE COPY</span>
          </div>
        </div>

        <div className="text-right w-[40%] flex flex-col items-end gap-[2px]">
          <span className="font-bold text-[13px] text-black px-1 py-0.5 rounded-sm">
            {isDraftTransaction(invoice)
              ? "DRAFT"
              : getPaymentStatusText(invoice.payment_status, invoice.payment_lines)}
          </span>
          <span className="text-[12px] font-semibold text-gray-800 break-words w-full">
            {invoice.contact || "Walk-in Customer"}
          </span>
          <span className="text-[11px] text-gray-500">
            Kasir: {invoice._source_user || "-"}
          </span>
        </div>
      </div>

      {/* RINCIAN PRODUK */}
      <div className="flex-1 flex flex-col gap-[2px] mb-1 overflow-hidden">
        {itemsToShow.map((item, idx) => (
          <div
            key={idx}
            className="flex justify-between items-start text-[11px] leading-tight border-b border-gray-100 pb-[2px]"
          >
            <div className="flex-1 pr-1 font-semibold break-words">
              {item.product_name}
              {item.sell_line_note && (
                <span className="font-normal italic text-gray-500 ml-1">
                  ({item.sell_line_note})
                </span>
              )}
            </div>
            
            {/* Bagian Kanan: Menampilkan Kuantitas x Harga Satuan ATAU Total Harga */}
            <div className="text-right whitespace-nowrap text-gray-800 font-semibold pt-[1px] flex items-center gap-1.5">
              <span className="text-gray-500 font-normal">
                {Number(item.quantity)} x {formatRupiah(item.unit_price_inc_tax)}
              </span>
              <span>  </span>
              <span>{formatRupiah(Number(item.quantity) * Number(item.unit_price_inc_tax))}</span>
            </div>
          </div>
        ))}

        {hasMoreItems && (
          <div className="text-[11px] italic text-center text-gray-500 font-semibold mt-0.5">
            ... dan {invoice.sell_lines.length - MAX_ITEMS} item lainnya
          </div>
        )}
      </div>

      {/* 🔹 FOOTER TERPADU (Tanpa mb-5 agar aman dari terpotong) */}
      <div className="border-t border-dashed border-gray-400 pt-1 flex justify-between items-end shrink-0 gap-1.5 mt-auto pb-0.5">
        {/* KIRI: QR Code Bawaan Browser menggunakan QRCodeSVG */}
        <div
          style={{ width: "14mm", height: "14mm" }}
          className="bg-gray-100 shrink-0 flex items-center justify-center border border-gray-200 p-0.5"
        >
          {invoice.invoice_url ? (
            <QRCodeSVG
              value={invoice.invoice_url}
              width="100%"
              height="100%"
              level="L"
            />
          ) : (
            <span className="text-[5px] text-gray-400 text-center">No URL</span>
          )}
        </div>

        {/* TENGAH: Catatan (Diberi tanda _ jika kosong) */}
        <div
          className="flex-1 text-[9px] text-gray-600 flex flex-col justify-end gap-[1px] break-words"
          style={{ maxWidth: "43%" }}
        >
          {/* Pembayaran (Byr) */}
          <div className="leading-tight break-words">
            <span className="font-bold">Metode:</span>{" "}
            {invoice.payment_lines?.length > 0
              ? invoice.payment_lines.map((p) => p.method).join(", ")
              : "-"}
          </div>

          {/* Catatan Tambahan (Cat) */}
          <div className="leading-tight break-words">
            <span className="font-bold">Catatan:</span>{" "}
            {invoice.additional_notes && invoice.additional_notes.trim() !== ""
              ? invoice.additional_notes
              : "-"}
          </div>

          {/* Staff Note (Stf) */}
          <div className="leading-tight break-words">
            <span className="font-bold">Staff Note:</span>{" "}
            {invoice.staff_note && invoice.staff_note.trim() !== ""
              ? invoice.staff_note
              : "-"}
          </div>
        </div>

        {/* KANAN: Total */}
        <div
          className="text-[11px] flex flex-col justify-end text-right shrink-0"
          style={{ width: "38%" }}
        >
          <div className="flex justify-between mb-[1px]">
            <span className="text-left pr-1">Subtotal:</span>
            <span>{formatRupiah(invoice.total_before_tax)}</span>
          </div>
          {Number(invoice.discount_amount) > 0 && (
            <div className="flex justify-between text-gray-600 mb-[1px]">
              <span className="text-left pr-1">Disc:</span>
              <span>
                -
                {formatRupiah(
                  invoice.discount_type === "percentage"
                    ? (Number(invoice.discount_amount) / 100) *
                        Number(invoice.total_before_tax)
                    : invoice.discount_amount,
                )}
              </span>
            </div>
          )}
          {Number(invoice.tax_amount) > 0 && (
            <div className="flex justify-between text-gray-600 mb-[1px]">
              <span className="text-left pr-1">Pajak:</span>
              <span>{formatRupiah(invoice.tax_amount)}</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-[11px] border-t border-black pt-[1px] mt-[10px]">
            <span className="text-left pr-1">TOTAL:</span>
            <span>Rp {formatRupiah(invoice.final_total)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
