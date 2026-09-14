export const WIB_TIME_ZONE = "Asia/Jakarta";

export const parseWibDateTime = (value) => {
  if (value instanceof Date) return value;
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return new Date(`${raw}T00:00:00+07:00`);
  const normalized = raw.replace(" ", "T");
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
  return new Date(hasZone ? normalized : `${normalized}+07:00`);
};

export const formatWib = (value, options) => {
  const date = parseWibDateTime(value);
  if (!date || Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: WIB_TIME_ZONE,
    ...options,
  }).format(date);
};

export const formatWibDate = (value, options = {}) => formatWib(value, {
  day: "2-digit",
  month: "short",
  year: "numeric",
  ...options,
});

export const formatWibDateTime = (value, options = {}) => formatWib(value, {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZoneName: "short",
  ...options,
});

export const currentWibDateTime = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: WIB_TIME_ZONE,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const part = (type) => parts.find((item) => item.type === type)?.value || "00";
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}:${part("second")}`;
};

export const currentWibYear = () => Number(new Intl.DateTimeFormat("en", {
  timeZone: WIB_TIME_ZONE,
  year: "numeric",
}).format(new Date()));

export const wibYearMonth = (value = new Date()) => {
  const date = parseWibDateTime(value);
  if (!date || Number.isNaN(date.getTime())) return { year: 0, month: 0 };
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: WIB_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const part = (type) => Number(parts.find((item) => item.type === type)?.value || 0);
  return { year: part("year"), month: part("month") };
};
