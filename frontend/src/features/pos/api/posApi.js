import incomeApi from "../../../api/incomeAxios";
import { getLoginDeviceInfo } from "../../../platform/deviceInfo";
import {
  getCatalogBootstrap,
  getLocalContacts,
  getLocalSale,
  getLocalStock,
  listLocalSales,
  queueLocalSaleDelete,
  saveLocalSale,
  searchLocalProducts,
  takeInvoiceNumber,
} from "../../offline/localStore";
import { replenishInvoices, syncNow } from "../../offline/syncEngine";

const response = (data, extra = {}) => ({ data: { data, ...extra } });

async function ensureCatalog() {
  let bootstrap = await getCatalogBootstrap();
  if (!bootstrap.locations.length && navigator.onLine) {
    await syncNow();
    bootstrap = await getCatalogBootstrap();
  }
  return bootstrap;
}

async function hydrateProducts(lines) {
  const catalog = await searchLocalProducts({ per_page: 100000 });
  const variations = new Map();
  catalog.forEach((product) => (product.product_variations || []).forEach((group) => (group.variations || []).forEach((variation) => {
    variations.set(Number(variation.id), { product, variation });
  })));
  return lines.map((line) => {
    const found = variations.get(Number(line.variation_id));
    return {
      ...line,
      product_name: line.product_name || found?.product?.name || "Produk",
      variation_name: line.variation_name || (found?.variation?.name === "DUMMY" ? "" : found?.variation?.name) || "",
    };
  });
}

export const posApi = {
  async stockReport(locationId) {
    return response(await getLocalStock(locationId));
  },
  async incomeForYear(year) {
    return response({ pos: await listLocalSales(year) });
  },
  async nextInvoice(transactionDate) {
    let number = await takeInvoiceNumber(transactionDate);
    if (!number && navigator.onLine) {
      await replenishInvoices(transactionDate);
      number = await takeInvoiceNumber(transactionDate);
    }
    if (!number) throw new Error("Persediaan nomor invoice offline habis. Hubungkan internet untuk mengambil nomor baru.");
    return number;
  },
  async bootstrap() {
    return response(await ensureCatalog());
  },
  async products(params) {
    return response(await searchLocalProducts(params));
  },
  async contacts() {
    return response(await getLocalContacts());
  },
  qrisUrl(payload) {
    if (!navigator.onLine) return Promise.reject(new Error("QRIS hanya tersedia saat online."));
    return incomeApi.post("/income/pos/qris-url", payload, { skipIncomeFallback: true });
  },
  async transaction(id) {
    const local = await getLocalSale(String(id));
    if (local) return response(local, { success: true });
    return incomeApi.get(`/income/pos/transactions/${id}`, { skipIncomeFallback: true });
  },
  async invoice(id) {
    const local = await getLocalSale(String(id));
    if (local) {
      const bootstrap = await getCatalogBootstrap();
      const contact = (await getLocalContacts()).find((row) => Number(row.id) === Number(local.contact_id));
      const location = bootstrap.locations.find((row) => Number(row.id) === Number(local.location_id));
      const sellLines = (local.products || []).map((line, index) => ({
        id: line.sell_line_id || index + 1,
        ...line,
        unit_price_inc_tax: line.unit_price,
        line_discount_type: line.discount_type,
        line_discount_amount: line.discount_amount,
        sell_line_note: line.note,
      }));
      const subtotal = sellLines.reduce((sum, line) => sum + Number(line.quantity) * Number(line.unit_price), 0);
      const discount = local.discount_type === "percentage" ? subtotal * Number(local.discount_amount || 0) / 100 : Number(local.discount_amount || 0);
      const finalTotal = Math.max(0, subtotal - discount + Number(local.shipping_charges || 0) + Number(local.packing_charge || 0));
      const paid = (local.payments || []).reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
      return response({
        ...local,
        contact: contact?.name || "Umum",
        location_name: location?.name || "-",
        _source_user: "pos",
        sell_lines: sellLines,
        payment_lines: local.payments || [],
        total_before_tax: subtotal,
        final_total: finalTotal,
        tax_amount: 0,
        payment_status: paid >= finalTotal ? "paid" : paid > 0 ? "partial" : "due",
      }, { success: true });
    }
    return incomeApi.get(`/income/pos/transactions/${id}/invoice`, { skipIncomeFallback: true });
  },
  async create(payload) {
    const device = await getLoginDeviceInfo();
    const local = await saveLocalSale({
      ...payload,
      client_transaction_id: crypto.randomUUID(),
      device_id: device.device_id || "android-pos",
      products: await hydrateProducts(payload.products),
    });
    if (navigator.onLine) syncNow().catch(() => {});
    return response(local, { success: true });
  },
  async update(id, payload) {
    const existing = await getLocalSale(String(id));
    if (!existing) throw new Error("Edit offline hanya tersedia untuk transaksi yang tersimpan di perangkat ini.");
    if (existing.status === "final") throw new Error("Transaksi final tidak dapat diedit. Gunakan void/koreksi transaksi.");
    const local = await saveLocalSale({ ...existing, ...payload, products: await hydrateProducts(payload.products) }, "update", existing.client_transaction_id);
    if (navigator.onLine) syncNow().catch(() => {});
    return response(local, { success: true });
  },
  async remove(id, reason) {
    const existing = await getLocalSale(String(id));
    if (existing) {
      const local = await queueLocalSaleDelete(String(id), reason);
      if (navigator.onLine) syncNow().catch(() => {});
      return response(local, { success: true });
    }
    if (!navigator.onLine) throw new Error("Transaksi tidak tersedia di perangkat untuk dihapus secara offline.");
    return incomeApi.delete(`/income/pos/transactions/${id}`, {
      data: { reason },
      skipIncomeFallback: true,
    });
  },
};
