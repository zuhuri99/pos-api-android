import incomeApi from "../../api/incomeAxios";
import { getActiveAccount, getAuthToken } from "../../utils/auth";
import { getLoginDeviceInfo } from "../../platform/deviceInfo";
import { wibYearMonth } from "../../utils/dateTime";
import {
  getMeta,
  initializeLocalStore,
  markOperationFailed,
  markOperationSynced,
  pendingOperations,
  replaceCatalog,
  setMeta,
  applyInventoryChange,
  applyRemoteSaleDelete,
  seedInvoiceSequence,
  upsertContact,
  upsertProduct,
} from "./localStore";

let syncPromise;
let listener;
const CATALOG_CACHE_VERSION = "contact-upsert-v3";

async function deviceId() {
  const info = await getLoginDeviceInfo();
  return info.device_id || "android-pos";
}

export async function refreshInvoiceSequence(dateValue = new Date(), requestConfig = {}) {
  const { year, month } = wibYearMonth(dateValue);
  const response = await incomeApi.get("/income/pos/invoice-numbers/next", {
    ...requestConfig,
    params: { year, month }, skipIncomeFallback: true,
  });
  const state = response.data?.data || {};
  const fallbackCode = getActiveAccount()?.user?.is_superuser ? 1 : 2;
  await seedInvoiceSequence(state.user_code || fallbackCode, year, month, state.last_number || 0);
  return state;
}

export async function syncNow() {
  if (syncPromise) return syncPromise;
  syncPromise = (async () => {
    await initializeLocalStore();
    if (!getAuthToken() || !navigator.onLine) return { online: false };
    const [lastBootstrap, catalogVersion] = await Promise.all([
      getMeta("bootstrapped"),
      getMeta("catalog_cache_version"),
    ]);
    if (!lastBootstrap || catalogVersion !== CATALOG_CACHE_VERSION) {
      const response = await incomeApi.get("/sync/bootstrap", { skipIncomeFallback: true });
      await replaceCatalog(response.data?.data || {});
      await setMeta("bootstrapped", "1");
      await setMeta("catalog_cache_version", CATALOG_CACHE_VERSION);
    }
    await refreshInvoiceSequence().catch(() => {});
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
        if (change.entity === "contact" && change.action === "upsert") await upsertContact(change.data);
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
