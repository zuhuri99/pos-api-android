import { readServerProfile } from "../../config/serverProfile";
import { getApiBaseUrl } from "../../config/apiEndpoints";

export const formatCurrency = (value) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);

export const formatDayCount = (value) =>
  new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);

export const formatDate = (value, options = {}) => {
  if (!value) return "-";
  const raw = String(value).length === 10 ? `${value}T00:00:00` : value;
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...options,
  }).format(new Date(raw));
};

export const todayLocal = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60000).toISOString().slice(0, 10);
};

export const buildSlipValidationUrl = (slip) => {
  if (!slip) return "";
  const configuredBase = import.meta.env.VITE_URL_VALIDASI_SLIP || readServerProfile()?.serverUrl;
  if (configuredBase) {
    return `${configuredBase.replace(/\/+$/, "")}/verify/${slip.public_token}`;
  }
  const apiOrigin = new URL(getApiBaseUrl(), window.location.origin).origin;
  return `${apiOrigin}${slip.verification_path}`;
};

export const statusLabels = {
  active: "Aktif",
  inactive: "Tidak aktif",
  resigned: "Keluar",
  draft: "Draft",
  calculated: "Dihitung",
  published: "Terbit",
  paid: "Dibayar",
  cancelled: "Dibatalkan",
  replaced: "Diganti",
  present: "Hadir",
  half_day: "Setengah hari",
  sick: "Sakit",
  permission: "Izin",
  absent: "Tidak hadir",
  holiday: "Libur",
  leave: "Cuti",
  cash_advance: "Kasbon",
  employee_loan: "Utang karyawan",
};

export const statusClass = (status) => {
  if (["active", "published", "paid", "present"].includes(status)) return "bg-green-50 text-green-700 border-green-200";
  if (["draft", "calculated", "half_day", "permission"].includes(status)) return "bg-amber-50 text-amber-700 border-amber-200";
  if (["cancelled", "resigned", "absent"].includes(status)) return "bg-red-50 text-red-700 border-red-200";
  return "bg-gray-100 text-gray-700 border-gray-200";
};

const numberWords = ["", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan", "sepuluh", "sebelas"];

const spellNumber = (value) => {
  const number = Math.floor(Math.abs(Number(value) || 0));
  if (number < 12) return numberWords[number];
  if (number < 20) return `${spellNumber(number - 10)} belas`;
  if (number < 100) return `${spellNumber(Math.floor(number / 10))} puluh ${spellNumber(number % 10)}`;
  if (number < 200) return `seratus ${spellNumber(number - 100)}`;
  if (number < 1000) return `${spellNumber(Math.floor(number / 100))} ratus ${spellNumber(number % 100)}`;
  if (number < 2000) return `seribu ${spellNumber(number - 1000)}`;
  if (number < 1000000) return `${spellNumber(Math.floor(number / 1000))} ribu ${spellNumber(number % 1000)}`;
  if (number < 1000000000) return `${spellNumber(Math.floor(number / 1000000))} juta ${spellNumber(number % 1000000)}`;
  if (number < 1000000000000) return `${spellNumber(Math.floor(number / 1000000000))} miliar ${spellNumber(number % 1000000000)}`;
  return `${spellNumber(Math.floor(number / 1000000000000))} triliun ${spellNumber(number % 1000000000000)}`;
};

export const terbilangRupiah = (value) => {
  const number = Number(value) || 0;
  const words = spellNumber(number).replace(/\s+/g, " ").trim();
  return `${number < 0 ? "minus " : ""}${words || "nol"} rupiah`;
};
