import { savePdf as exportPdf } from "../../../platform/files";
import { isNative } from "../../../platform/native";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import QRCode from "qrcode";
import { payrollApi, getApiError } from "../../../api/payrollApi";
import { ErrorBanner, LoadingState, primaryButton, secondaryButton } from "../components/PayrollUI";
import { buildSlipValidationUrl, formatCurrency, formatDate, formatDayCount, statusLabels, terbilangRupiah } from "../payrollUtils";

const headerLogo = import.meta.env.VITE_SLIP_HEADER_1 || import.meta.env.VITE_LOGO_1 || "";

const pdfDensityProfiles = [
  { fontScale: 1, spacingScale: 1 },
  { fontScale: 1, spacingScale: 0.82 },
  { fontScale: 0.94, spacingScale: 0.68 },
  { fontScale: 0.88, spacingScale: 0.54 },
  { fontScale: 0.8, spacingScale: 0.42 },
  { fontScale: 0.7, spacingScale: 0.3 },
  { fontScale: 0.58, spacingScale: 0.2 },
];

const pointsToMillimeters = (points, lineHeightFactor = 1) => points * lineHeightFactor * 25.4 / 72;

const imageToCompressedDataUrl = async (url, maxWidth = 1400) => {
  if (!url) return null;
  const response = await fetch(url, { mode: "cors" });
  if (!response.ok) throw new Error("Logo tidak dapat dimuat.");
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, maxWidth / image.naturalWidth);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(objectUrl);
      resolve(canvas.toDataURL("image/jpeg", 0.72));
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Logo tidak dapat diproses."));
    };
    image.src = objectUrl;
  });
};

const getAdditionRows = (slip) => {
  const total = Number(slip?.additions_total || 0);
  if (!total) return [];
  const details = (slip.addition_details || []).filter((item) => Number(item.amount) !== 0);
  if (!details.length) return [{ category: "Tambahan", amount: total, descriptions: [] }];
  const detailedTotal = details.reduce((sum, item) => sum + Number(item.amount), 0);
  if (detailedTotal < total) {
    return [...details, { category: "Tambahan lainnya", amount: total - detailedTotal, descriptions: [] }];
  }
  return details;
};

const getAttendanceSummary = (slip) => {
  const details = slip?.attendance_details || [];
  const nonAttendance = details.filter((item) => item.status !== "holiday" && Number(item.wage_fraction) < 1);
  const operationalHolidays = details.filter((item) => item.status === "holiday");
  const totalNotWorking = nonAttendance.reduce((sum, item) => sum + (1 - Number(item.wage_fraction)), 0);
  return { nonAttendance, operationalHolidays, totalNotWorking };
};

const monthEndDate = (value) => {
  if (!value) return null;
  const [year, month] = value.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
};
const formatCompactDate = (value) => {
  if (!value) return "-";
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "2-digit" })
    .format(new Date(`${value}T00:00:00`));
};
const formatAttendanceDate = (value, compact = false) => compact ? formatCompactDate(value) : formatDate(value);
const formatNonAttendanceDate = (value) => {
  const date = new Date(`${value}T00:00:00`);
  const weekday = new Intl.DateTimeFormat("id-ID", { weekday: "short" }).format(date);
  return `${weekday}, ${formatCompactDate(value)}`;
};
const formatHoliday = (value, compact = false) => {
  const date = new Date(`${value}T00:00:00`);
  const weekday = new Intl.DateTimeFormat("id-ID", { weekday: compact ? "short" : "long" }).format(date);
  return `${weekday}, ${formatAttendanceDate(value, compact)}`;
};

// Font standar jsPDF tidak konsisten menangani U+2212 dan non-breaking space
// dari Intl currency. Gunakan karakter ASCII agar kolom nominal tetap rapi.
const formatPdfCurrency = (value) => {
  const amount = Math.round(Math.abs(Number(value) || 0));
  return `Rp ${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(amount)}`;
};

const formatPdfDeduction = (value) => `-${formatPdfCurrency(value)}`;

const getDeductionRows = (slip) => {
  const breakdown = slip?.deduction_breakdown || {};
  const rows = [];
  if (Number(breakdown.cash_advance)) rows.push({ label: "Potongan kasbon", amount: breakdown.cash_advance });
  if (Number(breakdown.employee_loan)) rows.push({ label: "Cicilan utang", amount: breakdown.employee_loan });
  if (Number(breakdown.other)) rows.push({ label: "Potongan lainnya", amount: breakdown.other });
  if (!rows.length && Number(slip?.deductions_total)) rows.push({ label: "Potongan lainnya", amount: slip.deductions_total });
  return rows;
};

const receivableActionLabel = (item) => {
  if (item.transaction_type === "repayment") return item.receivable_type === "cash_advance" ? "Potongan kasbon" : "Cicilan utang";
  return item.receivable_type === "cash_advance" ? "Pencairan kasbon" : "Pencairan utang";
};

export default function PayrollSlipPrintPreview() {
  const { id } = useParams(); const navigate = useNavigate();
  const [slip, setSlip] = useState(null); const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [error, setError] = useState(""); const [zoom, setZoom] = useState(1);
  const loadData = useCallback(async () => { setLoading(true); setError(""); try { const slipResponse = await payrollApi.slips.get(id); const slipData = slipResponse.data; setSlip(slipData); const employeeResponse = await payrollApi.employees.get(slipData.employee); setEmployee(employeeResponse.data); } catch (err) { setError(getApiError(err, "Gagal memuat pratinjau slip.")); } finally { setLoading(false); } }, [id]);
  useEffect(() => { loadData(); }, [loadData]);

  const verificationUrl = buildSlipValidationUrl(slip);
  const isMonthly = slip?.slip_type === "monthly";
  const monthlyDocumentDate = isMonthly ? monthEndDate(slip?.period_start) : null;

  const savePdf = async (print = false) => {
    if (!slip) return;
    setSaving(true); setError("");
    try {
      const accentColor = isMonthly ? [29, 78, 216] : [4, 120, 87];
      const highlightFillColor = isMonthly ? [219, 234, 254] : [220, 252, 231];
      const highlightTextColor = isMonthly ? [30, 58, 138] : [20, 83, 45];
      let logoData = null;
      try {
        logoData = await imageToCompressedDataUrl(headerLogo);
      } catch {
        // Slip tetap dapat dibuat ketika logo eksternal tidak tersedia.
      }
      const qrData = await QRCode.toDataURL(verificationUrl, { margin: 0, width: 220 });
      const attendance = getAttendanceSummary(slip);
      const infoRows = [
        [isMonthly ? "Bulan" : "Tanggal", `${formatDate(slip.period_start)} s/d ${formatDate(slip.period_end)}`],
        ["Nama", `Sdr. ${slip.employee_name}`], ["ID / NIK", `${slip.employee_code} / ${slip.employee_nik || "-"}`],
        ["Alamat", employee?.address || "-"], ["Hari kerja", `${formatDayCount(slip.wage_days)} hari upah; ${formatDayCount(slip.transport_days)} hari transport`],
        ["Total tidak masuk", `${formatDayCount(attendance.totalNotWorking)} hari`],
      ];
      if (attendance.nonAttendance.length) infoRows.push(["Tidak masuk", attendance.nonAttendance.map((item) => `${formatNonAttendanceDate(item.date)} (${statusLabels[item.status] || item.status})`).join("; ")]);
      if (attendance.operationalHolidays.length) infoRows.push(["Hari libur", attendance.operationalHolidays.map((item) => formatHoliday(item.date, isMonthly)).join("; ")]);
      const amountRows = [
        ["Upah", `${formatDayCount(slip.wage_days)} hari x ${formatPdfCurrency(slip.daily_wage)}`, formatPdfCurrency(slip.base_wage)],
        ["Transport", `${formatDayCount(slip.transport_days)} hari x ${formatPdfCurrency(slip.daily_transport)}`, formatPdfCurrency(slip.transport_total)],
        ...getAdditionRows(slip).map((item) => [item.category, item.descriptions?.join("; ") || "", formatPdfCurrency(item.amount)]),
        ["Jumlah upah", "", formatPdfCurrency(slip.total_before_adjustments)],
        ...getDeductionRows(slip).map((item) => [item.label, "", formatPdfDeduction(item.amount)]),
        ["Sisa upah", "", formatPdfCurrency(slip.net_pay)],
      ];
      const highlightedAmountLabel = isMonthly ? "Jumlah upah" : "Sisa upah";

      const renderPdf = ({ fontScale, spacingScale }) => {
        const format = isMonthly ? "a5" : "a6";
        const doc = new jsPDF({ orientation: "portrait", unit: "mm", format, compress: true });
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = isMonthly ? 5 : 3;
        const lineHeightFactor = 1.05;
        const fontSize = (monthlySize, weeklySize) => (isMonthly ? monthlySize : weeklySize) * fontScale;
        const spacing = (monthlySize, weeklySize) => (isMonthly ? monthlySize : weeklySize) * spacingScale;
        const lineHeight = (size) => pointsToMillimeters(size, lineHeightFactor);
        const qrSize = Math.max(9, (isMonthly ? 15 : 12) * Math.max(fontScale, 0.75));
        const footerFontSize = fontSize(8.2, 7.2);
        const footerLineHeight = lineHeight(footerFontSize);
        const footerHeight = Math.max(qrSize, footerLineHeight * (isMonthly ? 4 : 3), isMonthly ? spacing(17, 0) : 0);
        const sectionGap = spacing(1.4, 1);
        const tableMargin = { left: margin, right: margin, bottom: margin + footerHeight + sectionGap };
        let cursor = margin;

        doc.setLineHeightFactor(lineHeightFactor);
        if (logoData) {
          const properties = doc.getImageProperties(logoData);
          const maxWidth = pageWidth - margin * 2;
          const maxHeight = spacing(24, 18);
          const ratio = properties.width / properties.height;
          const logoWidth = Math.min(maxWidth, maxHeight * ratio);
          const logoHeight = logoWidth / ratio;
          doc.addImage(logoData, "JPEG", margin, cursor, logoWidth, logoHeight, undefined, "FAST");
          cursor += logoHeight + spacing(5.5, 5.5);
        } else {
          cursor += spacing(1.5, 1.2);
        }

        const titleFontSize = fontSize(12, 10.5);
        doc.setTextColor(...accentColor); doc.setFont("helvetica", "bold"); doc.setFontSize(titleFontSize);
        doc.text(`RINCIAN PENERIMAAN UPAH HARIAN PER ${isMonthly ? "BULAN" : "MINGGU"}`, margin, cursor);
        cursor += lineHeight(titleFontSize) + spacing(0.8, 0.5);
        const referenceFontSize = fontSize(10.5, 9.5);
        doc.setFontSize(referenceFontSize);
        doc.text(`No.Ref: ${slip.document_reference}`, margin, cursor);
        cursor += lineHeight(referenceFontSize) + spacing(0.4, 0.3);
        doc.setTextColor(20, 20, 20);

        autoTable(doc, { startY: cursor, body: infoRows, theme: "plain", margin: tableMargin, styles: { fontSize: fontSize(9.4, 8.6), cellPadding: spacing(0.8, 0.55) }, columnStyles: { 0: { cellWidth: isMonthly ? 28 : 25, fontStyle: "bold" } } });
        cursor = doc.lastAutoTable.finalY + sectionGap;
        autoTable(doc, { startY: cursor, body: amountRows, theme: "grid", margin: tableMargin, styles: { fontSize: fontSize(9.6, 8.8), cellPadding: spacing(1, 0.65), textColor: [20, 20, 20], lineColor: [90, 90, 90] }, columnStyles: { 0: { fontStyle: "bold" }, 1: { textColor: [65, 65, 65] }, 2: { halign: "right", fontStyle: "bold" } }, didParseCell: (data) => { if (amountRows[data.row.index]?.[0] === highlightedAmountLabel) { data.cell.styles.fillColor = highlightFillColor; data.cell.styles.textColor = highlightTextColor; data.cell.styles.lineColor = accentColor; data.cell.styles.fontStyle = "bold"; data.cell.styles.fontSize = fontSize(10.6, 9.8); } } });
        cursor = doc.lastAutoTable.finalY + spacing(4.5, 4.5);
        const wordsFontSize = fontSize(9.5, 8.5);
        doc.setFont("helvetica", "italic"); doc.setFontSize(wordsFontSize);
        const words = doc.splitTextToSize(`(${terbilangRupiah(slip.net_pay)})`, pageWidth - margin * 2);
        doc.text(words, margin, cursor);
        cursor += words.length * lineHeight(wordsFontSize) + spacing(1, 0.8);
        if (slip.note) {
          autoTable(doc, { startY: cursor, body: [["Catatan", slip.note]], theme: "grid", margin: tableMargin, styles: { fontSize: fontSize(8.8, 7.8), cellPadding: spacing(0.75, 0.6), fillColor: [248, 248, 248], textColor: [0, 0, 0], lineColor: [120, 120, 120] }, columnStyles: { 0: { cellWidth: isMonthly ? 23 : 18, fontStyle: "bold" } } });
          cursor = doc.lastAutoTable.finalY + sectionGap;
        }
        if (slip.receivable_details?.length) {
          autoTable(doc, { startY: cursor, head: [["Jenis transaksi", "Referensi", "Tanggal", "Nominal"]], body: slip.receivable_details.map((item) => [receivableActionLabel(item), item.reference_number, formatDate(item.transaction_date), formatPdfCurrency(item.amount)]), theme: "striped", margin: tableMargin, styles: { fontSize: fontSize(8.2, 7.2), cellPadding: spacing(0.65, 0.5), textColor: [0, 0, 0], lineColor: [120, 120, 120] }, headStyles: { fillColor: [220, 220, 220], textColor: [0, 0, 0], fontStyle: "bold" }, alternateRowStyles: { fillColor: [247, 247, 247] }, columnStyles: { 3: { halign: "right" } } });
          cursor = doc.lastAutoTable.finalY + sectionGap;
        }
        if (slip.outstanding_receivables?.length) {
          autoTable(doc, { startY: cursor, head: [["Sisa kewajiban", "Referensi", "Sisa saldo"]], body: slip.outstanding_receivables.map((item) => [item.receivable_type === "cash_advance" ? "Sisa kasbon" : "Sisa utang", item.reference_number, formatPdfCurrency(item.remaining_balance)]), theme: "grid", margin: tableMargin, styles: { fontSize: fontSize(8.2, 7.2), cellPadding: spacing(0.65, 0.5), fillColor: [248, 248, 248], textColor: [0, 0, 0], lineColor: [120, 120, 120] }, headStyles: { fillColor: [220, 220, 220], textColor: [0, 0, 0], fontStyle: "bold" }, columnStyles: { 2: { halign: "right", fontStyle: "bold" } } });
          cursor = doc.lastAutoTable.finalY + spacing(2.8, 2);
        }

        if (doc.getNumberOfPages() !== 1 || cursor + footerHeight > pageHeight - margin) return { doc, fits: false };

        const qrY = cursor;
        const footerTextX = margin + qrSize + spacing(3, 2.5);
        let footerTextY = qrY + footerLineHeight * 0.8;
        doc.addImage(qrData, "PNG", margin, qrY, qrSize, qrSize);
        doc.setFont("helvetica", "normal"); doc.setFontSize(footerFontSize);
        doc.text("Scan QR untuk verifikasi", footerTextX, footerTextY);
        footerTextY += footerLineHeight;
        doc.text(`Dicetak: ${new Date().toLocaleString("id-ID").replace(/\./g, ':')}`, footerTextX, footerTextY);
        if (isMonthly) {
          footerTextY += footerLineHeight;
          doc.text(`Tanggal dokumen: ${formatDate(monthlyDocumentDate)}`, footerTextX, footerTextY);
        }
        footerTextY += footerLineHeight;
        doc.setFont("helvetica", "italic"); doc.setFontSize(fontSize(7, 6.2));
        doc.text("Diterbitkan otomatis oleh sistem; validasi melalui QR.", footerTextX, footerTextY);
        if (isMonthly) {
          const signatureX = pageWidth - margin - 19;
          doc.setFont("helvetica", "normal"); doc.setFontSize(fontSize(8.2, 7.2));
          doc.text("Penerima,", signatureX, qrY + footerLineHeight, { align: "center" });
          doc.text(`(${slip.employee_name})`, signatureX, qrY + footerHeight - spacing(0.5, 0), { align: "center" });
        }
        return { doc, fits: true };
      };

      let fittedPdf = null;
      for (const profile of pdfDensityProfiles) {
        const result = renderPdf(profile);
        if (result.fits) {
          fittedPdf = result.doc;
          break;
        }
      }
      if (!fittedPdf) throw new Error("Isi slip terlalu panjang untuk dimuat dalam satu halaman.");
      await exportPdf(fittedPdf, `${slip.document_reference}.pdf`, print);
    } catch (err) { setError(err.message || "PDF gagal dibuat. Pastikan URL logo mengizinkan CORS."); }
    finally { setSaving(false); }
  };

  return <div className="min-h-[100dvh] bg-[#2f3237] flex flex-col print:bg-white">
    <header className="bg-white border-b px-4 py-3 flex flex-wrap items-center justify-between gap-3 print:hidden"><div><h1 className="font-semibold text-gray-900">Pratinjau Slip</h1><p className="text-xs text-gray-500">{isMonthly ? "A5 Portrait · Bulanan" : "A6 Portrait · Mingguan"}</p></div><div className="flex flex-wrap gap-2"><button onClick={() => navigate(`/payroll/slips/${id}`)} className={secondaryButton}>← Detail</button><button onClick={() => setZoom((value) => Math.max(0.6, value - 0.1))} className={secondaryButton}>−</button><span className="bg-gray-100 px-3 py-2.5 text-xs font-semibold">{Math.round(zoom * 100)}%</span><button onClick={() => setZoom((value) => Math.min(1.5, value + 0.1))} className={secondaryButton}>+</button><button onClick={() => isNative ? savePdf(true) : window.print()} className={secondaryButton}>Cetak</button><button onClick={savePdf} disabled={saving} className={primaryButton}>{saving ? "Membuat PDF..." : "Simpan PDF"}</button></div></header>
    <div className="p-4 print:hidden"><ErrorBanner message={error} onRetry={loadData} /></div>
    <main className="flex-1 overflow-auto p-6 print:p-0 print:overflow-visible">{loading ? <div className="max-w-md mx-auto"><LoadingState /></div> : slip && <div className="mx-auto origin-top transition-transform print:transform-none print:!mb-0" style={{ width: isMonthly ? "148mm" : "105mm", transform: `scale(${zoom})`, marginBottom: `${Math.max(0, (zoom - 1) * 210)}mm` }}><SlipPaper key={slip.id || slip.document_reference} slip={slip} employee={employee} verificationUrl={verificationUrl} monthly={isMonthly} documentDate={monthlyDocumentDate} /></div>}</main>
  </div>;
}

function SlipPaper({ slip, employee, verificationUrl, monthly, documentDate }) {
  const attendance = getAttendanceSummary(slip);
  const additions = getAdditionRows(slip);
  const baseFontSize = monthly ? 12 : 10.75;
  const paperRef = useRef(null);
  const [fitDensity, setFitDensity] = useState(1);
  useLayoutEffect(() => {
    const paper = paperRef.current;
    if (!paper || paper.scrollHeight <= paper.clientHeight + 1 || fitDensity <= 0.25) return;
    const fitRatio = paper.clientHeight / paper.scrollHeight;
    setFitDensity((value) => Math.max(0.25, Math.min(value - 0.03, value * fitRatio * 0.98)));
  }, [fitDensity, slip, employee]);
  return <article ref={paperRef} style={{ fontSize: `${baseFontSize * fitDensity}px` }} className={`slip-paper bg-white text-black mx-auto shadow-2xl print:shadow-none ${monthly ? "slip-paper-monthly" : "slip-paper-weekly"}`}>
    {headerLogo && <img src={headerLogo} alt="Header perusahaan" className="slip-logo object-contain object-left" crossOrigin="anonymous" />}
    <div className="slip-title"><h1>RINCIAN PENERIMAAN UPAH</h1>{monthly && <strong>UPAH HARIAN · BULANAN</strong>}<span>No.Ref: {slip.document_reference}</span></div>
    <div className="slip-identity"><Info label={monthly ? "Bulan" : "Tanggal"} value={`${formatDate(slip.period_start)} s/d ${formatDate(slip.period_end)}`} /><Info label="Nama" value={`Sdr. ${slip.employee_name}`} /><Info label="ID / NIK" value={`${slip.employee_code} / ${slip.employee_nik || "-"}`} /><Info label="Alamat" value={employee?.address || "-"} /><Info label="Hari kerja" value={`${formatDayCount(slip.wage_days)} hari upah · ${formatDayCount(slip.transport_days)} hari transport`} /><Info label="Total tidak masuk" value={`${formatDayCount(attendance.totalNotWorking)} hari`} />{attendance.nonAttendance.length > 0 && <Info label="Tidak masuk" value={attendance.nonAttendance.map((item) => `${formatNonAttendanceDate(item.date)} (${statusLabels[item.status] || item.status})`).join("; ")} />}{attendance.operationalHolidays.length > 0 && <Info label="Hari libur" value={attendance.operationalHolidays.map((item) => formatHoliday(item.date, monthly)).join("; ")} />}</div>
    <table className="slip-amounts"><tbody><Amount label="Upah" formula={`${formatDayCount(slip.wage_days)} hari × ${formatCurrency(slip.daily_wage)}`} value={slip.base_wage} /><Amount label="Transport" formula={`${formatDayCount(slip.transport_days)} hari × ${formatCurrency(slip.daily_transport)}`} value={slip.transport_total} />{additions.map((item) => <Amount key={item.category} label={item.category} formula={item.descriptions?.join("; ")} value={item.amount} />)}<Amount label="Jumlah upah" value={slip.total_before_adjustments} highlight={monthly ? "monthly" : ""} />{getDeductionRows(slip).map((item) => <Amount key={item.label} label={item.label} value={item.amount} negative />)}<Amount label="Sisa upah" value={slip.net_pay} highlight={monthly ? "" : "weekly"} /></tbody></table>
    <p className="slip-words">({terbilangRupiah(slip.net_pay)})</p>
    {slip.note && <div className="slip-note"><strong>Catatan:</strong><p>{slip.note}</p></div>}
    {slip.receivable_details?.length > 0 && <div className="slip-debt"><strong>Transaksi kasbon dan utang:</strong>{slip.receivable_details.map((item, index) => <div key={`${item.receivable_id}-${index}`}><span>{index + 1}. {receivableActionLabel(item)} · {formatDate(item.transaction_date)} · {item.reference_number}</span><b>{formatCurrency(item.amount)}</b></div>)}</div>}
    {slip.outstanding_receivables?.length > 0 && <div className="slip-debt slip-debt-outstanding"><strong>Sisa kasbon / utang berjalan:</strong>{slip.outstanding_receivables.map((item) => <div key={item.id}><span>{item.receivable_type === "cash_advance" ? "Sisa kasbon" : "Sisa utang"} · {item.reference_number}</span><b>{formatCurrency(item.remaining_balance)}</b></div>)}</div>}
    <footer className="slip-footer"><div className="slip-qr"><QRCodeCanvas value={verificationUrl} /><div><strong>Scan QR untuk verifikasi.</strong><span><small>Diterbitkan otomatis oleh sistem.</small></span><small>Dicetak: {new Date().toLocaleString("id-ID").replace(/\./g, ':')}</small>{monthly && <small><b>Tanggal dokumen:</b> {formatDate(documentDate)}</small>}</div></div>{monthly && <div className="slip-sign"><span>Penerima,</span><strong>({slip.employee_name})</strong></div>}</footer>
  </article>;
}

function QRCodeCanvas({ value }) { const canvasRef = useRef(null); useEffect(() => { QRCode.toCanvas(canvasRef.current, value, { width: 180, margin: 0 }); }, [value]); return <canvas ref={canvasRef} />; }
function Info({ label, value }) { return <div><strong>{label}</strong><span>:</span><p>{value}</p></div>; }
function Amount({ label, formula, value, negative, highlight }) { return <tr className={highlight ? `highlight highlight-${highlight}` : ""}><td>{label}</td><td>{formula || ""}</td><td>{negative && Number(value) ? "− " : ""}{formatCurrency(value)}</td></tr>; }
