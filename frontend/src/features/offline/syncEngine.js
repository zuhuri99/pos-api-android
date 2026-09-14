import incomeApi from "../../api/incomeAxios";
import { getAuthToken } from "../../utils/auth";
import { getLoginDeviceInfo } from "../../platform/deviceInfo";
import {
  addInvoiceNumbers,
  availableInvoiceCount,
  getMeta,
  initializeLocalStore,
  markOperationFailed,
  markOperationSynced,
  pendingOperations,
  replaceCatalog,
  setMeta,
  applyInventoryChange,
  applyRemoteSaleDelete,
  upsertProduct,
} from "./localStore";

let syncPromise;
let listener;

async function deviceId() {
  const info = await getLoginDeviceInfo();
  return info.device_id || "android-pos";
}

async function replenishInvoices(dateValue = new Date()) {
  const now = dateValue instanceof Date ? dateValue : new Date(String(dateValue).replace(" ", "T"));
  if (await availableInvoiceCount(now.getFullYear(), now.getMonth() + 1) >= 20) return;
  const response = await incomeApi.post("/income/pos/invoice-numbers/reserve", {
    device_id: await deviceId(), year: now.getFullYear(), month: now.getMonth() + 1, count: 100,
  }, { skipIncomeFallback: true });
  await addInvoiceNumbers(response.data?.data?.numbers || []);
}

export async function syncNow() {
  if (syncPromise) return syncPromise;
  syncPromise = (async () => {
    await initializeLocalStore();
    if (!getAuthToken() || !navigator.onLine) return { online: false };
    const lastBootstrap = await getMeta("bootstrapped");
    if (!lastBootstrap) {
      const response = await incomeApi.get("/sync/bootstrap", { skipIncomeFallback: true });
      await replaceCatalog(response.data?.data || {});
      await setMeta("bootstrapped", "1");
    }
    await replenishInvoices().catch(() => {});
    const operations = await pendingOperations();
    for (let offset = 0; offset < operations.length; offset += 50) {
      const batch = operations.slice(offset, offset + 50);
      try {
        const response = await incomeApi.post("/sync/push", {
          device_id: await deviceId(),
          operations: batch.map((operation) => ({
            operation_id: operation.operation_id, entity: "sale", action: operation.action,
            entity_id: operation.entity_id, base_revision: operation.payload.revision || 0,
            payload: operation.payload,
          })),
        }, { skipIncomeFallback: true });
        for (const result of response.data?.data?.results || []) await markOperationSynced(result.operation_id, result);
      } catch (error) {
        const message = error.response?.data?.detail ? JSON.stringify(error.response.data.detail) : error.message;
        for (const operation of batch) await markOperationFailed(operation.operation_id, message);
        throw error;
      }
    }
    let cursor = Number(await getMeta("cursor") || 0);
    let hasMore = true;
    while (hasMore) {
      const response = await incomeApi.get("/sync/pull", { params: { cursor }, skipIncomeFallback: true });
      const data = response.data?.data || {};
      for (const change of data.changes || []) {
        if (change.entity === "product" && change.action === "upsert") await upsertProduct(change.data);
        if (change.entity === "inventory" && change.action === "upsert") await applyInventoryChange(change.data);
        if (change.entity === "sale" && change.action === "delete") await applyRemoteSaleDelete(change.data);
      }
      cursor = Number(data.cursor || cursor);
      hasMore = Boolean(data.has_more);
    }
    await setMeta("cursor", cursor);
    await setMeta("last_sync", new Date().toISOString());
    return { online: true, cursor };
  })().finally(() => { syncPromise = null; });
  return syncPromise;
}

export async function initializeSyncEngine() {
  await initializeLocalStore();
  if (!listener) {
    const { Network } = await import("@capacitor/network");
    listener = await Network.addListener("networkStatusChange", (status) => {
      if (status.connected) syncNow().catch(() => {});
    });
  }
  syncNow().catch(() => {});
}

export { replenishInvoices };
