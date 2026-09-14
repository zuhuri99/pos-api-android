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
      product_variations: [{ variations: [{
        id: 10, name: "DUMMY", sub_sku: "SKU-1", sell_price_inc_tax: "5000",
        variation_location_details: [{ location_id: 1, qty_available: "10" }],
      }] }],
    }],
  });
  await store.addInvoiceNumbers(["P1020260001"]);
  const invoice = await store.takeInvoiceNumber("2026-10-14 10:00:00");
  assert.equal(invoice, "P1020260001");

  const sale = await store.saveLocalSale({
    invoice_no: invoice, location_id: 1, contact_id: 1,
    transaction_date: "2026-10-14 10:00:00", status: "final",
    products: [{ product_id: 1, variation_id: 10, quantity: 2, unit_price: 5000 }],
    payments: [{ amount: 10000, method: "cash" }],
  });
  assert.equal((await store.getLocalStock(1))[0].stock, "8");
  await store.queueLocalSaleDelete(sale.client_transaction_id, "Salah input barang");
  assert.equal((await store.getLocalStock(1))[0].stock, "10");
  assert.equal((await store.listLocalSales()).length, 0);
  const operations = await store.pendingOperations();
  assert.equal(operations.length, 2);

  await store.markOperationSynced(operations[0].operation_id, {
    server_id: 99, invoice_no: invoice, revision: 1,
  });
  assert.equal((await store.pendingOperations()).length, 1);
  await store.markOperationSynced(operations[1].operation_id, {
    server_id: 99, invoice_no: invoice, revision: 2,
  });
  assert.equal((await store.pendingOperations()).length, 0);
  assert.equal(await store.getLocalSale(sale.client_transaction_id), null);
});
