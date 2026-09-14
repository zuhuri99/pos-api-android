import test from "node:test";
import assert from "node:assert/strict";

const values = new Map();
globalThis.localStorage = {
  getItem: (key) => values.get(key) || null,
  setItem: (key, value) => values.set(key, value),
};

const store = await import("../src/features/offline/localStore.js");

test("transaksi offline tersimpan atomik di outbox dan mengurangi stok lokal", async () => {
  await store.replaceCatalog({
    cursor: 0,
    locations: [{ id: 1, name: "Toko" }],
    contacts: [{ id: 1, name: "Umum" }],
    products: [{
      id: 1, name: "Produk", sku: "SKU-1", enable_stock: 1,
      is_active: 1, is_inactive: 0,
      product_variations: [{ variations: [{
        id: 10, name: "DUMMY", sub_sku: "SKU-1", sell_price_inc_tax: "5000",
        variation_location_details: [{ location_id: 1, qty_available: "10" }],
      }] }],
    }, {
      id: 2, name: "Produk Nonaktif", sku: "SKU-2", enable_stock: 1,
      is_active: 0, is_inactive: 1,
      product_variations: [{ variations: [{
        id: 20, name: "DUMMY", sub_sku: "SKU-2", sell_price_inc_tax: "7000",
        variation_location_details: [{ location_id: 1, qty_available: "5" }],
      }] }],
    }, {
      id: 3, name: "Produk Tanpa Status", sku: "SKU-3", enable_stock: 1,
      product_variations: [],
    }, {
      id: 4, name: "Produk Aktif String", sku: "SKU-4", enable_stock: 1,
      is_active: "true", product_variations: [],
    }],
  });
  assert.deepEqual((await store.searchLocalProducts({ per_page: 100 })).map((product) => product.id), [1, 4]);
  await store.addInvoiceNumbers(["P1020260001"]);
  const invoice = await store.peekInvoiceNumber("2026-10-14 10:00:00");
  assert.equal(invoice, "P1020260001");
  assert.equal(await store.peekInvoiceNumber("2026-10-14 10:00:00"), "P1020260001");

  const sale = await store.saveLocalSale({
    invoice_no: invoice, location_id: 1, contact_id: 1,
    transaction_date: "2026-10-14 10:00:00", status: "final",
    products: [{ product_id: 1, variation_id: 10, quantity: 2, unit_price: 5000 }],
    payments: [{ amount: 10000, method: "cash" }],
  });
  assert.equal(await store.peekInvoiceNumber("2026-10-14 10:00:00"), "");
  assert.equal((await store.getLocalStock(1))[0].stock, "8");
  await store.saveLocalSale({
    ...sale,
    products: [{ product_id: 1, variation_id: 10, quantity: 1, unit_price: 5000 }],
    payments: [{ amount: 5000, method: "cash" }],
  }, "update", sale.client_transaction_id);
  assert.equal((await store.getLocalStock(1))[0].stock, "9");
  const markedSale = await store.queueLocalSaleMark(sale.client_transaction_id, "other", "Perlu dicek ulang");
  assert.equal(markedSale.mark_type, "other");
  assert.equal(markedSale.mark_reason, "Perlu dicek ulang");
  assert.equal((await store.getLocalStock(1))[0].stock, "9");
  await store.queueLocalSaleDelete(sale.client_transaction_id, "Salah input barang");
  assert.equal((await store.getLocalStock(1))[0].stock, "10");
  assert.equal((await store.listLocalSales()).length, 0);
  const operations = await store.pendingOperations();
  assert.equal(operations.length, 4);
  const syncStats = await store.offlineStats();
  assert.equal(syncStats.queue.length, 4);
  assert.equal(syncStats.queue[2].action, "mark");
  assert.equal(syncStats.queue[3].invoice_no, invoice);
  assert.equal(syncStats.recent.length, 4);
  assert.equal(syncStats.recent[0].action, "delete");
  assert.equal(syncStats.recent[0].status, "pending");
  assert.ok(syncStats.recent[0].activity_at);

  await store.markOperationSynced(operations[0].operation_id, {
    server_id: 99, invoice_no: invoice, revision: 1,
  });
  assert.equal((await store.pendingOperations()).length, 3);
  await store.markOperationSynced(operations[1].operation_id, {
    server_id: 99, invoice_no: invoice, revision: 2,
  });
  assert.equal((await store.pendingOperations()).length, 2);
  await store.markOperationSynced(operations[2].operation_id, {
    server_id: 99, invoice_no: invoice, revision: 3,
  });
  assert.equal((await store.pendingOperations()).length, 1);
  await store.markOperationSynced(operations[3].operation_id, {
    server_id: 99, invoice_no: invoice, revision: 4,
  });
  assert.equal((await store.pendingOperations()).length, 0);
  assert.equal(await store.getLocalSale(sale.client_transaction_id), null);
  const completedStats = await store.offlineStats();
  assert.equal(completedStats.recent.length, 4);
  assert.ok(completedStats.recent.every((activity) => activity.status === "synced"));

  await store.recordSaleActivity({
    activity_id: "activity-newer", entity_id: "old-transaction", invoice_no: "NOTA-LAMA",
    action: "update", activity_at: "2099-01-01T10:00:00.000Z",
  });
  await store.recordSaleActivity({
    activity_id: "activity-older", entity_id: "new-transaction", invoice_no: "NOTA-BARU",
    action: "create", activity_at: "2000-01-01T10:00:00.000Z",
  });
  const activityOrderedStats = await store.offlineStats();
  assert.equal(activityOrderedStats.recent[0].invoice_no, "NOTA-LAMA");
  assert.equal(activityOrderedStats.recent[0].action, "update");
});
