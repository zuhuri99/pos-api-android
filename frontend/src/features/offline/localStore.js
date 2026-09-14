import { isNative } from "../../platform/native.js";

const WEB_KEY = "pos.offline.store.v1";
const emptyWebStore = () => ({
  meta: {}, products: [], contacts: [], locations: [], sales: [], outbox: [], invoices: [],
});
let connectionPromise;

const readWeb = () => {
  try { return { ...emptyWebStore(), ...JSON.parse(localStorage.getItem(WEB_KEY) || "{}") }; }
  catch { return emptyWebStore(); }
};
const writeWeb = (data) => localStorage.setItem(WEB_KEY, JSON.stringify(data));

async function nativeDb() {
  if (!isNative) return null;
  if (!connectionPromise) {
    connectionPromise = (async () => {
      const { CapacitorSQLite, SQLiteConnection } = await import("@capacitor-community/sqlite");
      const sqlite = new SQLiteConnection(CapacitorSQLite);
      const secret = await sqlite.isSecretStored();
      if (!secret.result) {
        await sqlite.setEncryptionSecret(`${crypto.randomUUID()}-${crypto.randomUUID()}`);
      }
      let db;
      try {
        db = await sqlite.retrieveConnection("pos_offline", false);
      } catch {
        db = await sqlite.createConnection("pos_offline", true, "secret", 1, false);
      }
      await db.open();
      await db.execute({ statements: `
        CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY NOT NULL, sku TEXT NOT NULL, name TEXT NOT NULL, payload TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
        CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
        CREATE TABLE IF NOT EXISTS contacts (id INTEGER PRIMARY KEY NOT NULL, name TEXT NOT NULL, payload TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS locations (id INTEGER PRIMARY KEY NOT NULL, name TEXT NOT NULL, payload TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS sales (local_id TEXT PRIMARY KEY NOT NULL, server_id INTEGER, invoice_no TEXT NOT NULL UNIQUE, transaction_date TEXT NOT NULL, state TEXT NOT NULL, payload TEXT NOT NULL, last_error TEXT);
        CREATE INDEX IF NOT EXISTS idx_sales_state ON sales(state);
        CREATE TABLE IF NOT EXISTS outbox (operation_id TEXT PRIMARY KEY NOT NULL, entity_id TEXT NOT NULL, action TEXT NOT NULL, payload TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT, created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS invoice_numbers (invoice_no TEXT PRIMARY KEY NOT NULL, period TEXT NOT NULL, used INTEGER NOT NULL DEFAULT 0);
        CREATE INDEX IF NOT EXISTS idx_invoice_available ON invoice_numbers(period, used, invoice_no);
      ` });
      return db;
    })();
  }
  return connectionPromise;
}

export async function initializeLocalStore() {
  await nativeDb();
}

export async function setMeta(key, value) {
  const db = await nativeDb();
  if (!db) { const data = readWeb(); data.meta[key] = String(value); writeWeb(data); return; }
  await db.run({ statement: "INSERT OR REPLACE INTO meta(key,value) VALUES (?,?)", values: [key, String(value)] });
}

export async function getMeta(key) {
  const db = await nativeDb();
  if (!db) return readWeb().meta[key] || "";
  const result = await db.query({ statement: "SELECT value FROM meta WHERE key=?", values: [key] });
  return result.values?.[0]?.value || "";
}

export async function replaceCatalog({ products = [], contacts = [], locations = [], cursor = 0 }) {
  const db = await nativeDb();
  if (!db) {
    const data = readWeb();
    Object.assign(data, { products, contacts, locations });
    data.meta.cursor = String(cursor);
    writeWeb(data);
    return;
  }
  await db.execute({ statements: "DELETE FROM products; DELETE FROM contacts; DELETE FROM locations;" });
  for (const product of products) {
    await db.run({ statement: "INSERT INTO products(id,sku,name,payload) VALUES (?,?,?,?)", values: [product.id, product.sku || "", product.name || "", JSON.stringify(product)] });
  }
  for (const contact of contacts) {
    await db.run({ statement: "INSERT INTO contacts(id,name,payload) VALUES (?,?,?)", values: [contact.id, contact.name || "", JSON.stringify(contact)] });
  }
  for (const location of locations) {
    await db.run({ statement: "INSERT INTO locations(id,name,payload) VALUES (?,?,?)", values: [location.id, location.name || "", JSON.stringify(location)] });
  }
  await setMeta("cursor", cursor);
}

export async function upsertProduct(product) {
  const db = await nativeDb();
  if (!db) {
    const data = readWeb();
    data.products = [...data.products.filter((row) => row.id !== product.id), product];
    writeWeb(data); return;
  }
  await db.run({ statement: "INSERT OR REPLACE INTO products(id,sku,name,payload) VALUES (?,?,?,?)", values: [product.id, product.sku || "", product.name || "", JSON.stringify(product)] });
}

function updateInventoryPayload(product, change) {
  return {
    ...product,
    product_variations: (product.product_variations || []).map((group) => ({
      ...group,
      variations: (group.variations || []).map((variation) => Number(variation.id) !== Number(change.variation_id) ? variation : ({
        ...variation,
        variation_location_details: (variation.variation_location_details || []).map((location) => Number(location.location_id) !== Number(change.location_id) ? location : ({
          ...location, qty_available: String(change.quantity), revision: change.revision,
        })),
      })),
    })),
  };
}

export async function applyInventoryChange(change) {
  const db = await nativeDb();
  if (!db) {
    const data = readWeb();
    data.products = data.products.map((product) => updateInventoryPayload(product, change));
    writeWeb(data); return;
  }
  const rows = (await db.query({ statement: "SELECT id,payload FROM products" })).values || [];
  for (const row of rows) {
    const product = JSON.parse(row.payload);
    const containsVariation = (product.product_variations || []).some((group) => (group.variations || []).some((variation) => Number(variation.id) === Number(change.variation_id)));
    if (containsVariation) {
      await db.run({ statement: "UPDATE products SET payload=? WHERE id=?", values: [JSON.stringify(updateInventoryPayload(product, change)), row.id] });
      return;
    }
  }
}

async function applySaleStock(db, data, payload) {
  if (payload.status !== "final") return;
  for (const line of payload.products || []) {
    const product = data
      ? data.products.find((row) => Number(row.id) === Number(line.product_id))
      : (() => null)();
    let nativeProduct = product;
    if (!data) {
      const row = (await db.query({ statement: "SELECT payload FROM products WHERE id=?", values: [Number(line.product_id)] })).values?.[0];
      nativeProduct = row ? JSON.parse(row.payload) : null;
    }
    if (!nativeProduct || Number(nativeProduct.enable_stock) !== 1) continue;
    let found = false;
    nativeProduct = {
      ...nativeProduct,
      product_variations: (nativeProduct.product_variations || []).map((group) => ({
        ...group,
        variations: (group.variations || []).map((variation) => {
          if (Number(variation.id) !== Number(line.variation_id)) return variation;
          return {
            ...variation,
            variation_location_details: (variation.variation_location_details || []).map((location) => {
              if (Number(location.location_id) !== Number(payload.location_id)) return location;
              found = true;
              const remaining = Number(location.qty_available || 0) - Number(line.quantity || 0);
              if (remaining < 0) throw new Error(`Stok ${nativeProduct.name} tidak mencukupi.`);
              return { ...location, qty_available: String(remaining) };
            }),
          };
        }),
      })),
    };
    if (!found) throw new Error(`Stok lokasi untuk ${nativeProduct.name} tidak tersedia.`);
    if (data) data.products = data.products.map((row) => row.id === nativeProduct.id ? nativeProduct : row);
    else await db.run({ statement: "UPDATE products SET payload=? WHERE id=?", values: [JSON.stringify(nativeProduct), nativeProduct.id] });
  }
}

async function restoreSaleStock(db, data, payload) {
  if (payload.status !== "final") return;
  for (const line of payload.products || []) {
    const product = data
      ? data.products.find((row) => Number(row.id) === Number(line.product_id))
      : null;
    let nativeProduct = product;
    if (!data) {
      const row = (await db.query({ statement: "SELECT payload FROM products WHERE id=?", values: [Number(line.product_id)] })).values?.[0];
      nativeProduct = row ? JSON.parse(row.payload) : null;
    }
    if (!nativeProduct || Number(nativeProduct.enable_stock) !== 1) continue;
    nativeProduct = {
      ...nativeProduct,
      product_variations: (nativeProduct.product_variations || []).map((group) => ({
        ...group,
        variations: (group.variations || []).map((variation) => Number(variation.id) !== Number(line.variation_id) ? variation : ({
          ...variation,
          variation_location_details: (variation.variation_location_details || []).map((location) => Number(location.location_id) !== Number(payload.location_id) ? location : ({
            ...location,
            qty_available: String(Number(location.qty_available || 0) + Number(line.quantity || 0)),
          })),
        })),
      })),
    };
    if (data) data.products = data.products.map((row) => row.id === nativeProduct.id ? nativeProduct : row);
    else await db.run({ statement: "UPDATE products SET payload=? WHERE id=?", values: [JSON.stringify(nativeProduct), nativeProduct.id] });
  }
}

const parseRows = (rows) => (rows || []).map((row) => JSON.parse(row.payload));

export async function getCatalogBootstrap() {
  const db = await nativeDb();
  let locations;
  if (!db) ({ locations } = readWeb());
  else {
    locations = parseRows((await db.query({ statement: "SELECT payload FROM locations ORDER BY name" })).values);
  }
  return {
    source_user: "pos", available_sources: [], locations,
    payment_methods: [{ name: "cash", label: "Tunai" }, { name: "bank_transfer", label: "Transfer/QRIS" }, { name: "other", label: "Lainnya" }],
  };
}

export async function searchLocalProducts({ name, sku, per_page = 50 } = {}) {
  const term = String(name || sku || "").trim().toLowerCase();
  const db = await nativeDb();
  const all = !db ? readWeb().products : parseRows((await db.query({ statement: "SELECT payload FROM products ORDER BY name" })).values);
  if (!term) return all.slice(0, per_page);
  return all.filter((product) => {
    const variations = product.product_variations?.flatMap((group) => group.variations || []) || [];
    const haystack = [product.name, product.sku, ...variations.flatMap((row) => [row.name, row.sub_sku])].join(" ").toLowerCase();
    return haystack.includes(term);
  }).slice(0, per_page);
}

export async function getLocalContacts() {
  const db = await nativeDb();
  return !db ? readWeb().contacts : parseRows((await db.query({ statement: "SELECT payload FROM contacts ORDER BY name" })).values);
}

export async function getLocalStock(locationId) {
  const products = await searchLocalProducts({ per_page: 100000 });
  return products.flatMap((product) => (product.product_variations || []).flatMap((group) => (group.variations || []).flatMap((variation) =>
    (variation.variation_location_details || [])
      .filter((location) => !locationId || Number(location.location_id) === Number(locationId))
      .map((location) => ({
        product_id: product.id, variation_id: variation.id, location_id: location.location_id,
        product: product.name, variation_name: variation.name, sku: variation.sub_sku,
        enable_stock: product.enable_stock, stock: location.qty_available,
      }))
  )));
}

export async function addInvoiceNumbers(numbers) {
  const db = await nativeDb();
  if (!db) {
    const data = readWeb();
    const known = new Set(data.invoices.map((row) => row.invoice_no));
    numbers.forEach((invoice_no) => { if (!known.has(invoice_no)) data.invoices.push({ invoice_no, period: invoice_no.slice(3, 7) + invoice_no.slice(1, 3), used: 0 }); });
    writeWeb(data); return;
  }
  for (const invoice of numbers) {
    const period = `${invoice.slice(3, 7)}${invoice.slice(1, 3)}`;
    await db.run({ statement: "INSERT OR IGNORE INTO invoice_numbers(invoice_no,period,used) VALUES (?,?,0)", values: [invoice, period] });
  }
}

export async function availableInvoiceCount(year, month) {
  const period = `${year}${String(month).padStart(2, "0")}`;
  const db = await nativeDb();
  if (!db) return readWeb().invoices.filter((row) => row.period === period && !row.used).length;
  const result = await db.query({ statement: "SELECT COUNT(*) AS count FROM invoice_numbers WHERE period=? AND used=0", values: [period] });
  return Number(result.values?.[0]?.count || 0);
}

export async function takeInvoiceNumber(dateValue) {
  const date = new Date(String(dateValue).replace(" ", "T"));
  const period = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}`;
  const db = await nativeDb();
  if (!db) {
    const data = readWeb();
    const row = data.invoices.filter((item) => item.period === period && !item.used).sort((a, b) => a.invoice_no.localeCompare(b.invoice_no))[0];
    if (!row) return "";
    row.used = 1; writeWeb(data); return row.invoice_no;
  }
  const result = await db.query({ statement: "SELECT invoice_no FROM invoice_numbers WHERE period=? AND used=0 ORDER BY invoice_no LIMIT 1", values: [period] });
  const invoice = result.values?.[0]?.invoice_no;
  if (!invoice) return "";
  await db.beginTransaction();
  try {
    const claimed = await db.run({ statement: "UPDATE invoice_numbers SET used=1 WHERE invoice_no=? AND used=0", values: [invoice] });
    if (!claimed.changes?.changes) { await db.rollbackTransaction(); return takeInvoiceNumber(dateValue); }
    await db.commitTransaction();
    return invoice;
  } catch (error) {
    await db.rollbackTransaction();
    throw error;
  }
}

export async function saveLocalSale(payload, action = "create", localId = null) {
  const entityId = localId || payload.client_transaction_id || crypto.randomUUID();
  const operationId = crypto.randomUUID();
  const stored = { ...payload, client_transaction_id: entityId, id: entityId, sync_state: "pending" };
  const db = await nativeDb();
  if (!db) {
    const data = readWeb();
    await applySaleStock(null, data, stored);
    data.sales = [...data.sales.filter((row) => row.local_id !== entityId), { local_id: entityId, server_id: null, invoice_no: stored.invoice_no, transaction_date: stored.transaction_date, state: "pending", payload: stored }];
    data.outbox.push({ operation_id: operationId, entity_id: entityId, action, payload: stored, attempts: 0, created_at: new Date().toISOString() });
    writeWeb(data); return stored;
  }
  await db.beginTransaction();
  try {
    await applySaleStock(db, null, stored);
    await db.run({ statement: "INSERT OR REPLACE INTO sales(local_id,server_id,invoice_no,transaction_date,state,payload,last_error) VALUES (?,COALESCE((SELECT server_id FROM sales WHERE local_id=?),NULL),?,?,?,?,NULL)", values: [entityId, entityId, stored.invoice_no, stored.transaction_date, "pending", JSON.stringify(stored)] });
    await db.run({ statement: "INSERT INTO outbox(operation_id,entity_id,action,payload,created_at) VALUES (?,?,?,?,?)", values: [operationId, entityId, action, JSON.stringify(stored), new Date().toISOString()] });
    await db.commitTransaction();
    return stored;
  } catch (error) {
    await db.rollbackTransaction();
    throw error;
  }
}

export async function getLocalSale(id) {
  const db = await nativeDb();
  let row;
  if (!db) row = readWeb().sales.find((item) => item.local_id === id || String(item.server_id) === String(id));
  else row = (await db.query({ statement: "SELECT payload,state,server_id,last_error FROM sales WHERE local_id=? OR server_id=? LIMIT 1", values: [String(id), Number(id) || -1] })).values?.[0];
  if (!row) return null;
  const payload = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
  return { ...payload, id: row.server_id || payload.id, sync_state: row.state, sync_error: row.last_error };
}

export async function listLocalSales(year) {
  const db = await nativeDb();
  const rows = !db ? readWeb().sales : (await db.query({ statement: "SELECT payload,state,server_id,last_error FROM sales ORDER BY transaction_date DESC" })).values || [];
  return rows.map((row) => ({ ...(typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload), id: row.server_id || row.local_id, sync_state: row.state }))
    .filter((row) => row.status !== "void" && (!year || String(row.transaction_date).startsWith(String(year))));
}

export async function queueLocalSaleDelete(id, reason = "Transaksi salah") {
  const operationId = crypto.randomUUID();
  const db = await nativeDb();
  if (!db) {
    const data = readWeb();
    const sale = data.sales.find((row) => row.local_id === String(id) || String(row.server_id) === String(id));
    if (!sale) throw new Error("Transaksi tidak ditemukan di perangkat.");
    if (sale.payload.status === "void") return sale.payload;
    await restoreSaleStock(null, data, sale.payload);
    sale.state = "pending_delete";
    sale.payload = { ...sale.payload, status: "void", payment_status: "void", void_reason: reason, sync_state: "pending_delete" };
    data.outbox.push({ operation_id: operationId, entity_id: sale.local_id, action: "delete", payload: { reason }, attempts: 0, created_at: new Date().toISOString() });
    writeWeb(data);
    return sale.payload;
  }
  await db.beginTransaction();
  try {
    const row = (await db.query({ statement: "SELECT local_id,payload FROM sales WHERE local_id=? OR server_id=? LIMIT 1", values: [String(id), Number(id) || -1] })).values?.[0];
    if (!row) throw new Error("Transaksi tidak ditemukan di perangkat.");
    const original = JSON.parse(row.payload);
    if (original.status === "void") { await db.commitTransaction(); return original; }
    await restoreSaleStock(db, null, original);
    const stored = { ...original, status: "void", payment_status: "void", void_reason: reason, sync_state: "pending_delete" };
    await db.run({ statement: "UPDATE sales SET state='pending_delete',payload=?,last_error=NULL WHERE local_id=?", values: [JSON.stringify(stored), row.local_id] });
    await db.run({ statement: "INSERT INTO outbox(operation_id,entity_id,action,payload,created_at) VALUES (?,?,?,?,?)", values: [operationId, row.local_id, "delete", JSON.stringify({ reason }), new Date().toISOString()] });
    await db.commitTransaction();
    return stored;
  } catch (error) {
    await db.rollbackTransaction();
    throw error;
  }
}

export async function applyRemoteSaleDelete(change) {
  const db = await nativeDb();
  const clientId = String(change.client_transaction_id || "");
  if (!db) {
    const data = readWeb();
    data.sales = data.sales.filter((row) => row.local_id !== clientId && Number(row.server_id) !== Number(change.id));
    writeWeb(data); return;
  }
  await db.run({ statement: "DELETE FROM sales WHERE local_id=? OR server_id=?", values: [clientId, Number(change.id) || -1] });
}

export async function pendingOperations() {
  const db = await nativeDb();
  if (!db) return readWeb().outbox;
  return ((await db.query({ statement: "SELECT * FROM outbox ORDER BY created_at,rowid LIMIT 100" })).values || []).map((row) => ({ ...row, payload: JSON.parse(row.payload) }));
}

export async function markOperationSynced(operationId, result) {
  const db = await nativeDb();
  if (!db) {
    const data = readWeb();
    const operation = data.outbox.find((row) => row.operation_id === operationId);
    data.outbox = data.outbox.filter((row) => row.operation_id !== operationId);
    const sale = data.sales.find((row) => row.local_id === operation?.entity_id);
    if (operation?.action === "delete") data.sales = data.sales.filter((row) => row.local_id !== operation.entity_id);
    else if (sale) { sale.server_id = result.server_id; sale.state = "synced"; sale.payload = { ...sale.payload, id: result.server_id, invoice_no: result.invoice_no, revision: result.revision, sync_state: "synced" }; }
    writeWeb(data); return;
  }
  const operation = (await db.query({ statement: "SELECT entity_id,action FROM outbox WHERE operation_id=?", values: [operationId] })).values?.[0];
  if (operation) {
    if (operation.action === "delete") await db.run({ statement: "DELETE FROM sales WHERE local_id=?", values: [operation.entity_id] });
    else {
      const existing = await getLocalSale(operation.entity_id);
      const updated = { ...existing, id: result.server_id, invoice_no: result.invoice_no, revision: result.revision, sync_state: "synced" };
      await db.run({ statement: "UPDATE sales SET server_id=?,invoice_no=?,state='synced',payload=?,last_error=NULL WHERE local_id=?", values: [result.server_id, result.invoice_no, JSON.stringify(updated), operation.entity_id] });
    }
  }
  await db.run({ statement: "DELETE FROM outbox WHERE operation_id=?", values: [operationId] });
}

export async function markOperationFailed(operationId, message) {
  const db = await nativeDb();
  if (!db) {
    const data = readWeb(); const operation = data.outbox.find((row) => row.operation_id === operationId);
    if (operation) { operation.attempts += 1; operation.last_error = message; const sale = data.sales.find((row) => row.local_id === operation.entity_id); if (sale) { sale.state = "failed"; sale.last_error = message; } }
    writeWeb(data); return;
  }
  await db.run({ statement: "UPDATE outbox SET attempts=attempts+1,last_error=? WHERE operation_id=?", values: [message, operationId] });
  await db.run({ statement: "UPDATE sales SET state='failed',last_error=? WHERE local_id=(SELECT entity_id FROM outbox WHERE operation_id=?)", values: [message, operationId] });
}

export async function offlineStats() {
  const operations = await pendingOperations();
  const sales = await listLocalSales();
  return {
    pending: operations.length,
    failed: sales.filter((row) => row.sync_state === "failed").length,
    lastSync: await getMeta("last_sync"),
    cursor: Number(await getMeta("cursor") || 0),
  };
}
