import { saveBlob, savePdf } from "../platform/files";
import { isNative } from "../platform/native";
import {
  getThermalPrinterSettings,
  printThermalReceipt,
  saveThermalPrinterSettings,
} from "../platform/thermalPrinter";
import { useCallback, useEffect, useState, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { posApi } from "../features/pos/api/posApi";
import PosLayout from "../layouts/PosLayout";
import TransactionDeleteDialog from "../features/pos/components/TransactionDeleteDialog";
import { paymentAliasLabel } from "../features/pos/paymentAliases";
import { isDraftTransaction } from "../features/pos/transactionStatus";
import { getPaymentStatusText } from "../utils/paymentStatus";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { QRCodeSVG } from "qrcode.react";
import { getActiveAccount } from "../utils/auth";

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

const getStatusStyle = (status) => {
  switch (status?.toLowerCase()) {
    case "paid":
      return "bg-[#dff6dd] text-[#107c10]";
    case "due":
      return "bg-[#fde7e9] text-[#a4262c]";
    case "partial":
      return "bg-[#fff4ce] text-[#797775]";
    default:
      return "bg-gray-200 text-gray-700";
  }
};

const getSafeExternalUrl = (value) => {
  if (!value) return null;

  try {
    const url = new URL(value, window.location.origin);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.href
      : null;
  } catch {
    return null;
  }
};

const buildThermalReceiptData = (invoice) => {
  const isDraft = isDraftTransaction(invoice);
  const discountValue = invoice.discount_type === "percentage"
    ? (Number(invoice.discount_amount) / 100) * Number(invoice.total_before_tax)
    : Number(invoice.discount_amount);
  const paidTotal = (invoice.payment_lines || []).reduce(
    (sum, payment) => sum + Math.max(0, Number(payment.amount) || 0),
    0,
  );
  const dueAmount = Math.max(0, Number(invoice.final_total) - paidTotal);
  return {
    title: "INVOICE",
    invoiceNo: String(invoice.invoice_no || "-"),
    date: formatTanggal(invoice.transaction_date),
    cashier: String(invoice._source_user || "-"),
    customer: String(invoice.contact || "-"),
    saleStatus: String(invoice.status || "final").toLowerCase(),
    status: isDraft
      ? "DRAFT"
      : getPaymentStatusText(invoice.payment_status, invoice.payment_lines),
    items: (invoice.sell_lines || []).map((item) => ({
      name: String(item.product_name || "Produk"),
      note: String(item.sell_line_note || ""),
      quantity: String(Number(item.quantity) || 0),
      unitPrice: formatRupiah(item.unit_price_inc_tax),
      total: formatRupiah(Number(item.quantity) * Number(item.unit_price_inc_tax)),
    })),
    subtotal: `Rp ${formatRupiah(invoice.total_before_tax)}`,
    discountLabel: invoice.discount_type === "percentage"
      ? `Diskon (${Number(invoice.discount_amount)}%)`
      : "Diskon",
    discount: discountValue > 0 ? `Rp ${formatRupiah(discountValue)}` : "",
    tax: Number(invoice.tax_amount) > 0 ? `Rp ${formatRupiah(invoice.tax_amount)}` : "",
    total: `Rp ${formatRupiah(invoice.final_total)}`,
    dueAmount: dueAmount > 0 ? `Rp ${formatRupiah(dueAmount)}` : "",
    payments: (invoice.payment_lines || []).map((payment) => ({
      method: paymentAliasLabel(
        invoice._source_user,
        payment.method,
        String(payment.method || "Pembayaran").replaceAll("_", " "),
      ).toUpperCase(),
      amount: `Rp ${formatRupiah(payment.amount)}`,
    })),
    notes: [invoice.additional_notes, invoice.staff_note].filter(Boolean).join(" | "),
    footer: "Barang terbeli tidak dapat ditukar/dikembalikan, kecuali ada perjanjian.\nBUKA 08.00-16.00 - JUMAT LIBUR\nTERIMA KASIH.\nWHATSAPP: 085725936666",
    qr: getSafeExternalUrl(invoice.invoice_url) || "",
  };
};

export default function InvoiceDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // State & Ref untuk Fitur Cetak / Pratinjau
  const [showPreview, setShowPreview] = useState(
    () => searchParams.get("preview") === "1",
  );
  const printRef = useRef(null);
  const autoPrintAttempted = useRef(false);
  const [thermalBusy, setThermalBusy] = useState(false);
  const [thermalStatus, setThermalStatus] = useState("");
  const [printerChoiceOpen, setPrinterChoiceOpen] = useState(false);
  const [printerSettings, setPrinterSettings] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const isAdmin = Boolean(getActiveAccount()?.user?.is_superuser);
  const requiresDeletePin = !isAdmin;

  useEffect(() => {
    const fetchInvoice = async () => {
      try {
        const source = searchParams.get("source");
        const res = await posApi.invoice(id, source);
        if (res.data?.success && res.data?.data) {
          setInvoice(res.data.data);
        } else {
          setError(res.data?.message || "Data transaksi tidak ditemukan.");
        }
      } catch {
        setError("Gagal menghubungi server untuk mengambil detail transaksi.");
      } finally {
        setLoading(false);
      }
    };

    fetchInvoice();
  }, [id, searchParams]);

  // ==== LOGIKA CETAK / EXPORT (Mencegah Terpotong) ====
  const getReceiptImage = async () => {
    if (!printRef.current) return null;
    const element = printRef.current;

    return await html2canvas(element, {
      scale: 2,
      useCORS: true,
      allowTaint: false,
      backgroundColor: "#ffffff",
      width: element.offsetWidth,
      height: element.scrollHeight,
      windowHeight: element.scrollHeight,
    });
  };

  const getThermalReceiptData = useCallback(async () => {
    const receipt = buildThermalReceiptData(invoice);
    const header = printRef.current?.querySelector("[data-thermal-header]");
    if (header) {
      const headerCanvas = await html2canvas(header, {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        backgroundColor: "#ffffff",
      });
      receipt.headerImage = headerCanvas.toDataURL("image/png");
    }
    return receipt;
  }, [invoice]);

  const handleDownloadImage = async () => {
    const canvas = await getReceiptImage();
    if (!canvas) return;
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (blob) await saveBlob(blob, `Nota-${invoice.invoice_no}.png`);
  };

  const handleDelete = async ({ reason, pin }) => {
    setDeleteBusy(true);
    setDeleteError("");
    try {
      await posApi.remove(invoice.id, reason, pin);
      navigate("/transactions", { replace: true });
    } catch (deleteError) {
      const detail = deleteError.response?.data?.detail;
      setDeleteError(typeof detail === "string" ? detail : detail?.message || deleteError.message || "Transaksi gagal dihapus.");
    } finally {
      setDeleteBusy(false);
    }
  };

  const handleDownloadPDF = async (print = false) => {
    const canvas = await getReceiptImage();
    if (!canvas) return;

    // 🔹 Ubah dari PNG ke JPEG dengan kualitas 0.75 agar file jauh lebih kecil
    const imgData = canvas.toDataURL("image/jpeg", 0.75);
    const pdfWidth = 105;
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: [pdfWidth, pdfHeight],
      compress: true, // 🔹 Aktifkan kompresi bawaan jsPDF
    });

    // 🔹 Gunakan parameter "JPEG" pada addImage
    pdf.addImage(imgData, "JPEG", 0, 0, pdfWidth, pdfHeight);
    await savePdf(pdf, `Nota-${invoice.invoice_no}.pdf`, print);
  };

  const requestPrint = async () => {
    if (!isNative) {
      await handlePrint();
      return;
    }
    setThermalStatus("");
    try {
      setPrinterSettings(await getThermalPrinterSettings());
      setPrinterChoiceOpen(true);
    } catch (printError) {
      setThermalStatus(printError.message || "Pengaturan printer tidak dapat dibaca.");
    }
  };

  const handlePrint = async (mode) => {
    if (isNative) {
      setThermalBusy(true);
      setThermalStatus("");
      try {
        const currentSettings = printerSettings || await getThermalPrinterSettings();
        const selectedMode = mode || currentSettings.mode;
        if (selectedMode === "lan" && !currentSettings.lanHost?.trim()) throw new Error("Alamat printer LAN/WiFi belum diatur.");
        if (selectedMode === "bluetooth" && !currentSettings.bluetoothAddress?.trim()) throw new Error("Printer Bluetooth belum dipilih di Pengaturan Printer.");
        await saveThermalPrinterSettings({ ...currentSettings, mode: selectedMode });
        setPrinterChoiceOpen(false);
        await printThermalReceipt(await getThermalReceiptData());
        setThermalStatus(`Nota berhasil dikirim melalui ${selectedMode === "lan" ? "LAN/WiFi" : "Bluetooth"}.`);
      } catch (printError) {
        setThermalStatus(printError.message || "Printer thermal tidak dapat dihubungi.");
        throw printError;
      } finally {
        setThermalBusy(false);
      }
      return;
    }
    const canvas = await getReceiptImage();
    if (!canvas) return;

    const imgData = canvas.toDataURL("image/png");
    const heightInMm = Math.ceil((canvas.height * 105) / canvas.width);
    const printWindow = window.open("", "_blank");

    if (!printWindow) {
      setError("Jendela cetak diblokir oleh browser. Izinkan pop-up lalu coba kembali.");
      return;
    }

    // Bangun dokumen cetak dengan DOM API. Data invoice tidak pernah diparsing
    // sebagai HTML sehingga nomor invoice tidak dapat menjadi stored XSS.
    printWindow.opener = null;
    printWindow.document.title = `Print Nota - ${String(invoice.invoice_no ?? "")}`;
    printWindow.document.documentElement.lang = "id";

    const style = printWindow.document.createElement("style");
    style.textContent = `
      body { margin: 0; display: flex; justify-content: center; background: #fff; }
      img { width: 105mm; height: auto; display: block; }
      @media print {
        @page { margin: 0; size: 105mm ${heightInMm + 5}mm; }
        body { margin: 0; }
      }
    `;

    const receiptImage = printWindow.document.createElement("img");
    receiptImage.alt = "Nota transaksi";
    receiptImage.addEventListener(
      "load",
      () => {
        printWindow.focus();
        printWindow.print();
        printWindow.close();
      },
      { once: true },
    );
    receiptImage.src = imgData;

    printWindow.document.head.appendChild(style);
    printWindow.document.body.replaceChildren(receiptImage);
  };

  useEffect(() => {
    if (
      !isNative ||
      !invoice ||
      isDraftTransaction(invoice) ||
      !showPreview ||
      searchParams.get("autoprint") !== "1" ||
      autoPrintAttempted.current
    ) return undefined;

    autoPrintAttempted.current = true;
    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        const settings = await getThermalPrinterSettings();
        if (!settings.autoPrint || !active) return;
        setPrinterSettings(settings);
        setThermalStatus("Pilih koneksi printer untuk melanjutkan cetak otomatis.");
        setPrinterChoiceOpen(true);
      } catch (printError) {
        if (active) setThermalStatus(printError.message || "Cetak otomatis gagal. Gunakan tombol cetak ulang.");
      } finally {
        if (active) setThermalBusy(false);
      }
    }, 700);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [getThermalReceiptData, invoice, searchParams, showPreview]);

  if (loading) {
    return (
      <PosLayout title="Detail Transaksi">
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-[#0067b8] border-t-transparent rounded-full animate-spin"></div>
        </div>
      </PosLayout>
    );
  }

  if (error || !invoice) {
    return (
      <PosLayout title="Detail Transaksi">
        <div className="p-4">
          <div className="bg-[#fde7e9] text-[#a4262c] border border-[#a4262c] p-4 text-sm font-medium">
            {error || "Data tidak tersedia."}
          </div>
          <button
            onClick={() => navigate(-1)}
            className="mt-4 text-sm text-[#0067b8] hover:underline"
          >
            ← Kembali ke Daftar
          </button>
        </div>
      </PosLayout>
    );
  }

  const isDraft = isDraftTransaction(invoice);
  // Dibundel bersama aplikasi agar header nota selalu tersedia saat offline.
  const headerImageUrl = "/header-asas.jpg";
  const safeInvoiceUrl = getSafeExternalUrl(invoice.invoice_url);

  return (
    <PosLayout title="Detail Invoice">
      <div className="pb-20">
        <div className="flex items-center justify-between bg-white px-4 py-3 border-b border-gray-200">
          <button
            onClick={() => navigate(-1)}
            className="text-sm font-semibold text-[#0067b8] hover:underline flex items-center gap-1"
          >
            <span>←</span> Kembali
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const source = invoice._source_user || searchParams.get("source");
                navigate(`/pos/${invoice.id}/edit${source ? `?source=${encodeURIComponent(source)}` : ""}`);
              }}
              className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-[#0067b8] transition hover:bg-blue-100"
            >
              Edit di POS
            </button>
            <button
              type="button"
              disabled={deleteBusy}
              onClick={() => { setDeleteError(""); setDeleteOpen(true); }}
              className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 transition hover:bg-red-100 disabled:opacity-50"
            >
              {deleteBusy ? "Menghapus…" : "Hapus"}
            </button>
          </div>
        </div>

        {/* HEADER INVOICE */}
        <div className="bg-white p-5 border-b border-gray-200 shadow-sm relative">
          <div className="absolute top-0 left-0 w-full h-1 bg-[#0067b8]"></div>
          <div className="flex justify-between items-start mb-4 mt-2">
            <div>
              <h1 className="text-xl font-bold text-gray-800">
                {invoice.invoice_no}
              </h1>
              <p className="text-xs text-gray-500 mt-1">
                Transaction ID: {invoice.id}
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              {isDraft && <span className="border border-amber-300 bg-amber-100 px-3 py-1 text-xs font-black uppercase tracking-wider text-amber-900">DRAFT</span>}
              <div
                className={`px-3 py-1 text-xs font-bold uppercase tracking-wider ${getStatusStyle(invoice.payment_status)}`}
              >
                {invoice.payment_status}
              </div>
            </div>
          </div>

          {isDraft && (
            <div className="mb-4 border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <strong className="block font-black">Transaksi masih berupa draft</strong>
              <span className="text-xs">Dokumen ini bersifat sementara dan belum merupakan transaksi final.</span>
            </div>
          )}

          {invoice.mark_reason && (
            <div className="mb-4 border-2 border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              <strong className="block font-black">⚑ Transaksi ditandai</strong>
              <span className="text-xs font-semibold">{invoice.mark_reason}</span>
              {invoice.marked_at && (
                <span className="mt-1 block text-[10px] text-amber-800">
                  {formatTanggal(invoice.marked_at)}
                </span>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 text-sm mt-4 p-4 bg-[#f3f2f1] border border-gray-200">
            <div>
              <span className="block text-[10px] uppercase text-gray-500 font-semibold mb-1">
                Tanggal Transaksi
              </span>
              <span className="font-semibold text-gray-800">
                {formatTanggal(invoice.transaction_date)}
              </span>
            </div>
            <div>
              <span className="block text-[10px] uppercase text-gray-500 font-semibold mb-1">
                Lokasi
              </span>
              <span className="font-semibold text-gray-800">
                {invoice.location_name || "-"}
              </span>
            </div>
            <div>
              <span className="block text-[10px] uppercase text-gray-500 font-semibold mb-1">
                Customer / Klien
              </span>
              <span className="font-semibold text-gray-800">
                {invoice.contact || "-"}
              </span>
            </div>
            <div>
              <span className="block text-[10px] uppercase text-gray-500 font-semibold mb-1">
                Diinput Oleh
              </span>
              <span className="font-semibold text-gray-800">
                {invoice._source_user || "-"}
              </span>
            </div>
          </div>
        </div>

        {/* RINCIAN PRODUK */}
        <div className="bg-white mt-4 border-y border-gray-200 shadow-sm">
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
            <h2 className="text-sm font-bold text-gray-800">
              Rincian Pembelian
            </h2>
          </div>
          <div className="px-4 py-2">
            {invoice.sell_lines?.length > 0 ? (
              <table className="w-full text-left text-sm mt-2">
                <thead>
                  <tr className="border-b-2 border-gray-300 text-gray-600 text-xs">
                    <th className="py-2 font-semibold">Produk</th>
                    <th className="py-2 font-semibold text-right">Qty</th>
                    <th className="py-2 font-semibold text-right">Harga</th>
                    <th className="py-2 font-semibold text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.sell_lines.map((item, idx) => (
                    <tr
                      key={item.id || idx}
                      className="border-b border-dashed border-gray-200 last:border-0 text-xs"
                    >
                      <td className="py-3 pr-2 font-medium text-gray-800">
                        {item.product_name}
                        {(item.product_sku || item.sell_line_note) && (
                          <span className="block text-[10px] text-gray-400 font-normal">
                            {[
                              item.product_sku,
                              item.sell_line_note
                                ? `(${item.sell_line_note})`
                                : null,
                            ]
                              .filter(Boolean)
                              .join(" ")}
                          </span>
                        )}
                      </td>
                      <td className="py-3 text-right text-gray-600">
                        {Number(item.quantity)}
                      </td>
                      <td className="py-3 text-right text-gray-600">
                        {formatRupiah(item.unit_price_inc_tax)}
                      </td>
                      <td className="py-3 text-right font-semibold text-gray-800">
                        {formatRupiah(
                          Number(item.quantity) *
                            Number(item.unit_price_inc_tax),
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-gray-500 py-4 text-center">
                Tidak ada detail item
              </p>
            )}
          </div>
        </div>

        {/* SUMMARY / RINGKASAN BIAYA */}
        <div className="bg-white mt-4 p-4 border-y border-gray-200 shadow-sm">
          <div className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between items-center text-gray-600">
              <span>Subtotal</span>
              <span>Rp {formatRupiah(invoice.total_before_tax)}</span>
            </div>
            {Number(invoice.discount_amount) > 0 && (
              <div className="flex justify-between items-center text-[#a4262c]">
                <span>
                  Diskon Transaksi{" "}
                  {invoice.discount_type === "percentage"
                    ? `(${Number(invoice.discount_amount)}%)`
                    : ""}
                </span>
                <span>
                  - Rp{" "}
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
              <div className="flex justify-between items-center text-gray-600">
                <span>Pajak (Tax)</span>
                <span>Rp {formatRupiah(invoice.tax_amount)}</span>
              </div>
            )}
            <hr className="my-1 border-gray-200" />
            <div className="flex justify-between items-center text-lg font-bold text-[#0067b8]">
              <span>Total</span>
              <span>Rp {formatRupiah(invoice.final_total)}</span>
            </div>

            <div className="mt-3 pt-3 border-t border-dashed border-gray-200 flex flex-col gap-2 text-xs text-gray-600">
              <div>
                <span className="font-semibold text-gray-700 block mb-0.5">
                  Catatan Tambahan:
                </span>
                <span>{invoice.additional_notes || "-"}</span>
              </div>
              <div>
                <span className="font-semibold text-gray-700 block mb-0.5">
                  Catatan Staf:
                </span>
                <span>{invoice.staff_note || "-"}</span>
              </div>
            </div>
          </div>
        </div>

        {/* LOG PEMBAYARAN */}
        {invoice.payment_lines?.length > 0 && (
          <div className="bg-white mt-4 border-y border-gray-200 shadow-sm">
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
              <h2 className="text-sm font-bold text-gray-800">
                Riwayat Pembayaran
              </h2>
            </div>
            <div className="px-4 py-2">
              <ul className="space-y-3 mt-2">
                {invoice.payment_lines.map((pay) => (
                  <li
                    key={pay.id}
                    className="flex justify-between items-center text-xs border-b border-dashed border-gray-200 pb-3 last:border-0"
                  >
                    <div>
                      <p className="font-semibold text-gray-700 capitalize">
                        {paymentAliasLabel(invoice._source_user, pay.method)}{" "}
                        <span className="text-[10px] text-gray-400 font-normal">
                          ({pay.payment_ref_no || "No Ref"})
                        </span>
                      </p>
                      <p className="text-[10px] text-gray-500 mt-0.5">
                        {formatTanggal(pay.paid_on)}
                      </p>
                    </div>
                    <div className="font-bold text-[#107c10]">
                      Rp {formatRupiah(pay.amount)}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* VALIDASI INVOICE / QR CODE */}
        {invoice.invoice_url && (
          <div className="bg-white mt-4 border-y border-gray-200 shadow-sm">
            {/* HEADER */}
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
              <p className="text-xs font-semibold text-gray-700">
                Validasi Invoice
              </p>
            </div>

            {/* QR CODE */}
            <div className="px-4 py-3 flex flex-col items-center justify-center">
              <QRCodeSVG
                value={invoice.invoice_url}
                className="w-20 h-20"
                level="M"
                includeMargin={false}
              />

              <p className="mt-2 text-[10px] text-gray-500 text-center">
                Scan QR Code untuk memvalidasi invoice
              </p>
            </div>
          </div>
        )}

        {/* TOMBOL TINDAKAN */}
        <div className="px-4 mt-6 flex flex-col gap-3">
          <button
            onClick={() => setShowPreview(true)}
            className="w-full text-center py-2.5 bg-[#0067b8] text-white font-semibold text-sm shadow hover:bg-[#005a9e] transition-colors"
          >
            Pratinjau & Cetak Nota
          </button>
          {safeInvoiceUrl && (
            <a
              href={safeInvoiceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full text-center py-2.5 bg-[#f3f2f1] border border-gray-300 text-gray-700 font-semibold text-sm hover:bg-gray-200 transition-colors"
            >
              Buka Tautan Invoice Asli (POS)
            </a>
          )}
        </div>
      </div>

      {/* 🔹 FIX: MODAL PRATINJAU NOTA (RESPONSIVE SCROLL) */}
      {showPreview && (
        <div className="fixed inset-0 z-[100] bg-black/60 flex flex-col justify-center items-center p-2 sm:p-4">
          {/* Main Modal Wrapper (Membatasi tinggi max dan bentuk modal) */}
          <div className="bg-white w-full max-w-lg max-h-[90dvh] flex flex-col shadow-xl rounded-sm overflow-hidden">
            {/* Modal Header */}
            <div className="bg-[#f3f2f1] w-full px-4 py-3 flex justify-between items-center border-b border-gray-300 z-10">
              <h3 className="font-bold text-gray-800 text-sm">
                Pratinjau Struk (A6)
              </h3>
              <button
                onClick={() => setShowPreview(false)}
                className="text-gray-500 hover:text-red-600 font-bold text-xl leading-none"
              >
                ×
              </button>
            </div>

            {/* Area Konten Scrollable (Bisa Scroll Kanan-Kiri-Atas-Bawah tanpa potong bagian kiri) */}
            <div className="flex-1 overflow-auto bg-gray-200 p-4">
              {/* Wrapper ini memastikan posisi tengah tercapai JIKA RUANG CUKUP, namun aman (tidak terpotong) JIKA RUANG SEMPIT */}
              <div className="mx-auto w-max shadow-md">
                {/* CONTAINER CETAK */}
                <div
                  ref={printRef}
                  className="bg-white text-black p-4 flex flex-col"
                  style={{
                    width: "105mm", // Lebar Default Kertas
                    height: "max-content",
                    fontFamily: '"Courier New", Courier, monospace',
                    fontSize: "13px",
                    lineHeight: "1.2",
                  }}
                >
                  {headerImageUrl && (
                    <img
                      data-thermal-header
                      src={headerImageUrl}
                      alt="Header"
                      crossOrigin="anonymous"
                      className="w-full object-contain mb-3"
                      style={{ maxHeight: "75px" }}
                    />
                  )}

                  {isDraft && (
                    <div className="mb-2 border-y-2 border-black py-2 text-center">
                      <div className="text-[16px] font-black tracking-[0.12em]">DRAFT — BELUM FINAL</div>
                      <div className="mt-0.5 text-[11px] font-bold">Dokumen sementara dan belum merupakan nota transaksi final.</div>
                    </div>
                  )}

                  {/* INFO TRANSAKSI */}
                  <div className="border-b border-dashed border-black pb-2 mb-2">
                    <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-2 gap-y-0.5">
                      <span>Nomor nota:</span>
                      <span className="text-right font-bold">{invoice.invoice_no}</span>
                      <span>Tanggal:</span>
                      <span className="text-right">{formatTanggal(invoice.transaction_date)}</span>
                      <span>Kasir:</span>
                      <span className="text-right">{invoice._source_user || "-"}</span>
                      <span>Customer:</span>
                      <span className="break-words text-right">{invoice.contact || "-"}</span>
                    </div>
                  </div>

                  {/* DAFTAR ITEM */}
                  <div className="border-b border-dashed border-black pb-2 mb-2">
                    {invoice.sell_lines?.map((item, idx) => (
                      <div key={idx} className="mb-2">
                        <div className="font-bold">
                          {idx + 1}. {item.product_name}
                          {item.sell_line_note && <span className="font-normal"> ({item.sell_line_note})</span>}
                        </div>
                        <div className="mt-0.5 flex justify-between pl-5">
                          <span>
                            {Number(item.quantity)} x{" "}
                            {formatRupiah(item.unit_price_inc_tax)}
                          </span>
                          <span className="font-bold">
                            {formatRupiah(
                              Number(item.quantity) *
                                Number(item.unit_price_inc_tax),
                            )}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* TOTAL */}
                  <div className="border-b border-dashed border-black pb-2 mb-2">
                    <div className="flex justify-between">
                      <span>Subtotal</span>
                      <span>Rp {formatRupiah(invoice.total_before_tax)}</span>
                    </div>
                    {Number(invoice.discount_amount) > 0 && (
                      <div className="flex justify-between">
                        <span>
                          Diskon{" "}
                          {invoice.discount_type === "percentage"
                            ? `(${Number(invoice.discount_amount)}%)`
                            : ""}
                        </span>
                        <span>
                          - Rp {" "}
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
                      <div className="flex justify-between">
                        <span>Pajak (Tax)</span>
                        <span>Rp {formatRupiah(invoice.tax_amount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold text-[13px] mt-1 pt-1 border-t border-dashed border-black">
                      <span className="tracking-[0.08em]">TOTAL</span>
                      <span>Rp {formatRupiah(invoice.final_total)}</span>
                    </div>
                  </div>

                  {/* Rincian Pembayaran */}
                  <div className="border-b border-dashed border-black pb-2 mb-2 text-[12px]">
                      <div className="mb-2 py-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="font-bold">PEMBAYARAN</span>
                          <span className="whitespace-nowrap text-[15px] font-black tracking-[0.12em]">---{isDraft ? "DRAFT" : getPaymentStatusText(invoice.payment_status, invoice.payment_lines)}---</span>
                        </div>
                        {Math.max(0, Number(invoice.final_total) - (invoice.payment_lines || []).reduce((sum, payment) => sum + Math.max(0, Number(payment.amount) || 0), 0)) > 0 && (
                          <span className="mt-0.5 block text-right text-[12px] font-black">Kekurangan bayar: Rp {formatRupiah(Math.max(0, Number(invoice.final_total) - (invoice.payment_lines || []).reduce((sum, payment) => sum + Math.max(0, Number(payment.amount) || 0), 0)))}</span>
                        )}
                      </div>
                      {invoice.payment_lines?.length > 0 && <>
                        {invoice.payment_lines.map((pay) => (
                          <div key={pay.id} className="mb-1">
                            <div className="grid grid-cols-[90px_minmax(0,1fr)] font-bold text-[12px]"><span>{paymentAliasLabel(invoice._source_user, pay.method)}</span><span>- Rp {formatRupiah(pay.amount)}</span></div>
                            <div className="text-[11px] text-gray-700">{formatTanggal(pay.paid_on)}</div>
                          </div>
                        ))}</>}
                    </div>

                  {/* CATATAN */}
                  <div className="flex flex-col gap-0.5 border-b border-dashed border-black pb-2 mb-2 text-[12px]">
                    <div>
                      <span className="font-bold">Catatan Tambahan:</span>{" "}
                      {invoice.additional_notes || "-"}
                    </div>
                    <div>
                      <span className="font-bold">Catatan Staf:</span>{" "}
                      {invoice.staff_note || "-"}
                    </div>
                  </div>

                  {/* FOOTER */}
                  <div
                    className="flex items-end justify-between w-full"
                    style={{
                      fontFamily: "'Book Antiqua', Palatino, serif",
                    }}
                  >
                    {/* FOOTER TEXT */}
                    <div
                      className="min-w-0 flex-1 text-left"
                      style={{
                        lineHeight: 1,
                      }}
                    >
                      <p
                        className="m-0"
                        style={{
                          textAlign: "left",
                          fontSize: "9pt",
                        }}
                      >
                        <em>
                          <strong>
                            Barang terbeli tidak dapat ditukar/
                            <br />
                            dikembalikan, kecuali ada perjanjian.
                          </strong>
                          <br />
                          BUKA PUKUL 08.00-16.00
                          <br />
                          HARI JUMAT LIBUR.
                          <br />
                          TERIMA KASIH.
                          <br />
                          <span style={{ fontSize: "12pt", fontWeight: 700 }}>
                            WHATSAPP: 085725936666
                          </span>
                        </em>
                      </p>
                    </div>
                    {/* QR CODE - SEBELAH KANAN */}
                    {invoice.invoice_url && (
                      <div className="shrink-0">
                        <QRCodeSVG
                          value={invoice.invoice_url}
                          size={48}
                          level="M"
                          includeMargin={false}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer / Action Buttons */}
            <div className="bg-[#f3f2f1] w-full px-4 py-3 flex flex-wrap justify-between gap-2 border-t border-gray-300 z-10">
              {isNative && thermalStatus && (
                <p className={`w-full text-center text-xs font-semibold ${thermalStatus.toLowerCase().includes("gagal") || thermalStatus.toLowerCase().includes("tidak") ? "text-red-700" : "text-emerald-700"}`}>{thermalStatus}</p>
              )}
              {isAdmin && <button
                onClick={() => handleDownloadImage().catch((err) => setError(err.message || "Dokumen gagal diproses."))}
                className="flex-1 py-2 text-xs font-semibold bg-green-100 text-green-700 border border-green-300 hover:bg-green-200"
              >
                Simpan Gambar
              </button>}
              {isAdmin && <button
                onClick={() => handleDownloadPDF().catch((err) => setError(err.message || "Dokumen gagal diproses."))}
                className="flex-1 py-2 text-xs font-semibold bg-red-100 text-red-700 border border-red-300 hover:bg-red-200"
              >
                Simpan PDF
              </button>}
              <button
                onClick={() => requestPrint().catch(() => {})}
                disabled={thermalBusy}
                className="flex-1 py-2 text-xs font-semibold bg-[#0067b8] text-white hover:bg-[#005a9e] disabled:opacity-50"
              >
                {thermalBusy ? "Mencetak…" : isNative ? "Cetak Thermal" : "Cetak (Print)"}
              </button>
            </div>
          </div>
        </div>
      )}

      {printerChoiceOpen && isNative && (
        <div className="fixed inset-0 z-[130] flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !thermalBusy) setPrinterChoiceOpen(false); }}>
          <section className="w-full max-w-md rounded-t-[28px] border border-white/70 bg-white/95 p-5 shadow-2xl backdrop-blur-2xl sm:rounded-[28px]">
            <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-600">Konfirmasi cetak</p><h2 className="mt-1 text-xl font-black text-slate-900">Pilih koneksi printer</h2><p className="mt-1 text-xs text-slate-500">Nota {invoice.invoice_no} akan dikirim ke printer yang dipilih.</p></div><button type="button" disabled={thermalBusy} onClick={() => setPrinterChoiceOpen(false)} className="h-9 w-9 rounded-full bg-slate-100 text-xl font-bold text-slate-500">×</button></div>
            <div className="mt-5 grid gap-3">
              <button type="button" disabled={thermalBusy || !printerSettings?.lanHost} onClick={() => handlePrint("lan").catch(() => {})} className="flex items-center justify-between rounded-2xl border border-sky-200 bg-sky-50 p-4 text-left disabled:opacity-40"><span><strong className="block text-sm text-sky-900">LAN / WiFi</strong><span className="mt-1 block text-xs text-sky-700">{printerSettings?.lanHost || "Belum diatur"}:{printerSettings?.lanPort || 9100}</span></span><span className="text-xl">›</span></button>
              <button type="button" disabled={thermalBusy || !printerSettings?.bluetoothAddress} onClick={() => handlePrint("bluetooth").catch(() => {})} className="flex items-center justify-between rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-left disabled:opacity-40"><span><strong className="block text-sm text-indigo-900">Bluetooth</strong><span className="mt-1 block text-xs text-indigo-700">{printerSettings?.bluetoothName || printerSettings?.bluetoothAddress || "Belum dipilih"}</span></span><span className="text-xl">›</span></button>
            </div>
            <button type="button" onClick={() => navigate("/settings/printer")} className="mt-4 w-full rounded-xl px-3 py-2 text-xs font-bold text-slate-500">Buka pengaturan printer</button>
          </section>
        </div>
      )}

      {deleteOpen && <TransactionDeleteDialog sale={invoice} requiresPin={requiresDeletePin} busy={deleteBusy} error={deleteError} onClose={() => { if (!deleteBusy) setDeleteOpen(false); }} onConfirm={handleDelete} />}

    </PosLayout>
  );
}
