export const formatPosCurrency = (value) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);

export const localTransactionDate = () => {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

export const posInvoicePrefix = () => "P";

export const nextPosInvoiceNumber = (groupedTransactions, _prefix, year, month) => {
  const firstSequence = 1;
  const maxSequence = 9999;
  const normalizedMonth = String(month).padStart(2, "0");
  const stem = `P${normalizedMonth}${year}`;
  const invoices = Array.isArray(groupedTransactions)
    ? groupedTransactions
    : Object.values(groupedTransactions || {}).flatMap((items) =>
      Array.isArray(items) ? items : [],
    );
  const foundSequence = invoices.reduce((largest, transaction) => {
    const invoiceNumber = String(transaction?.invoice_no || "").toUpperCase();
    if (!invoiceNumber.startsWith(stem)) return largest;
    const suffix = invoiceNumber.slice(stem.length);
    if (!/^\d{4}$/.test(suffix)) return largest;
    const sequence = Number(suffix);
    if (sequence < firstSequence || sequence > maxSequence) return largest;
    return Math.max(largest, sequence);
  }, firstSequence - 1);

  if (foundSequence >= maxSequence) {
    throw new RangeError(`Rentang nomor invoice ${stem}0001-${stem}9999 sudah habis.`);
  }

  return `${stem}${String(foundSequence + 1).padStart(4, "0")}`;
};

export const flattenPosProducts = (products, locationId) => {
  const rows = [];
  (products || []).forEach((product) => {
    (product.product_variations || []).forEach((group) => {
      (group.variations || []).forEach((variation) => {
        const location = (variation.variation_location_details || []).find(
          (item) => !locationId || Number(item.location_id) === Number(locationId),
        );
        rows.push({
          product_id: product.id,
          variation_id: variation.id,
          product_name: product.name,
          variation_name:
            variation.name && variation.name !== "DUMMY" ? variation.name : "",
          sku: variation.sub_sku || product.sku || "",
          unit_price: Number(
            variation.sell_price_inc_tax || variation.default_sell_price || 0,
          ),
          stock: location?.qty_available,
          image_url: product.image_url || "",
          enable_stock: Number(product.enable_stock || 0),
          tax_rate_id: 0,
        });
      });
    });
  });
  return rows;
};

export const indexPosStock = (records, sourceUser, locationId) => {
  const index = {};
  (records || []).forEach((record) => {
    if (
      sourceUser &&
      record._source_user &&
      record._source_user !== sourceUser
    ) return;

    const enableStock = Number(record.enable_stock) === 1;
    if (
      enableStock &&
      locationId &&
      Number(record.location_id) !== Number(locationId)
    ) return;

    const variationId = record.variation_id;
    if (!variationId) return;
    index[String(variationId)] = {
      enable_stock: enableStock ? 1 : 0,
      stock: enableStock ? Math.max(0, Number(record.stock) || 0) : null,
    };
  });
  return index;
};

export const applyPosStock = (product, stockIndex) => {
  const inventory = stockIndex[String(product.variation_id)];
  if (inventory) return { ...product, ...inventory };
  return {
    ...product,
    enable_stock: Number(product.enable_stock) === 1 ? 1 : 0,
    stock: Number(product.enable_stock) === 1 ? 0 : null,
  };
};

export const getPosApiError = (error, fallback) => {
  const detail = error?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (detail?.message) return detail.message;
  if (Array.isArray(detail)) {
    return detail.map((item) => item.msg || String(item)).join("; ");
  }
  if (detail && typeof detail === "object") return JSON.stringify(detail);
  return fallback;
};
