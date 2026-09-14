import { isNative, takeReceiptPhoto } from "../platform/native";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useParams } from "react-router-dom";
import api from "../api/axios";
import { getApiError, payrollApi } from "../api/payrollApi";
import MobileLayout from "../layouts/MobileLayout";
import ConfirmModal from "../components/ConfirmModal";
import ErrorAlert from "../components/ErrorAlert";
import imageCompression from "browser-image-compression";

import ReactCrop, { centerCrop, makeAspectCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import ReceiptImage from "../components/ReceiptImage";

import QRCode from "qrcode";
import { buildSlipValidationUrl, formatCurrency, formatDate, formatDayCount, statusLabels, terbilangRupiah } from "../features/payroll/payrollUtils";

/* ===============================
   HELPER TANGGAL & ANGKA
   =============================== */
const formatNumber = (v) =>
  v.replace(/\D/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, ".");

const unformatNumber = (v) => v.replace(/\./g, "");

const daysList = Array.from({ length: 31 }, (_, i) =>
  String(i + 1).padStart(2, "0"),
);

const monthsList = [
  { value: "01", label: "Januari" },
  { value: "02", label: "Februari" },
  { value: "03", label: "Maret" },
  { value: "04", label: "April" },
  { value: "05", label: "Mei" },
  { value: "06", label: "Juni" },
  { value: "07", label: "Juli" },
  { value: "08", label: "Agustus" },
  { value: "09", label: "September" },
  { value: "10", label: "Oktober" },
  { value: "11", label: "November" },
  { value: "12", label: "Desember" },
];

const currentYearNum = new Date().getFullYear();
const yearsList = Array.from({ length: 8 }, (_, i) =>
  String(currentYearNum - 5 + i),
);

const generateTransactionCode = (prefix, date, existing = []) => {
  if (!prefix || !date) return "";

  const [year, month] = date.split("-");
  if (!year || !month) return "";

  const mm = month.padStart(2, "0");
  const yy = year.slice(2);
  const base = `${prefix}${mm}${yy}`;

  const last =
    existing
      .filter((c) => c.startsWith(base))
      .map((c) => parseInt(c.replace(base, ""), 10))
      .filter(Number.isFinite)
      .sort((a, b) => b - a)[0] || 0;

  return `${base}${String(last + 1).padStart(3, "0")}`;
};

/* ===============================
   IMAGE EDITOR HELPERS
   =============================== */
const DEFAULT_IMAGE_SETTINGS = {
  rotation: 0,
  brightness: 100,
  contrast: 0,
  grayscale: false,
};

const MAX_RECEIPT_FILE_SIZE = 25 * 1024 * 1024;
const RECEIPT_EXTENSIONS = /\.(jpe?g|png|webp|heic|heif)$/i;
const DEFAULT_CROP = { unit: "%", x: 3, y: 3, width: 94, height: 94 };
const DEFAULT_PERSPECTIVE_CORNERS = {
  tl: { x: 3, y: 3 },
  tr: { x: 97, y: 3 },
  br: { x: 97, y: 97 },
  bl: { x: 3, y: 97 },
};

const clonePerspectiveCorners = () =>
  Object.fromEntries(
    Object.entries(DEFAULT_PERSPECTIVE_CORNERS).map(([key, point]) => [
      key,
      { ...point },
    ]),
  );

const clamp = (value, min = 0, max = 255) =>
  Math.min(max, Math.max(min, value));

const getContrastFactor = (contrast) =>
  (259 * (contrast + 255)) / (255 * (259 - contrast));

const renderEditedCanvas = (source, settings, maxDimension = null) => {
  const naturalSourceWidth =
    source.naturalWidth || source.videoWidth || source.width;
  const naturalSourceHeight =
    source.naturalHeight || source.videoHeight || source.height;

  if (!naturalSourceWidth || !naturalSourceHeight) {
    throw new Error("Ukuran gambar tidak valid.");
  }

  const previewScale = maxDimension
    ? Math.min(1, maxDimension / Math.max(naturalSourceWidth, naturalSourceHeight))
    : 1;

  const sourceWidth = Math.max(1, Math.round(naturalSourceWidth * previewScale));
  const sourceHeight = Math.max(1, Math.round(naturalSourceHeight * previewScale));

  const normalizedRotation = ((settings.rotation % 360) + 360) % 360;
  const quarterTurn = normalizedRotation === 90 || normalizedRotation === 270;

  const canvas = document.createElement("canvas");
  canvas.width = quarterTurn ? sourceHeight : sourceWidth;
  canvas.height = quarterTurn ? sourceWidth : sourceHeight;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Browser tidak mendukung Canvas 2D.");

  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((normalizedRotation * Math.PI) / 180);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, -sourceWidth / 2, -sourceHeight / 2, sourceWidth, sourceHeight);
  ctx.restore();

  if (
    settings.brightness === 100 &&
    settings.contrast === 0 &&
    !settings.grayscale
  ) {
    return canvas;
  }

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const brightnessFactor = settings.brightness / 100;
  const contrastFactor = getContrastFactor(settings.contrast);

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    r *= brightnessFactor;
    g *= brightnessFactor;
    b *= brightnessFactor;

    r = contrastFactor * (r - 128) + 128;
    g = contrastFactor * (g - 128) + 128;
    b = contrastFactor * (b - 128) + 128;

    if (settings.grayscale) {
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      r = gray;
      g = gray;
      b = gray;
    }

    data[i] = clamp(r);
    data[i + 1] = clamp(g);
    data[i + 2] = clamp(b);
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
};

const canvasToBlob = (canvas, type = "image/jpeg", quality = 0.92) =>
  new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Gagal membuat file gambar."));
        return;
      }
      resolve(blob);
    }, type, quality);
  });

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Gambar tidak dapat dibaca."));
    img.src = src;
  });

const distanceBetween = (first, second) =>
  Math.hypot(second.x - first.x, second.y - first.y);

const renderPerspectiveCanvas = (sourceCanvas, percentCorners) => {
  const corners = Object.fromEntries(
    Object.entries(percentCorners).map(([key, point]) => [
      key,
      {
        x: (point.x / 100) * sourceCanvas.width,
        y: (point.y / 100) * sourceCanvas.height,
      },
    ]),
  );
  const outputWidth = Math.max(
    1,
    Math.round(
      (distanceBetween(corners.tl, corners.tr) +
        distanceBetween(corners.bl, corners.br)) /
        2,
    ),
  );
  const outputHeight = Math.max(
    1,
    Math.round(
      (distanceBetween(corners.tl, corners.bl) +
        distanceBetween(corners.tr, corners.br)) /
        2,
    ),
  );
  const outputScale = Math.min(1, 1800 / Math.max(outputWidth, outputHeight));
  const scaledOutputWidth = Math.max(1, Math.round(outputWidth * outputScale));
  const scaledOutputHeight = Math.max(1, Math.round(outputHeight * outputScale));
  const output = document.createElement("canvas");
  output.width = scaledOutputWidth;
  output.height = scaledOutputHeight;
  const sourceCtx = sourceCanvas.getContext("2d", { willReadFrequently: true });
  const outputCtx = output.getContext("2d");
  if (!sourceCtx || !outputCtx) {
    throw new Error("Canvas perspektif tidak tersedia.");
  }

  const sourcePixels = sourceCtx.getImageData(
    0,
    0,
    sourceCanvas.width,
    sourceCanvas.height,
  ).data;
  const outputImage = outputCtx.createImageData(
    scaledOutputWidth,
    scaledOutputHeight,
  );
  const outputPixels = outputImage.data;
  const sourceMaxX = sourceCanvas.width - 1;
  const sourceMaxY = sourceCanvas.height - 1;
  const destinationMaxX = Math.max(1, scaledOutputWidth - 1);
  const destinationMaxY = Math.max(1, scaledOutputHeight - 1);

  for (let y = 0; y < scaledOutputHeight; y += 1) {
    const v = y / destinationMaxY;
    const leftX = corners.tl.x + (corners.bl.x - corners.tl.x) * v;
    const leftY = corners.tl.y + (corners.bl.y - corners.tl.y) * v;
    const rightX = corners.tr.x + (corners.br.x - corners.tr.x) * v;
    const rightY = corners.tr.y + (corners.br.y - corners.tr.y) * v;

    for (let x = 0; x < scaledOutputWidth; x += 1) {
      const u = x / destinationMaxX;
      const sourceX = clamp(leftX + (rightX - leftX) * u, 0, sourceMaxX);
      const sourceY = clamp(leftY + (rightY - leftY) * u, 0, sourceMaxY);
      const x0 = Math.floor(sourceX);
      const y0 = Math.floor(sourceY);
      const x1 = Math.min(sourceMaxX, x0 + 1);
      const y1 = Math.min(sourceMaxY, y0 + 1);
      const fractionX = sourceX - x0;
      const fractionY = sourceY - y0;
      const topLeftOffset = (y0 * sourceCanvas.width + x0) * 4;
      const topRightOffset = (y0 * sourceCanvas.width + x1) * 4;
      const bottomLeftOffset = (y1 * sourceCanvas.width + x0) * 4;
      const bottomRightOffset = (y1 * sourceCanvas.width + x1) * 4;
      const outputOffset = (y * scaledOutputWidth + x) * 4;

      for (let channel = 0; channel < 4; channel += 1) {
        const top =
          sourcePixels[topLeftOffset + channel] * (1 - fractionX) +
          sourcePixels[topRightOffset + channel] * fractionX;
        const bottom =
          sourcePixels[bottomLeftOffset + channel] * (1 - fractionX) +
          sourcePixels[bottomRightOffset + channel] * fractionX;
        outputPixels[outputOffset + channel] =
          top * (1 - fractionY) + bottom * fractionY;
      }
    }
  }

  outputCtx.putImageData(outputImage, 0, 0);
  return output;
};

const analyzeCanvasQuality = (sourceCanvas) => {
  const sample = document.createElement("canvas");
  const scale = Math.min(1, 320 / Math.max(sourceCanvas.width, sourceCanvas.height));
  sample.width = Math.max(1, Math.round(sourceCanvas.width * scale));
  sample.height = Math.max(1, Math.round(sourceCanvas.height * scale));
  const ctx = sample.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { score: 100, warnings: [] };
  ctx.drawImage(sourceCanvas, 0, 0, sample.width, sample.height);
  const { data } = ctx.getImageData(0, 0, sample.width, sample.height);
  let luminanceTotal = 0;
  let luminanceSquaredTotal = 0;
  let edgeTotal = 0;
  let edgeSamples = 0;
  const luminances = new Float32Array(sample.width * sample.height);

  for (let index = 0; index < luminances.length; index += 1) {
    const offset = index * 4;
    const luminance =
      0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2];
    luminances[index] = luminance;
    luminanceTotal += luminance;
    luminanceSquaredTotal += luminance * luminance;
  }
  for (let y = 1; y < sample.height; y += 1) {
    for (let x = 1; x < sample.width; x += 1) {
      const index = y * sample.width + x;
      edgeTotal +=
        Math.abs(luminances[index] - luminances[index - 1]) +
        Math.abs(luminances[index] - luminances[index - sample.width]);
      edgeSamples += 2;
    }
  }

  const mean = luminanceTotal / luminances.length;
  const variance = Math.max(
    0,
    luminanceSquaredTotal / luminances.length - mean * mean,
  );
  const contrast = Math.sqrt(variance);
  const sharpness = edgeSamples ? edgeTotal / edgeSamples : 0;
  const warnings = [];
  if (mean < 52) warnings.push("Foto cukup gelap; aktifkan flash atau tambah kecerahan.");
  if (mean > 220) warnings.push("Foto terlalu terang; hindari pantulan lampu.");
  if (contrast < 24) warnings.push("Kontras dokumen rendah.");
  if (sharpness < 7) warnings.push("Foto kemungkinan buram; pegang kamera lebih stabil.");
  const score = Math.max(35, 100 - warnings.length * 18);
  return { score, warnings, mean, contrast, sharpness };
};

const drawWrappedText = (ctx, text, x, y, maxWidth, lineHeight) => {
  const words = String(text || "-").split(/\s+/);
  let line = "";
  let currentY = y;
  words.forEach((word) => {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      ctx.fillText(line, x, currentY);
      line = word;
      currentY += lineHeight;
    } else {
      line = candidate;
    }
  });
  if (line) ctx.fillText(line, x, currentY);
  return currentY;
};

const loadCanvasImage = (src) => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = reject;
  image.src = src;
});

const formatSlipHoliday = (value) => {
  const weekday = new Intl.DateTimeFormat("id-ID", { weekday: "long" })
    .format(new Date(`${value}T00:00:00`));
  return `${weekday}, ${formatDate(value)}`;
};

const receivableActionLabel = (item) => {
  if (item.transaction_type === "repayment") {
    return item.receivable_type === "cash_advance" ? "Potongan kasbon" : "Cicilan utang";
  }
  return item.receivable_type === "cash_advance" ? "Pencairan kasbon" : "Pencairan utang";
};

const createMonthlySlipReceipt = async (slip, employee, expenseDate) => {
  const canvas = document.createElement("canvas");
  canvas.width = 1240;
  canvas.height = 1754;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas tidak tersedia.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const margin = 52;
  let y = margin;
  const headerUrl = import.meta.env.VITE_SLIP_HEADER_1 || import.meta.env.VITE_LOGO_1;
  if (headerUrl) {
    try {
      const response = await fetch(headerUrl, { mode: "cors" });
      if (!response.ok) throw new Error("Header slip tidak dapat dimuat.");
      const objectUrl = URL.createObjectURL(await response.blob());
      const headerImage = await loadCanvasImage(objectUrl);
      URL.revokeObjectURL(objectUrl);
      const height = Math.min(205, (headerImage.height / headerImage.width) * (canvas.width - margin * 2));
      ctx.drawImage(headerImage, margin, y, canvas.width - margin * 2, height);
      y += height + 22;
    } catch { y += 8; }
  }

  ctx.strokeStyle = "#1d4ed8";
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(margin, y); ctx.lineTo(canvas.width - margin, y); ctx.stroke();
  y += 40;
  ctx.fillStyle = "#1e3a8a";
  ctx.font = "700 36px Arial";
  ctx.fillText("RINCIAN PENERIMAAN UPAH", margin, y);
  ctx.textAlign = "right";
  ctx.font = "700 25px Arial";
  ctx.fillText("UPAH HARIAN · BULANAN", canvas.width - margin, y - 6);
  ctx.fillText(`No.Ref: ${slip.document_reference}`, canvas.width - margin, y + 25);
  ctx.textAlign = "left";
  y += 48;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(margin, y); ctx.lineTo(canvas.width - margin, y); ctx.stroke();
  y += 35;

  const attendance = slip.attendance_details || [];
  const nonAttendance = attendance.filter(
    (item) => item.status !== "holiday" && Number(item.wage_fraction) < 1,
  );
  const operationalHolidays = attendance.filter((item) => item.status === "holiday");
  const totalNotWorking = nonAttendance
    .reduce((sum, item) => sum + Math.max(0, 1 - Number(item.wage_fraction)), 0);
  const identityRows = [
    ["Bulan", `${formatDate(slip.period_start)} s/d ${formatDate(slip.period_end)}`],
    ["Nama", `Sdr. ${slip.employee_name}`],
    ["ID / NIK", `${slip.employee_code} / ${slip.employee_nik || "-"}`],
    ["Alamat", employee?.address || "-"],
    ["Hari kerja", `${formatDayCount(slip.wage_days)} hari upah · ${formatDayCount(slip.transport_days)} hari transport`],
    ["Total tidak masuk", `${formatDayCount(totalNotWorking)} hari`],
  ];
  if (nonAttendance.length) {
    identityRows.push([
      "Tidak masuk",
      nonAttendance.map((item) => `${formatDate(item.date)} (${statusLabels[item.status] || item.status})`).join(", "),
    ]);
  }
  if (operationalHolidays.length) {
    identityRows.push([
      "Hari libur",
      operationalHolidays.map((item) => formatSlipHoliday(item.date)).join("; "),
    ]);
  }
  ctx.font = "25px Arial";
  identityRows.forEach(([label, value]) => {
    ctx.fillStyle = "#111111"; ctx.font = "700 25px Arial"; ctx.fillText(label, margin, y);
    ctx.font = "25px Arial"; ctx.fillText(":", 285, y);
    y = drawWrappedText(ctx, value, 315, y, 860, 31) + 36;
  });
  y += 8;

  const additions = (slip.addition_details || []).filter((item) => Number(item.amount));
  const breakdown = slip.deduction_breakdown || {};
  const deductions = [
    ["Potongan kasbon", breakdown.cash_advance],
    ["Cicilan utang", breakdown.employee_loan],
    ["Potongan lainnya", breakdown.other],
  ].filter(([, value]) => Number(value));
  if (!deductions.length && Number(slip.deductions_total)) deductions.push(["Potongan lainnya", slip.deductions_total]);
  const amountRows = [
    ["Upah", `${formatDayCount(slip.wage_days)} hari × ${formatCurrency(slip.daily_wage)}`, slip.base_wage, ""],
    ["Transport", `${formatDayCount(slip.transport_days)} hari × ${formatCurrency(slip.daily_transport)}`, slip.transport_total, ""],
    ...additions.map((item) => [item.category, item.descriptions?.join("; ") || "", item.amount, ""]),
    ["Total upah", "", slip.total_before_adjustments, "total-wage"],
    ...deductions.map(([label, value]) => [label, "", value, "negative"]),
    ["Sisa upah", "", slip.net_pay, ""],
  ];
  const rowHeight = 64;
  const column1 = margin + 350;
  const column2 = canvas.width - margin - 310;
  amountRows.forEach(([label, formula, value, type]) => {
    const isTotalWage = type === "total-wage";
    const currentRowHeight = isTotalWage ? 70 : rowHeight;
    const textY = y + (isTotalWage ? 45 : 41);
    if (isTotalWage) {
      ctx.fillStyle = "#dbeafe";
      ctx.fillRect(margin, y, canvas.width - margin * 2, currentRowHeight);
    }
    ctx.strokeStyle = isTotalWage ? "#1d4ed8" : "#777777";
    ctx.lineWidth = isTotalWage ? 3 : 2;
    ctx.strokeRect(margin, y, canvas.width - margin * 2, currentRowHeight);
    ctx.beginPath();
    ctx.moveTo(column1, y); ctx.lineTo(column1, y + currentRowHeight);
    ctx.moveTo(column2, y); ctx.lineTo(column2, y + currentRowHeight);
    ctx.stroke();
    ctx.fillStyle = isTotalWage ? "#1e3a8a" : "#111111";
    ctx.font = isTotalWage ? "700 29px Arial" : "700 25px Arial";
    ctx.fillText(label, margin + 15, textY);
    ctx.fillStyle = isTotalWage ? "#1e3a8a" : "#555555";
    ctx.font = isTotalWage ? "700 27px Arial" : "23px Arial";
    ctx.fillText(formula, column1 + 15, textY);
    ctx.fillStyle = isTotalWage ? "#1e3a8a" : "#111111";
    ctx.font = isTotalWage ? "700 29px Arial" : "700 25px Arial";
    ctx.textAlign = "right";
    ctx.fillText(`${type === "negative" ? "-" : ""}${formatCurrency(value)}`, canvas.width - margin - 15, textY);
    ctx.textAlign = "left";
    y += currentRowHeight;
    if (isTotalWage) {
      ctx.fillStyle = "#1e3a8a";
      ctx.font = "italic 700 24px Arial";
      y = drawWrappedText(ctx, `(${terbilangRupiah(slip.total_before_adjustments)})`, margin + 15, y + 31, canvas.width - margin * 2 - 30, 32) + 34;
    }
  });
  y += 34;
  if (slip.note) {
    ctx.fillStyle = "#f8f8f8"; ctx.fillRect(margin, y, canvas.width - margin * 2, 80);
    ctx.strokeStyle = "#999999"; ctx.strokeRect(margin, y, canvas.width - margin * 2, 80);
    ctx.fillStyle = "#111111"; ctx.font = "700 23px Arial"; ctx.fillText("Catatan:", margin + 14, y + 34);
    ctx.font = "23px Arial"; drawWrappedText(ctx, slip.note, margin + 138, y + 34, canvas.width - margin * 2 - 158, 29);
    y += 96;
  }

  const drawDebtSection = (title, rows) => {
    if (!rows.length) return;
    ctx.strokeStyle = "#999999"; ctx.beginPath(); ctx.moveTo(margin, y); ctx.lineTo(canvas.width - margin, y); ctx.stroke();
    y += 32; ctx.fillStyle = "#111111"; ctx.font = "700 22px Arial"; ctx.fillText(title, margin, y); y += 33;
    rows.forEach(({ label, amount }) => {
      ctx.fillStyle = "#111111"; ctx.font = "21px Arial";
      drawWrappedText(ctx, label, margin + 12, y, 790, 26);
      ctx.textAlign = "right"; ctx.font = "700 21px Arial"; ctx.fillText(formatCurrency(amount), canvas.width - margin - 12, y);
      ctx.textAlign = "left"; y += 32;
    });
    y += 10;
  };
  drawDebtSection("Transaksi kasbon dan utang:", (slip.receivable_details || []).map((item, index) => ({
    label: `${index + 1}. ${receivableActionLabel(item)} · ${formatDate(item.transaction_date)} · ${item.reference_number}`,
    amount: item.amount,
  })));
  drawDebtSection("Sisa kasbon / utang berjalan:", (slip.outstanding_receivables || []).map((item) => ({
    label: `${item.receivable_type === "cash_advance" ? "Sisa kasbon" : "Sisa utang"} · ${item.reference_number}`,
    amount: item.remaining_balance,
  })));

  const verificationUrl = buildSlipValidationUrl(slip);
  const qrDataUrl = await QRCode.toDataURL(verificationUrl, { margin: 0, width: 260 });
  const qrImage = await loadCanvasImage(qrDataUrl);
  const footerY = canvas.height - 245;
  ctx.strokeStyle = "#777777"; ctx.beginPath(); ctx.moveTo(margin, footerY); ctx.lineTo(canvas.width - margin, footerY); ctx.stroke();
  ctx.drawImage(qrImage, margin, footerY + 25, 145, 145);
  ctx.fillStyle = "#111111"; ctx.font = "700 23px Arial"; ctx.fillText("Verifikasi dokumen", margin + 170, footerY + 58);
  ctx.fillStyle = "#555555"; ctx.font = "21px Arial"; ctx.fillText("Scan QR untuk memeriksa keabsahan slip.", margin + 170, footerY + 91);
  ctx.fillText(`Tanggal cetak: ${formatDate(expenseDate)}`, margin + 170, footerY + 122);
  ctx.fillText(`Tanggal dokumen: ${formatDate(slip.period_end)}`, margin + 170, footerY + 153);
  ctx.font = "italic 21px Arial";
  ctx.fillText("Diterbitkan otomatis oleh sistem.", margin + 170, footerY + 184);
  ctx.fillStyle = "#111111"; ctx.textAlign = "center"; ctx.font = "23px Arial";
  ctx.fillText("Penerima,", canvas.width - 225, footerY + 55);
  ctx.font = "700 23px Arial"; ctx.fillText(`(${slip.employee_name})`, canvas.width - 225, footerY + 180);
  ctx.textAlign = "left";

  const blob = await canvasToBlob(canvas, "image/jpeg", 0.92);
  const safeReference = String(slip.document_reference || slip.id).replace(/[^a-z0-9_-]/gi, "-");
  return new File([blob], `slip-bulanan-${safeReference}.jpg`, { type: "image/jpeg" });
};

export default function ExpenseForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);
  const todayStr = new Date().toISOString().split("T")[0];

  /* ===============================
     STATE UTAMA
     =============================== */
  const [form, setForm] = useState({
    code_prefix: "",
    transaction_code: "",
    date: todayStr,
    status: "non",
    category_id: "",
    detail: "",
    amount: "",
    is_posted: false,
  });

  const [datePickerMode, setDatePickerMode] = useState("calendar");
  const [categories, setCategories] = useState([]);
  const [categoriesLoaded, setCategoriesLoaded] = useState(false);
  const [monthlySlips, setMonthlySlips] = useState([]);
  const [selectedMonthlySlip, setSelectedMonthlySlip] = useState("");
  const [monthlySlipsLoading, setMonthlySlipsLoading] = useState(false);
  const [monthlySlipsError, setMonthlySlipsError] = useState("");
  const [pendingReceiptSlip, setPendingReceiptSlip] = useState(null);
  const [isGeneratingSlipReceipt, setIsGeneratingSlipReceipt] = useState(false);

  const [imagePreview, setImagePreview] = useState(null);
  const [existingReceipts, setExistingReceipts] = useState([]);
  const [newReceipts, setNewReceipts] = useState([]);
  const [deletedReceiptIds, setDeletedReceiptIds] = useState([]);
  const [editingReceipt, setEditingReceipt] = useState(null);
  const [isImageLoading, setIsImageLoading] = useState(false);
  const [sourceImage, setSourceImage] = useState(null);

  const [manualCode, setManualCode] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const [dateYear, dateMonth, dateDay] = form.date
    ? form.date.split("-")
    : ["", "", ""];

  /* ===============================
     IMAGE EDITOR STATE
     =============================== */
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [crop, setCrop] = useState();
  const [completedCrop, setCompletedCrop] = useState(null);
  const [cropAspect, setCropAspect] = useState(undefined);
  const [editorMode, setEditorMode] = useState("crop");
  const [perspectiveCorners, setPerspectiveCorners] = useState(
    clonePerspectiveCorners,
  );
  const [editorImageUrl, setEditorImageUrl] = useState(null);
  const [imageSettings, setImageSettings] = useState(DEFAULT_IMAGE_SETTINGS);
  const [isRenderingPreview, setIsRenderingPreview] = useState(false);
  const [isApplyingEditor, setIsApplyingEditor] = useState(false);
  const [editorStageSize, setEditorStageSize] = useState({ width: 0, height: 0 });
  const editorImgRef = useRef(null);
  const editorStageRef = useRef(null);
  const fileInputRef = useRef(null);
  const sourceObjectUrlRef = useRef(null);
  const previewBeforeEditorRef = useRef(null);
  const receiptObjectUrlsRef = useRef(new Set());
  const pendingFileQueueRef = useRef([]);

  /* ===============================
     CAMERA STATE (DENGAN FLASHLIGHT)
     =============================== */
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [cameraFacingMode, setCameraFacingMode] = useState("environment");
  const [torchSupported, setTorchSupported] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [zoomRange, setZoomRange] = useState(null);
  const [cameraZoom, setCameraZoom] = useState(1);
  const [capturedPhoto, setCapturedPhoto] = useState(null);
  
  const videoRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const capturedPhotoUrlRef = useRef(null);

  /* ===============================
     CLEANUP OBJECT URL
     =============================== */
  useEffect(() => {
    const sourceUrlRef = sourceObjectUrlRef;
    const capturedUrlRef = capturedPhotoUrlRef;
    const receiptUrls = receiptObjectUrlsRef.current;
    return () => {
      [sourceUrlRef.current, capturedUrlRef.current]
        .filter(Boolean)
        .forEach((url) => URL.revokeObjectURL(url));
      receiptUrls.forEach((url) => URL.revokeObjectURL(url));
      receiptUrls.clear();
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!isEditorOpen || !editorStageRef.current || !window.ResizeObserver) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setEditorStageSize({ width, height });
    });
    observer.observe(editorStageRef.current);
    return () => observer.disconnect();
  }, [isEditorOpen, showTools]);

  /* ===============================
     HANDLE DATE
     =============================== */
  const handleDatePartChange = (type, value) => {
    let y = dateYear || String(currentYearNum);
    let m = dateMonth || "01";
    let d = dateDay || "01";

    if (type === "day") d = value;
    if (type === "month") m = value;
    if (type === "year") y = value;

    setForm((prev) => ({
      ...prev,
      date: `${y}-${m}-${d}`,
    }));
  };

  /* ===============================
     LOAD DATA
     =============================== */
  useEffect(() => {
    api.get("/categories/").then((res) => {
      if (res.data?.success) {
        setCategories(res.data.data);
        setCategoriesLoaded(true);
      }
    });
  }, []);

  useEffect(() => {
    if (isEdit || !dateYear || !dateMonth) return;
    let active = true;
    setMonthlySlipsLoading(true);
    setMonthlySlipsError("");
    setSelectedMonthlySlip("");
    payrollApi.slips.all({
      slip_type: "monthly",
      year: dateYear,
      month: Number(dateMonth),
    }).then((res) => {
      if (active) {
        const results = Array.isArray(res.data) ? res.data : [];
        setMonthlySlips(results.filter((slip) => ["published", "paid"].includes(slip.status)));
      }
    }).catch((err) => {
      if (active) {
        setMonthlySlips([]);
        setMonthlySlipsError(getApiError(err, "Gagal memuat slip bulanan."));
      }
    }).finally(() => {
      if (active) setMonthlySlipsLoading(false);
    });
    return () => { active = false; };
  }, [dateYear, dateMonth, isEdit]);

  useEffect(() => {
    if (!isEdit || !categoriesLoaded) return;

    api.get(`/expenses/${id}/`).then((res) => {
      let categoryId = "";

      if (typeof res.data.category === "object") {
        categoryId = String(res.data.category.id);
      } else if (typeof res.data.category === "string") {
        const found = categories.find((c) => c.name === res.data.category);
        categoryId = found ? String(found.id) : "";
      }

      setForm({
        code_prefix: res.data.transaction_code.replace(/\d/g, ""),
        transaction_code: res.data.transaction_code,
        date: res.data.date,
        status: res.data.status,
        category_id: categoryId,
        detail: res.data.detail || "",
        amount: formatNumber(String(res.data.amount).split(".")[0]),
        is_posted: Boolean(res.data.is_posted),
      });

      setExistingReceipts(Array.isArray(res.data.receipts) ? res.data.receipts : []);

      setManualCode(true);
    });
  }, [id, isEdit, categoriesLoaded, categories]);

  useEffect(() => {
    if (isEdit) return;
    if (manualCode) return;
    if (!form.code_prefix || !form.date) return;

    api.get("/expenses/").then((res) => {
      const results = Array.isArray(res.data?.results) ? res.data.results : [];
      const codes = results.map((item) => item.transaction_code);
      setForm((p) => ({
        ...p,
        transaction_code: generateTransactionCode(
          form.code_prefix,
          form.date,
          codes,
        ),
      }));
    });
  }, [form.code_prefix, form.date, manualCode, isEdit]);

  const releaseSourceObjectUrl = () => {
    if (sourceObjectUrlRef.current) {
      URL.revokeObjectURL(sourceObjectUrlRef.current);
      sourceObjectUrlRef.current = null;
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === "amount") {
      setForm((p) => ({ ...p, amount: formatNumber(value) }));
    } else {
      setForm((p) => ({ ...p, [name]: value }));
    }
  };

  const applyMonthlySlip = (slipId) => {
    setSelectedMonthlySlip(slipId);
    const slip = monthlySlips.find((item) => String(item.id) === String(slipId));
    if (!slip) return;
    const payrollCategory = categories.find((category) =>
      /gaji|upah|payroll/i.test(category.name || ""),
    );
    const period = `${formatDate(slip.period_start)} – ${formatDate(slip.period_end)}`;
    setManualCode(true);
    setForm((prev) => ({
      ...prev,
      code_prefix: "PAY",
      transaction_code: slip.document_reference,
      status: "non",
      category_id: payrollCategory ? String(payrollCategory.id) : prev.category_id,
      detail: `Pembayaran upah harian Sdr. ${slip.employee_name} periode ${period} · Referensi ${slip.document_reference}`,
      amount: formatNumber(String(Math.round(Number(slip.total_before_adjustments || 0)))),
    }));
    setPendingReceiptSlip(slip);
  };

  const confirmMonthlySlipReceipt = async () => {
    if (!pendingReceiptSlip) return;
    setIsGeneratingSlipReceipt(true);
    setError(null);
    try {
      const [slipResponse, employeeResponse] = await Promise.all([
        payrollApi.slips.get(pendingReceiptSlip.id),
        payrollApi.employees.get(pendingReceiptSlip.employee),
      ]);
      const receiptFile = await createMonthlySlipReceipt(
        slipResponse.data,
        employeeResponse.data,
        form.date,
      );
      addNewReceipt(receiptFile, null);
      setPendingReceiptSlip(null);
    } catch (err) {
      console.error("Generate slip receipt error:", err);
      setError("Gagal membuat gambar bukti dari slip bulanan.");
    } finally {
      setIsGeneratingSlipReceipt(false);
    }
  };

  /* ===============================
     CAMERA & FLASHLIGHT
     =============================== */
  const clearCapturedPhoto = () => {
    if (capturedPhotoUrlRef.current) {
      URL.revokeObjectURL(capturedPhotoUrlRef.current);
      capturedPhotoUrlRef.current = null;
    }
    setCapturedPhoto(null);
  };

  function stopCamera() {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((track) => {
        if (track.applyConstraints) {
          track.applyConstraints({ advanced: [{ torch: false }] }).catch(() => {});
        }
        track.stop();
      });
      cameraStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraReady(false);
    setTorchSupported(false);
    setIsTorchOn(false);
    setZoomRange(null);
  }

  const startCamera = async (requestedFacingMode = cameraFacingMode) => {
    if (isNative) {
      try { await openImageEditorFromFile(await takeReceiptPhoto()); }
      catch (err) { if (!/cancel/i.test(err.message || "")) setError(err.message || "Kamera gagal dibuka."); }
      return;
    }
    const nextFacingMode =
      typeof requestedFacingMode === "string"
        ? requestedFacingMode
        : cameraFacingMode;
    setIsCameraOpen(true);
    setCameraError(null);
    setIsCameraReady(false);
    setTorchSupported(false);
    setIsTorchOn(false);
    clearCapturedPhoto();

    if (!window.isSecureContext && window.location.hostname !== "localhost") {
      setCameraError(
        "Kamera browser membutuhkan HTTPS. Buka aplikasi melalui HTTPS atau localhost.",
      );
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(
        "Browser ini tidak menyediakan akses kamera langsung. Gunakan tombol Pilih File.",
      );
      return;
    }

    try {
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: nextFacingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      cameraStreamRef.current = stream;
      setCameraFacingMode(nextFacingMode);

      const track = stream.getVideoTracks()[0];
      if (track && track.getCapabilities) {
        const capabilities = track.getCapabilities();
        const canUseTorch =
          capabilities.torch === true ||
          (Array.isArray(capabilities.torch) && capabilities.torch.includes(true));
        setTorchSupported(canUseTorch);
        if (capabilities.zoom) {
          const zoom = capabilities.zoom;
          const initialZoom = Math.min(Math.max(zoom.min, 1), zoom.max);
          setZoomRange({ min: zoom.min, max: zoom.max, step: zoom.step || 0.1 });
          setCameraZoom(initialZoom);
        }
        if (Array.isArray(capabilities.focusMode) && capabilities.focusMode.includes("continuous")) {
          track.applyConstraints({ advanced: [{ focusMode: "continuous" }] }).catch(() => {});
        }
      }

      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {
            setCameraError("Kamera aktif, tetapi preview gagal diputar.");
          });
        }
      });
    } catch (err) {
      console.error("Camera error:", err);
      const isBlockedByPermissionsPolicy =
        typeof document.featurePolicy?.allowsFeature === "function" &&
        !document.featurePolicy.allowsFeature("camera");

      if (isBlockedByPermissionsPolicy) {
        setCameraError(
          "Akses kamera dinonaktifkan oleh kebijakan keamanan aplikasi. Hubungi administrator aplikasi.",
        );
      } else if (err?.name === "NotAllowedError") {
        setCameraError(
          "Izin kamera ditolak. Izinkan kamera pada pengaturan situs browser, lalu coba lagi.",
        );
      } else if (err?.name === "NotFoundError") {
        setCameraError("Kamera tidak ditemukan pada perangkat ini.");
      } else if (err?.name === "NotReadableError") {
        setCameraError(
          "Kamera sedang digunakan aplikasi lain atau tidak dapat dibaca. Tutup aplikasi kamera lain, lalu coba lagi.",
        );
      } else {
        setCameraError(
          "Tidak dapat membuka kamera. Coba lagi atau gunakan tombol Tambah File.",
        );
      }
    }
  };

  const closeCamera = () => {
    stopCamera();
    clearCapturedPhoto();
    setIsCameraOpen(false);
    setCameraError(null);
  };

  const switchCamera = async () => {
    const nextFacingMode = cameraFacingMode === "environment" ? "user" : "environment";
    stopCamera();
    await startCamera(nextFacingMode);
  };

  const toggleTorch = async () => {
    if (!cameraStreamRef.current) return;
    const track = cameraStreamRef.current.getVideoTracks()[0];
    if (track) {
      try {
        const nextTorchState = !isTorchOn;
        await track.applyConstraints({
          advanced: [{ torch: nextTorchState }],
        });
        setIsTorchOn(nextTorchState);
      } catch (err) {
        console.error("Gagal mengaktifkan senter kamera:", err);
        setIsTorchOn(false);
        setTorchSupported(false);
      }
    }
  };

  const changeCameraZoom = async (value) => {
    const zoom = Number(value);
    setCameraZoom(zoom);
    const track = cameraStreamRef.current?.getVideoTracks()[0];
    if (!track?.applyConstraints) return;
    try {
      await track.applyConstraints({ advanced: [{ zoom }] });
    } catch {
      setCameraError("Zoom tidak dapat diterapkan pada kamera ini.");
    }
  };

  const refreshAutoFocus = () => {
    const track = cameraStreamRef.current?.getVideoTracks()[0];
    if (!track?.applyConstraints || !track.getCapabilities) return;
    const capabilities = track.getCapabilities();
    if (Array.isArray(capabilities.focusMode) && capabilities.focusMode.includes("single-shot")) {
      track.applyConstraints({ advanced: [{ focusMode: "single-shot" }] }).catch(() => {});
    }
  };

  const captureCameraPhoto = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      setCameraError("Kamera belum siap. Tunggu sebentar lalu coba lagi.");
      return;
    }

    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas tidak tersedia.");

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await canvasToBlob(canvas, "image/jpeg", 0.92);
      const file = new File(
        [blob],
        `receipt-${Date.now()}.jpg`,
        { type: "image/jpeg" },
      );
      const quality = analyzeCanvasQuality(canvas);
      const previewUrl = URL.createObjectURL(file);
      capturedPhotoUrlRef.current = previewUrl;
      stopCamera();
      setCapturedPhoto({ file, previewUrl, quality });
    } catch (err) {
      console.error("Capture camera error:", err);
      setCameraError("Gagal mengambil foto dari kamera.");
    }
  };

  const retakeCameraPhoto = async () => {
    clearCapturedPhoto();
    await startCamera(cameraFacingMode);
  };

  const useCapturedCameraPhoto = async () => {
    if (!capturedPhoto) return;
    const { file } = capturedPhoto;
    clearCapturedPhoto();
    setIsCameraOpen(false);
    await openImageEditorFromFile(file);
  };

  /* ===============================
     IMAGE INPUT / HEIC
     =============================== */
  const chooseExistingFile = () => {
    fileInputRef.current?.click();
  };

  const openImageEditorFromFile = async (file, target = null) => {
    setError(null);
    setIsImageLoading(true);

    try {
      if (!file || (!(file.type || "").startsWith("image/") && !RECEIPT_EXTENSIONS.test(file.name || ""))) {
        throw new Error("Format file tidak didukung. Gunakan JPG, PNG, WebP, HEIC, atau HEIF.");
      }
      if (file.size > MAX_RECEIPT_FILE_SIZE) {
        throw new Error("Ukuran gambar maksimal 25 MB.");
      }

      let processedFile = file;

      const isHeic =
        file.type === "image/heic" ||
        file.type === "image/heif" ||
        file.name.toLowerCase().endsWith(".heic") ||
        file.name.toLowerCase().endsWith(".heif");

      if (isHeic) {
        const { default: heic2any } = await import("heic2any");
        const convertedBlob = await heic2any({
          blob: file,
          toType: "image/jpeg",
          quality: 0.9,
        });

        const finalBlob = Array.isArray(convertedBlob)
          ? convertedBlob[0]
          : convertedBlob;

        processedFile = new File(
          [finalBlob],
          file.name.replace(/\.[^/.]+$/, ".jpg"),
          { type: "image/jpeg" },
        );
      }

      previewBeforeEditorRef.current = imagePreview;
      setEditingReceipt(target);
      releaseSourceObjectUrl();
      const objectUrl = URL.createObjectURL(processedFile);
      sourceObjectUrlRef.current = objectUrl;
      let img;
      try {
        img = await loadImage(objectUrl);
      } catch (loadError) {
        URL.revokeObjectURL(objectUrl);
        sourceObjectUrlRef.current = null;
        throw loadError;
      }
      if (Math.min(img.naturalWidth, img.naturalHeight) < 160) {
        throw new Error("Resolusi gambar terlalu kecil. Gunakan gambar minimal 160 piksel.");
      }
      setSourceImage(img);
      setImageSettings(DEFAULT_IMAGE_SETTINGS);
      setCrop(DEFAULT_CROP);
      setCompletedCrop(DEFAULT_CROP);
      setCropAspect(undefined);
      setEditorMode("crop");
      setPerspectiveCorners(clonePerspectiveCorners());
      setIsEditorOpen(true);
      setShowTools(false);
    } catch (err) {
      console.error("Gagal membaca/konversi gambar:", err);
      releaseSourceObjectUrl();
      setSourceImage(null);
      setEditingReceipt(null);
      setError(err.message || "Gagal memproses file gambar. Pastikan file valid.");
      openNextQueuedFile();
    } finally {
      setIsImageLoading(false);
    }
  };

  const openNextQueuedFile = () => {
    const nextFile = pendingFileQueueRef.current.shift();
    if (nextFile) {
      window.setTimeout(() => openImageEditorFromFile(nextFile), 0);
    }
  };

  const onSelectFile = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (files.length === 0) return;
    const availableSlots = 5 - existingReceipts.length - newReceipts.length;
    if (files.length > availableSlots) {
      setError(`Maksimal 5 bukti foto. Slot tersisa: ${availableSlots}.`);
      return;
    }
    const [firstFile, ...queuedFiles] = files;
    pendingFileQueueRef.current = queuedFiles;
    await openImageEditorFromFile(firstFile);
  };

  /* ===============================
     LIVE PREVIEW EDITOR
     =============================== */
  useEffect(() => {
    if (!isEditorOpen || !sourceImage) return;

    let cancelled = false;
    setIsRenderingPreview(true);

    try {
      const canvas = renderEditedCanvas(
        sourceImage,
        { ...DEFAULT_IMAGE_SETTINGS, rotation: imageSettings.rotation },
        1600,
      );
      const dataUrl = canvas.toDataURL("image/jpeg", 0.9);

      if (!cancelled) {
        setEditorImageUrl(dataUrl);
      }
    } catch (err) {
      console.error("Editor preview error:", err);
      if (!cancelled) setError("Gagal menampilkan preview gambar.");
    } finally {
      if (!cancelled) setIsRenderingPreview(false);
    }

    return () => {
      cancelled = true;
    };
  }, [isEditorOpen, sourceImage, imageSettings.rotation]);

  const setEditorSetting = (name, value) => {
    setImageSettings((prev) => ({ ...prev, [name]: value }));
  };

  const rotateLeft = () => {
    setEditorSetting("rotation", (imageSettings.rotation - 90 + 360) % 360);
    setCrop(DEFAULT_CROP);
    setCompletedCrop(DEFAULT_CROP);
    setPerspectiveCorners(clonePerspectiveCorners());
  };

  const rotateRight = () => {
    setEditorSetting("rotation", (imageSettings.rotation + 90) % 360);
    setCrop(DEFAULT_CROP);
    setCompletedCrop(DEFAULT_CROP);
    setPerspectiveCorners(clonePerspectiveCorners());
  };

  const resetEditor = () => {
    setImageSettings(DEFAULT_IMAGE_SETTINGS);
    setCropAspect(undefined);
    setCrop(DEFAULT_CROP);
    setCompletedCrop(DEFAULT_CROP);
    setPerspectiveCorners(clonePerspectiveCorners());
  };

  const enhanceDocument = () => {
    setImageSettings((prev) => ({
      ...prev,
      brightness: 108,
      contrast: 28,
      grayscale: true,
    }));
  };

  const changeCropAspect = (nextAspect) => {
    setCropAspect(nextAspect);
    const img = editorImgRef.current;
    if (!img || !nextAspect) {
      setCrop(DEFAULT_CROP);
      setCompletedCrop(DEFAULT_CROP);
      return;
    }
    const nextCrop = centerCrop(
      makeAspectCrop({ unit: "%", width: 90 }, nextAspect, img.width, img.height),
      img.width,
      img.height,
    );
    setCrop(nextCrop);
    setCompletedCrop(nextCrop);
  };

  const movePerspectiveCorner = (cornerName, event) => {
    const img = editorImgRef.current;
    if (!img) return;
    const bounds = img.getBoundingClientRect();
    const isLeft = cornerName === "tl" || cornerName === "bl";
    const isTop = cornerName === "tl" || cornerName === "tr";
    const x = clamp(
      ((event.clientX - bounds.left) / bounds.width) * 100,
      isLeft ? 0 : 52,
      isLeft ? 48 : 100,
    );
    const y = clamp(
      ((event.clientY - bounds.top) / bounds.height) * 100,
      isTop ? 0 : 52,
      isTop ? 48 : 100,
    );
    setPerspectiveCorners((previous) => ({
      ...previous,
      [cornerName]: { x, y },
    }));
  };

  /* ===============================
     APPLY EDITOR + COMPRESS
     =============================== */
  const applyEditorAndCompress = async () => {
    if (!sourceImage || !editorImgRef.current) {
      setIsEditorOpen(false);
      return;
    }

    setIsApplyingEditor(true);

    try {
      const editedCanvas = renderEditedCanvas(sourceImage, imageSettings, 3000);
      let finalCanvas = editedCanvas;

      if (editorMode === "perspective") {
        finalCanvas = renderPerspectiveCanvas(editedCanvas, perspectiveCorners);
      } else if (completedCrop?.width && completedCrop?.height) {
        const naturalWidth = editedCanvas.width;
        const naturalHeight = editedCanvas.height;

        const cropX = Math.max(0, (completedCrop.x / 100) * naturalWidth);
        const cropY = Math.max(0, (completedCrop.y / 100) * naturalHeight);
        const cropWidth = Math.min(
          naturalWidth - cropX,
          (completedCrop.width / 100) * naturalWidth,
        );
        const cropHeight = Math.min(
          naturalHeight - cropY,
          (completedCrop.height / 100) * naturalHeight,
        );

        if (cropWidth > 1 && cropHeight > 1) {
          finalCanvas = document.createElement("canvas");
          finalCanvas.width = Math.round(cropWidth);
          finalCanvas.height = Math.round(cropHeight);

          const finalCtx = finalCanvas.getContext("2d");
          if (!finalCtx) throw new Error("Canvas final tidak tersedia.");

          finalCtx.imageSmoothingEnabled = true;
          finalCtx.imageSmoothingQuality = "high";
          finalCtx.drawImage(
            editedCanvas,
            Math.round(cropX),
            Math.round(cropY),
            Math.round(cropWidth),
            Math.round(cropHeight),
            0,
            0,
            finalCanvas.width,
            finalCanvas.height,
          );
        }
      }

      const blob = await canvasToBlob(finalCanvas, "image/jpeg", 0.92);
      const editedFile = new File([blob], `receipt-${Date.now()}.jpg`, {
        type: "image/jpeg",
      });

      const options = {
        maxSizeMB: 1,
        maxWidthOrHeight: 1280,
        useWebWorker: true,
        fileType: "image/jpeg",
      };

      const compressedFile = await imageCompression(editedFile, options);

      const quality = analyzeCanvasQuality(finalCanvas);
      addNewReceipt(compressedFile, quality, editingReceipt);
      setIsEditorOpen(false);
      releaseSourceObjectUrl();
      setSourceImage(null);
      setEditorImageUrl(null);
      openNextQueuedFile();
    } catch (err) {
      console.error("Gagal memproses gambar:", err);
      setError("Terjadi kesalahan saat memproses gambar.");
    } finally {
      setIsApplyingEditor(false);
    }
  };

  const cancelEditor = () => {
    setIsEditorOpen(false);
    setSourceImage(null);
    releaseSourceObjectUrl();
    setEditorImageUrl(null);
    setImagePreview(previewBeforeEditorRef.current);
    setEditingReceipt(null);
    openNextQueuedFile();
  };

  const editExistingReceipt = async (receipt) => {
    setIsImageLoading(true);
    setError(null);
    try {
      // Selalu minta URL baru agar proses edit tidak memakai URL yang kedaluwarsa.
      const accessResponse = await api.get(
        `/expenses/${id}/receipts/${receipt.id}/`,
      );
      const freshReceipt = accessResponse.data;
      setExistingReceipts((items) =>
        items.map((item) => item.id === receipt.id ? freshReceipt : item),
      );

      // Jangan gunakan instance `api`: interceptor-nya membawa token Django,
      // sedangkan presigned URL R2 tidak memerlukan header Authorization.
      const response = await fetch(freshReceipt.url, {
        method: "GET",
        mode: "cors",
        credentials: "omit",
        cache: "no-store",
        referrerPolicy: "no-referrer",
      });
      if (!response.ok) {
        throw new Error(`R2 mengembalikan HTTP ${response.status}`);
      }
      const blob = await response.blob();
      const contentType = blob.type || "image/jpeg";
      const extension = contentType.includes("png") ? "png" : "jpg";
      const file = new File([blob], `receipt-existing.${extension}`, {
        type: contentType,
      });
      await openImageEditorFromFile(file, { type: "existing", id: receipt.id });
    } catch (err) {
      console.error("Gagal mengunduh bukti untuk diedit:", err);
      setError(
        "Bukti lama tidak dapat dibuka untuk diedit. Periksa akses/CORS penyimpanan atau pilih file pengganti.",
      );
    } finally {
      setIsImageLoading(false);
    }
  };

  const editNewReceipt = async (receipt, index) => {
    await openImageEditorFromFile(receipt.file, { type: "new", index });
  };

  const addNewReceipt = (file, quality = null, target = null) => {
    const currentTotal = existingReceipts.length + newReceipts.length;
    if (!target && currentTotal >= 5) {
      setError("Maksimal 5 bukti foto per expense.");
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    receiptObjectUrlsRef.current.add(previewUrl);
    const nextReceipt = { file, previewUrl, quality };

    if (target?.type === "existing") {
      setExistingReceipts((items) => items.filter((item) => item.id !== target.id));
      setDeletedReceiptIds((ids) => ids.includes(target.id) ? ids : [...ids, target.id]);
      setNewReceipts((items) => [...items, nextReceipt]);
    } else if (target?.type === "new") {
      setNewReceipts((items) => items.map((item, index) => {
        if (index !== target.index) return item;
        URL.revokeObjectURL(item.previewUrl);
        receiptObjectUrlsRef.current.delete(item.previewUrl);
        return nextReceipt;
      }));
    } else {
      setNewReceipts((items) => [...items, nextReceipt]);
    }

    setImagePreview(previewUrl);
    setEditingReceipt(null);
  };

  const removeExistingReceipt = (receiptId) => {
    setExistingReceipts((items) => items.filter((item) => item.id !== receiptId));
    setDeletedReceiptIds((ids) => ids.includes(receiptId) ? ids : [...ids, receiptId]);
  };

  const removeNewReceipt = (index) => {
    setNewReceipts((items) => {
      const removed = items[index];
      if (removed) {
        URL.revokeObjectURL(removed.previewUrl);
        receiptObjectUrlsRef.current.delete(removed.previewUrl);
      }
      return items.filter((_, itemIndex) => itemIndex !== index);
    });
  };

  useEffect(() => {
    if (!isCameraOpen && !isEditorOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isCameraOpen, isEditorOpen]);

  /* ===============================
     SUBMIT
     =============================== */
  const submit = async () => {
    setError(null);
    setIsSaving(true);

    try {
      const payload = {
        transaction_code: form.transaction_code,
        date: form.date,
        status: form.status,
        category_id: form.category_id,
        detail: form.detail,
        amount: unformatNumber(form.amount),
      };
      const fd = new FormData();
      Object.entries(payload).forEach(([key, value]) => fd.append(key, value));

      newReceipts.forEach((receipt) => fd.append("receipts", receipt.file));

      if (isEdit) {
        if (deletedReceiptIds.length > 0) {
          await api.patch(`/expenses/${id}/`, payload);
          await Promise.all(
            deletedReceiptIds.map((receiptId) =>
              api.delete(`/expenses/${id}/receipts/${receiptId}/`),
            ),
          );
          if (newReceipts.length > 0) {
            const receiptData = new FormData();
            newReceipts.forEach((receipt) =>
              receiptData.append("receipts", receipt.file),
            );
            await api.patch(`/expenses/${id}/`, receiptData);
          }
        } else {
          await api.patch(`/expenses/${id}/`, fd);
        }
      } else {
        await api.post("/expenses/", fd);
      }

      setSuccessMessage(
        isEdit
          ? "Transaksi berhasil diperbarui!"
          : "Transaksi berhasil disimpan!",
      );

      setTimeout(() => navigate("/expense"), 3000);
    } catch (err) {
      console.error("Submit expense error:", err);
      setError("Gagal menyimpan transaksi");
      setIsSaving(false);
    }
  };

  /* ===============================
     DELETE
     =============================== */
  const deleteExpenseSafe = async () => {
    setError(null);

    try {
      const res = await api.delete(`/expenses/${id}/`);
      if (res.status === 200 || res.status === 204) {
        setShowDelete(false);
        setSuccessMessage("Transaksi berhasil dihapus!");
        setTimeout(() => navigate("/expense"), 3000);
      } else {
        setShowDelete(false);
        setError("Gagal menghapus transaksi");
      }
    } catch (err) {
      console.error("Delete expense error:", err);
      setShowDelete(false);
      setError("Terjadi kesalahan saat menghapus transaksi");
    }
  };

  return (
    <MobileLayout title={isEdit ? "Edit Expense" : "Tambah Expense"}>
      <ErrorAlert message={error} onClose={() => setError(null)} />

      {/* ===============================
          CAMERA MODAL
          =============================== */}
      {isCameraOpen && createPortal(
        <div role="dialog" aria-modal="true" aria-label="Kamera bukti transaksi" className="fixed inset-0 z-[250] grid h-[100dvh] grid-rows-[minmax(0,1fr)_auto] bg-black text-white receipt-safe-area">
          <div className="relative min-h-0 overflow-hidden bg-black">
            {capturedPhoto ? (
              <div className="flex h-full w-full items-center justify-center p-3">
                <img src={capturedPhoto.previewUrl} alt="Hasil foto bukti transaksi" className="max-h-full max-w-full object-contain" />
              </div>
            ) : (
              <>
                <video ref={videoRef} autoPlay playsInline muted onLoadedMetadata={() => setIsCameraReady(true)} onClick={refreshAutoFocus} className="h-full w-full object-contain" />
                <div className="pointer-events-none absolute inset-[12%_8%_14%] border border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.18)]">
                  <span className="absolute -left-0.5 -top-0.5 h-8 w-8 border-l-4 border-t-4 border-[#3ddc97]" />
                  <span className="absolute -right-0.5 -top-0.5 h-8 w-8 border-r-4 border-t-4 border-[#3ddc97]" />
                  <span className="absolute -bottom-0.5 -left-0.5 h-8 w-8 border-b-4 border-l-4 border-[#3ddc97]" />
                  <span className="absolute -bottom-0.5 -right-0.5 h-8 w-8 border-b-4 border-r-4 border-[#3ddc97]" />
                  <span className="absolute inset-x-4 bottom-3 text-center text-xs font-medium drop-shadow">Posisikan seluruh nota di dalam bingkai</span>
                </div>
              </>
            )}

            <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 bg-gradient-to-b from-black/80 to-transparent p-3 receipt-safe-top">
              <button type="button" onClick={closeCamera} className="rounded-full bg-black/60 px-4 py-2 text-sm font-semibold">Tutup</button>
              <span className="truncate text-sm font-semibold">
                {capturedPhoto ? "Periksa Hasil Foto" : cameraFacingMode === "environment" ? "Kamera Belakang" : "Kamera Depan"}
              </span>
              {!capturedPhoto ? (
                <div className="flex gap-2">
                  {torchSupported && (
                    <button type="button" onClick={toggleTorch} className={`rounded-full px-3 py-2 text-sm font-semibold ${isTorchOn ? "bg-yellow-400 text-black" : "bg-black/60"}`}>{isTorchOn ? "Senter On" : "Senter"}</button>
                  )}
                  <button type="button" onClick={switchCamera} className="rounded-full bg-black/60 px-3 py-2 text-sm font-semibold" aria-label="Ganti kamera">↻</button>
                </div>
              ) : <span className="w-16" />}
            </div>

            {!capturedPhoto && !isCameraReady && !cameraError && <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm">Menyiapkan kamera...</div>}
            {cameraError && <div role="alert" className="absolute inset-x-4 bottom-4 rounded-lg bg-red-600 p-3 text-sm shadow-lg">{cameraError}</div>}
          </div>

          <div className="border-t border-white/10 bg-black px-4 pb-4 pt-3 receipt-safe-bottom">
            {capturedPhoto ? (
              <div className="mx-auto max-w-md space-y-3">
                <div className={`rounded-lg p-3 text-sm ${capturedPhoto.quality.warnings.length ? "bg-amber-400/15 text-amber-100" : "bg-emerald-400/15 text-emerald-100"}`}>
                  <div className="font-semibold">Kualitas foto {capturedPhoto.quality.score}/100</div>
                  {capturedPhoto.quality.warnings.length ? (
                    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">{capturedPhoto.quality.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
                  ) : <div className="mt-1 text-xs">Pencahayaan dan ketajaman terlihat baik.</div>}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <button type="button" onClick={retakeCameraPhoto} className="rounded-lg border border-white/50 py-3 font-semibold">Foto Ulang</button>
                  <button type="button" onClick={useCapturedCameraPhoto} className="rounded-lg bg-[#0067b8] py-3 font-semibold">Gunakan Foto</button>
                </div>
              </div>
            ) : (
              <div className="mx-auto flex max-w-md items-center justify-between gap-4">
                <div className="w-24">
                  {zoomRange && <label className="block text-center text-[11px] text-gray-300">Zoom {cameraZoom.toFixed(1)}×<input type="range" min={zoomRange.min} max={zoomRange.max} step={zoomRange.step} value={cameraZoom} onChange={(event) => changeCameraZoom(event.target.value)} className="mt-1 w-full accent-white" /></label>}
                </div>
                <button type="button" onClick={captureCameraPhoto} disabled={!isCameraReady || Boolean(cameraError)} className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-white bg-white/20 transition-transform active:scale-95 disabled:opacity-40" aria-label="Ambil foto"><span className="block h-14 w-14 rounded-full bg-white" /></button>
                <div className="w-24 text-center text-[11px] text-gray-400">Ketuk preview untuk fokus</div>
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}

      {/* ===============================
          IMAGE EDITOR MODAL
          =============================== */}
      {isEditorOpen && editorImageUrl && createPortal(
        <div role="dialog" aria-modal="true" aria-labelledby="receipt-editor-title" className="fixed inset-0 z-[240] grid h-[100dvh] grid-rows-[auto_minmax(0,1fr)_auto] bg-black/95 receipt-safe-area">
          <div className="flex items-center justify-between gap-3 px-3 pb-2 pt-3 text-white receipt-safe-top sm:px-4">
            <div>
              <div id="receipt-editor-title" className="font-bold">Edit Bukti Transaksi</div>
              <div className="text-xs text-gray-300">
                {editorMode === "crop" ? "Geser kotak untuk memotong gambar." : "Geser empat titik ke setiap sudut nota."}
              </div>
            </div>
            {(isRenderingPreview || isApplyingEditor) && (
              <span className="text-xs text-gray-300">Memproses...</span>
            )}
          </div>

          <div ref={editorStageRef} className="min-h-0 overflow-auto overscroll-contain p-2">
            <div className="flex min-h-full min-w-full items-center justify-center">
              {editorMode === "crop" ? (
                <ReactCrop crop={crop} aspect={cropAspect} onChange={(pixelCrop, percentCrop) => setCrop(percentCrop)} onComplete={(pixelCrop, percentCrop) => setCompletedCrop(percentCrop)} className="max-h-full max-w-full">
                  <img
                    ref={editorImgRef}
                    src={editorImageUrl}
                    alt="Edit bukti transaksi"
                    draggable="false"
                    className="block max-w-full select-none object-contain"
                    style={{
                      maxHeight: editorStageSize.height ? `${Math.max(120, editorStageSize.height - 16)}px` : "55dvh",
                      filter: `brightness(${imageSettings.brightness}%) contrast(${100 + imageSettings.contrast}%) grayscale(${imageSettings.grayscale ? 1 : 0})`,
                    }}
                  />
                </ReactCrop>
              ) : (
                <div className="relative inline-flex max-h-full max-w-full touch-none">
                  <img
                    ref={editorImgRef}
                    src={editorImageUrl}
                    alt="Luruskan perspektif bukti transaksi"
                    draggable="false"
                    className="block max-w-full select-none object-contain"
                    style={{
                      maxHeight: editorStageSize.height ? `${Math.max(120, editorStageSize.height - 16)}px` : "55dvh",
                      filter: `brightness(${imageSettings.brightness}%) contrast(${100 + imageSettings.contrast}%) grayscale(${imageSettings.grayscale ? 1 : 0})`,
                    }}
                  />
                  <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                    <polygon points={`${perspectiveCorners.tl.x},${perspectiveCorners.tl.y} ${perspectiveCorners.tr.x},${perspectiveCorners.tr.y} ${perspectiveCorners.br.x},${perspectiveCorners.br.y} ${perspectiveCorners.bl.x},${perspectiveCorners.bl.y}`} fill="rgba(0,103,184,0.18)" stroke="#3ddc97" strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
                  </svg>
                  {Object.entries(perspectiveCorners).map(([name, point]) => (
                    <button
                      key={name}
                      type="button"
                      aria-label={`Geser sudut ${name}`}
                      onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
                      onPointerMove={(event) => {
                        if (event.currentTarget.hasPointerCapture(event.pointerId)) movePerspectiveCorner(name, event);
                      }}
                      className="absolute h-7 w-7 -translate-x-1/2 -translate-y-1/2 touch-none rounded-full border-2 border-white bg-[#0067b8] shadow-lg"
                      style={{ left: `${point.x}%`, top: `${point.y}%` }}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* TOOLS & ACTIONS */}
          <div className="max-h-[48dvh] overflow-y-auto rounded-t-2xl bg-white p-3 receipt-safe-bottom sm:p-4">
            <div className="mb-2 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setEditorMode("crop")} className={`rounded-md border-2 py-2 text-sm font-semibold ${editorMode === "crop" ? "border-[#0067b8] bg-blue-50 text-[#0067b8]" : "border-gray-300 text-gray-700"}`}>▣ Crop Biasa</button>
              <button type="button" onClick={() => setEditorMode("perspective")} className={`rounded-md border-2 py-2 text-sm font-semibold ${editorMode === "perspective" ? "border-[#0067b8] bg-blue-50 text-[#0067b8]" : "border-gray-300 text-gray-700"}`}>◇ Luruskan Nota</button>
            </div>
            
            {/* Action Bar Selalu Tampil */}
            <div className="flex gap-2 mb-2">
              <button
                type="button"
                onClick={() => setShowTools(!showTools)}
                className="flex-1 py-2 border-2 border-[#0067b8] font-semibold text-[#0067b8] rounded-md transition-colors hover:bg-blue-50"
              >
                {showTools ? "Sembunyikan Alat" : "Tampilkan Alat"}
              </button>

              {!showTools && (
                <>
                  <button
                    type="button"
                    onClick={cancelEditor}
                    className="flex-1 py-2 border-2 border-gray-300 font-semibold text-gray-700 rounded-md"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={applyEditorAndCompress}
                    disabled={isRenderingPreview || isApplyingEditor}
                    className="flex-1 py-2 bg-[#0067b8] text-white font-semibold rounded-md disabled:opacity-50"
                  >
                    Terapkan
                  </button>
                </>
              )}
            </div>

            {/* Menu Alat Edit (Disembunyikan Default) */}
            {showTools && (
              <div className="mt-3 border-t border-gray-200 pt-3">
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <button
                    type="button"
                    onClick={rotateLeft}
                    className="border border-gray-300 py-2 font-semibold text-gray-700 active:bg-gray-100 rounded-md"
                  >
                    ↶ Putar Kiri
                  </button>
                  <button
                    type="button"
                    onClick={rotateRight}
                    className="border border-gray-300 py-2 font-semibold text-gray-700 active:bg-gray-100 rounded-md"
                  >
                    ↷ Putar Kanan
                  </button>
                </div>

                <button
                  type="button"
                  onClick={enhanceDocument}
                  className="w-full mb-3 py-2.5 bg-[#0067b8] text-white font-semibold rounded-md"
                >
                  ✨ Perjelas Nota
                </button>

                {editorMode === "crop" && (
                  <div className="mb-3 grid grid-cols-4 gap-1 rounded-md bg-gray-100 p-1 text-xs">
                    {[["Bebas", undefined], ["A4", 210 / 297], ["3:4", 3 / 4], ["1:1", 1]].map(([label, aspect]) => (
                      <button key={label} type="button" onClick={() => changeCropAspect(aspect)} className={`rounded px-2 py-2 font-semibold ${cropAspect === aspect ? "bg-white text-[#0067b8] shadow" : "text-gray-600"}`}>{label}</button>
                    ))}
                  </div>
                )}

                <div className="space-y-3">
                  <label className="block">
                    <div className="flex justify-between text-sm font-semibold text-gray-700 mb-1">
                      <span>Kecerahan</span>
                      <span>{imageSettings.brightness}%</span>
                    </div>
                    <input
                      type="range"
                      min="50"
                      max="150"
                      step="1"
                      value={imageSettings.brightness}
                      onChange={(e) =>
                        setEditorSetting("brightness", Number(e.target.value))
                      }
                      className="w-full accent-[#0067b8]"
                    />
                  </label>

                  <label className="block">
                    <div className="flex justify-between text-sm font-semibold text-gray-700 mb-1">
                      <span>Kontras</span>
                      <span>{imageSettings.contrast}</span>
                    </div>
                    <input
                      type="range"
                      min="-50"
                      max="50"
                      step="1"
                      value={imageSettings.contrast}
                      onChange={(e) =>
                        setEditorSetting("contrast", Number(e.target.value))
                      }
                      className="w-full accent-[#0067b8]"
                    />
                  </label>

                  <label className="flex items-center justify-between border border-gray-200 p-3 rounded-md">
                    <span className="text-sm font-semibold text-gray-700">
                      Hitam Putih / Grayscale
                    </span>
                    <input
                      type="checkbox"
                      checked={imageSettings.grayscale}
                      onChange={(e) =>
                        setEditorSetting("grayscale", e.target.checked)
                      }
                      className="h-5 w-5 accent-[#0067b8]"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-3 gap-2 mt-4">
                  <button
                    type="button"
                    onClick={resetEditor}
                    className="py-2.5 border-2 border-gray-300 font-semibold text-gray-700 rounded-md"
                  >
                    Reset
                  </button>
                  <button
                    type="button"
                    onClick={cancelEditor}
                    className="py-2.5 border-2 border-gray-300 font-semibold text-gray-700 rounded-md"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={applyEditorAndCompress}
                    disabled={isRenderingPreview || isApplyingEditor}
                    className="py-2.5 bg-[#0067b8] text-white font-semibold rounded-md disabled:opacity-50"
                  >
                    Terapkan
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}

      {/* ===============================
          SUCCESS POPUP
          =============================== */}
      {successMessage && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-none p-8 shadow-2xl text-center max-w-xs w-full">
            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100 mb-4 border border-green-200">
              <svg
                className="h-10 w-10 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              Berhasil!
            </h3>
            <p className="text-sm text-gray-600">{successMessage}</p>
          </div>
        </div>
      )}

      {/* ===============================
          MAIN FORM
          =============================== */}
      <div className="bg-white p-4 rounded-none shadow space-y-4 relative border border-gray-200">
        {/* PREFIX */}
        <div>
          <label className="text-sm font-semibold">Prefix Kode</label>
          <input
            value={form.code_prefix}
            onChange={(e) =>
              setForm((p) => ({
                ...p,
                code_prefix: e.target.value.toUpperCase(),
              }))
            }
            placeholder="Contoh: K"
            className="w-full border-b border-gray-300 focus:border-[#0067b8] p-2 bg-gray-50 font-mono focus:outline-none transition-colors"
          />
        </div>

        {/* CODE */}
        <div>
          <label className="text-sm font-semibold">Kode Transaksi</label>
          <input
            value={form.transaction_code}
            onChange={(e) => {
              setManualCode(true);
              setForm((p) => ({
                ...p,
                transaction_code: e.target.value,
              }));
            }}
            className="w-full border-b border-gray-300 focus:border-[#0067b8] p-2 bg-gray-50 font-mono focus:outline-none transition-colors"
          />
        </div>

        {/* DATE */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-semibold">Tanggal Transaksi</label>
            <div className="flex items-center gap-1 bg-gray-100 p-0.5 border border-gray-300 text-xs">
              <button
                type="button"
                onClick={() => setDatePickerMode("calendar")}
                className={`px-2 py-1 font-medium transition-colors ${
                  datePickerMode === "calendar"
                    ? "bg-[#0067b8] text-white shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Kalender
              </button>
              <button
                type="button"
                onClick={() => setDatePickerMode("dropdown")}
                className={`px-2 py-1 font-medium transition-colors ${
                  datePickerMode === "dropdown"
                    ? "bg-[#0067b8] text-white shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Dropdown
              </button>
            </div>
          </div>

          {datePickerMode === "calendar" ? (
            <input
              type="date"
              name="date"
              value={form.date}
              onChange={handleChange}
              className="w-full border p-2 rounded-none focus:outline-none focus:ring-1 focus:ring-[#0067b8] focus:border-[#0067b8]"
            />
          ) : (
            <div className="grid grid-cols-3 gap-2">
              <div>
                <span className="text-[11px] text-gray-500 font-medium block mb-0.5">
                  Tanggal
                </span>
                <select
                  value={dateDay}
                  onChange={(e) => handleDatePartChange("day", e.target.value)}
                  className="w-full border p-2 rounded-none bg-white focus:outline-none focus:ring-1 focus:ring-[#0067b8]"
                >
                  {daysList.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <span className="text-[11px] text-gray-500 font-medium block mb-0.5">
                  Bulan
                </span>
                <select
                  value={dateMonth}
                  onChange={(e) =>
                    handleDatePartChange("month", e.target.value)
                  }
                  className="w-full border p-2 rounded-none bg-white focus:outline-none focus:ring-1 focus:ring-[#0067b8]"
                >
                  {monthsList.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <span className="text-[11px] text-gray-500 font-medium block mb-0.5">
                  Tahun
                </span>
                <select
                  value={dateYear}
                  onChange={(e) => handleDatePartChange("year", e.target.value)}
                  className="w-full border p-2 rounded-none bg-white focus:outline-none focus:ring-1 focus:ring-[#0067b8]"
                >
                  {yearsList.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* SUMBER SLIP BULANAN */}
        {!isEdit && (
          <div className="border border-blue-200 bg-blue-50 p-3 space-y-2">
            <div>
              <label className="text-sm font-semibold text-blue-900">
                Ambil dari Slip Bulanan
              </label>
              <p className="text-[11px] text-blue-700 mt-0.5">
                Menampilkan slip bulanan berstatus terbit atau dibayar untuk {monthsList.find((item) => item.value === dateMonth)?.label || "bulan terpilih"} {dateYear}.
              </p>
            </div>
            <select
              value={selectedMonthlySlip}
              onChange={(event) => applyMonthlySlip(event.target.value)}
              disabled={monthlySlipsLoading}
              className="w-full border border-blue-300 bg-white p-2 rounded-none focus:outline-none focus:ring-1 focus:ring-[#0067b8] disabled:bg-gray-100"
            >
              <option value="">
                {monthlySlipsLoading
                  ? "Memuat slip bulanan..."
                  : monthlySlips.length
                    ? "-- Pilih slip bulanan --"
                    : "Tidak ada slip bulanan terbit atau dibayar"}
              </option>
              {monthlySlips.map((slip) => (
                <option key={slip.id} value={String(slip.id)}>
                  {slip.employee_name} · {slip.document_reference} · {formatCurrency(slip.total_before_adjustments)}
                </option>
              ))}
            </select>
            {monthlySlipsError && (
              <p className="text-xs text-red-700">{monthlySlipsError}</p>
            )}
            {selectedMonthlySlip && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-green-700 font-medium">
                  Data slip sudah diterapkan dan tetap dapat diedit.
                </p>
                <button
                  type="button"
                  onClick={() => setPendingReceiptSlip(monthlySlips.find((slip) => String(slip.id) === selectedMonthlySlip) || null)}
                  className="text-xs font-semibold text-[#0067b8] underline"
                >
                  Buat ulang bukti slip
                </button>
              </div>
            )}
          </div>
        )}

        {/* STATUS */}
        <div>
          <label className="text-sm font-semibold">Status</label>
          <select
            name="status"
            value={form.status}
            onChange={handleChange}
            className="w-full border p-2 rounded-none focus:outline-none focus:ring-1 focus:ring-[#0067b8] focus:border-[#0067b8]"
          >
            <option value="non">Non Produksi</option>
            <option value="produksi">Produksi</option>
          </select>
        </div>

        {/* CATEGORY */}
        <div>
          <label className="text-sm font-semibold">Kategori</label>
          <select
            name="category_id"
            value={form.category_id}
            onChange={handleChange}
            className="w-full border p-2 rounded-none focus:outline-none focus:ring-1 focus:ring-[#0067b8] focus:border-[#0067b8]"
          >
            <option value="">-- Pilih Kategori --</option>
            {categories.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* AMOUNT */}
        <div>
          <label className="text-sm font-semibold">Jumlah</label>
          <input
            name="amount"
            value={form.amount}
            onChange={handleChange}
            className="w-full border-b border-gray-300 focus:border-[#0067b8] p-2 bg-gray-50 text-right focus:outline-none transition-colors"
          />
        </div>

        {/* DETAIL */}
        <div>
          <label className="text-sm font-semibold">Keterangan</label>
          <textarea
            name="detail"
            value={form.detail}
            onChange={handleChange}
            className="w-full border p-2 rounded-none focus:outline-none focus:ring-1 focus:ring-[#0067b8] focus:border-[#0067b8]"
          />
        </div>

        {/* IS POSTED */}
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" checked={form.is_posted} disabled />
          Sudah diposting (oleh sistem)
        </label>

        {/* IMAGE PREVIEW */}
        {isImageLoading && (
          <div className="flex h-28 w-full items-center justify-center border bg-gray-50 px-4 text-center text-sm text-gray-500">
            Membaca dan menyiapkan gambar...
          </div>
        )}
        {(existingReceipts.length > 0 || newReceipts.length > 0) && (
          <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-gray-700">Bukti Transaksi</div>
              <span className="text-xs text-gray-500">{existingReceipts.length + newReceipts.length}/5 foto</span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {existingReceipts.map((receipt) => (
                <div key={`existing-${receipt.id}`} className="space-y-2 border bg-white p-2">
                  <ReceiptImage expenseId={id} receipt={receipt} alt="Bukti transaksi" className="h-32 w-full object-cover" />
                  <div className="grid grid-cols-2 gap-1">
                    <button type="button" onClick={() => editExistingReceipt(receipt)} className="border border-[#0067b8] py-1 text-xs font-semibold text-[#0067b8]">Edit</button>
                    <button type="button" onClick={() => removeExistingReceipt(receipt.id)} className="border border-red-300 py-1 text-xs font-semibold text-red-600">Hapus</button>
                  </div>
                </div>
              ))}
              {newReceipts.map((receipt, index) => (
                <div key={receipt.previewUrl} className="space-y-2 border border-blue-200 bg-white p-2">
                  <img src={receipt.previewUrl} alt={`Bukti baru ${index + 1}`} className="h-32 w-full object-cover" />
                  <div className="grid grid-cols-2 gap-1">
                    <button type="button" onClick={() => editNewReceipt(receipt, index)} className="border border-[#0067b8] py-1 text-xs font-semibold text-[#0067b8]">Edit</button>
                    <button type="button" onClick={() => removeNewReceipt(index)} className="border border-red-300 py-1 text-xs font-semibold text-red-600">Hapus</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {deletedReceiptIds.length > 0 && (
          <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
            {deletedReceiptIds.length} referensi foto akan dihapus saat perubahan disimpan. File asli tetap aman di S3 sebagai orphan.
          </div>
        )}

        {/* IMAGE INPUT */}
        <div className="space-y-2">
          <label className="text-sm font-semibold text-gray-700">
            Bukti Transaksi
          </label>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={startCamera}
              disabled={isImageLoading || existingReceipts.length + newReceipts.length >= 5}
              className="py-3 bg-[#0067b8] text-white font-semibold rounded-none active:bg-[#005a9e] disabled:opacity-50"
            >
              📷 Ambil Foto
            </button>
            <button
              type="button"
              onClick={chooseExistingFile}
              disabled={isImageLoading || existingReceipts.length + newReceipts.length >= 5}
              className="py-3 border-2 border-gray-300 text-gray-700 font-semibold rounded-none active:bg-gray-100 disabled:opacity-50"
            >
              🖼️ Tambah File
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.heic,.heif"
            onChange={onSelectFile}
            className="hidden"
          />

          <p className="text-[11px] text-gray-500">
            Ambil Foto membuka kamera belakang Chrome. Pilih File digunakan untuk
            satu atau beberapa foto sekaligus, termasuk JPG, PNG, WebP, HEIC, dan HEIF
            (maksimal 25 MB per foto, maksimal 5 foto). Semua gambar dapat diedit sebelum disimpan.
          </p>
        </div>

        {/* SAVE */}
        <button
          onClick={submit}
          disabled={isSaving || isImageLoading}
          className={`w-full py-2 rounded-none font-semibold transition-colors ${
            isSaving || isImageLoading
              ? "bg-[#80b3dc] text-white cursor-not-allowed"
              : "bg-[#0067b8] text-white hover:bg-[#005a9e]"
          }`}
        >
          {isSaving ? "Menyimpan..." : isImageLoading ? "Menyiapkan gambar..." : "Simpan"}
        </button>

        {/* DELETE */}
        {isEdit && (
          <button
            onClick={() => setShowDelete(true)}
            disabled={isSaving}
            className="w-full border-2 border-[#d13438] text-[#d13438] hover:bg-[#fdf3f4] py-2 rounded-none font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Hapus
          </button>
        )}
      </div>

      <ConfirmModal
        open={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={deleteExpenseSafe}
      />
      <ConfirmModal
        open={Boolean(pendingReceiptSlip)}
        title="Gunakan slip sebagai bukti?"
        message="Frontend akan membuat gambar ringkasan slip bulanan dan menambahkannya sebagai bukti transaksi."
        confirmLabel="Tambah bukti slip"
        confirmClassName="bg-[#0067b8] text-white"
        busy={isGeneratingSlipReceipt}
        onClose={() => setPendingReceiptSlip(null)}
        onConfirm={confirmMonthlySlipReceipt}
      />
    </MobileLayout>
  );
}
