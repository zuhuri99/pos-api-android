const STORAGE_KEY = "finance.pos.payment-aliases.v1";

const readAll = () => {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return stored && typeof stored === "object" ? stored : {};
  } catch {
    return {};
  }
};

export const getPaymentAliases = (sourceUser) => ({
  ...(readAll()[sourceUser || "default"] || {}),
});

export const savePaymentAliases = (sourceUser, aliases) => {
  const all = readAll();
  all[sourceUser || "default"] = Object.fromEntries(
    Object.entries(aliases).filter(([, alias]) => String(alias || "").trim()),
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
};

export const paymentAliasLabel = (sourceUser, method, fallback) => {
  const alias = getPaymentAliases(sourceUser)[method];
  if (alias) return alias;
  if (fallback) return fallback;
  return String(method || "Pembayaran")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
};
