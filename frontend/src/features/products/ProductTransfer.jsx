import { useEffect, useState } from "react";

import incomeApi from "../../api/incomeAxios";
import PosLayout from "../../layouts/PosLayout";
import { saveBlob } from "../../platform/files";
import { getCatalogBootstrap, searchLocalProducts } from "../offline/localStore";
import { syncNow } from "../offline/syncEngine";

const columns = ["sku", "name", "variation_name", "variation_sku", "selling_price", "initial_stock", "category", "enable_stock", "is_active"];
const csvCell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;

async function exportLocalProducts() {
  const products = await searchLocalProducts({ per_page: 100000 });
  const rows = products.flatMap((product) => (product.product_variations || []).flatMap((group) => (group.variations || []).map((variation) => ({
    sku: product.sku,
    name: product.name,
    variation_name: variation.name,
    variation_sku: variation.sub_sku,
    selling_price: variation.sell_price_inc_tax || variation.default_sell_price,
    initial_stock: (variation.variation_location_details || []).reduce((sum, row) => sum + Number(row.qty_available || 0), 0),
    category: product.category || "",
    enable_stock: product.enable_stock,
    is_active: product.is_inactive ? 0 : 1,
  }))));
  const csv = [columns.join(","), ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(","))].join("\r\n");
  await saveBlob(new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" }), "produk-pos.csv");
}

export default function ProductTransfer() {
  const [locations, setLocations] = useState([]);
  const [locationId, setLocationId] = useState("");
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => { getCatalogBootstrap().then((data) => { setLocations(data.locations); setLocationId(String(data.locations[0]?.id || "")); }); }, []);

  const inspect = async (file) => {
    if (!file) return;
    setBusy(true); setMessage(""); setPreview(null);
    try {
      const body = new FormData(); body.append("file", file);
      const response = await incomeApi.post("/products/import/preview", body, { headers: { "Content-Type": "multipart/form-data" }, skipIncomeFallback: true });
      setPreview(response.data?.data);
    } catch (error) { setMessage(error.response?.data?.detail || "File gagal diperiksa."); }
    finally { setBusy(false); }
  };

  const commit = async () => {
    setBusy(true); setMessage("");
    try {
      const response = await incomeApi.post("/products/import/commit", { location_id: Number(locationId), rows: preview.rows }, { skipIncomeFallback: true });
      await syncNow();
      setMessage(`${response.data?.data?.imported || 0} baris produk berhasil disimpan.`);
      setPreview(null);
    } catch (error) { setMessage(error.response?.data?.detail || "Import produk gagal."); }
    finally { setBusy(false); }
  };

  return (
    <PosLayout title="Import / Export Produk">
      <section className="space-y-4">
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="font-black text-slate-900">Import CSV/XLSX</h2>
          <p className="mt-1 text-xs text-slate-500">Import memerlukan koneksi. Data diperiksa sebelum disimpan.</p>
          <label className="mt-4 block text-sm font-bold">Lokasi stok
            <select value={locationId} onChange={(event) => setLocationId(event.target.value)} className="mt-1 w-full rounded-xl border p-3">{locations.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select>
          </label>
          <input disabled={busy || !navigator.onLine} type="file" accept=".csv,.xlsx" onChange={(event) => inspect(event.target.files?.[0])} className="mt-4 block w-full text-sm" />
        </div>
        {preview && <div className="rounded-2xl bg-white p-4 shadow-sm">
          <p className="font-bold text-emerald-700">Valid: {preview.valid_count}</p>
          <p className="font-bold text-red-600">Error: {preview.error_count}</p>
          {preview.errors?.length > 0 && <div className="mt-3 max-h-40 overflow-auto rounded-xl bg-red-50 p-3 text-xs">{preview.errors.map((error) => <p key={`${error.row}-${error.message}`}>Baris {error.row}: {error.message}</p>)}</div>}
          <button disabled={busy || preview.error_count > 0 || !locationId} onClick={commit} className="mt-4 w-full rounded-xl bg-emerald-600 p-3 font-extrabold text-white disabled:opacity-50">Konfirmasi import</button>
        </div>}
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="font-black text-slate-900">Export produk</h2>
          <p className="mt-1 text-xs text-slate-500">Dibuat dari cache lokal sehingga tetap tersedia saat offline.</p>
          <button type="button" onClick={exportLocalProducts} className="mt-4 w-full rounded-xl bg-blue-700 p-3 font-extrabold text-white">Export CSV</button>
        </div>
        {message && <p className="rounded-xl bg-slate-200 p-3 text-sm font-semibold">{message}</p>}
      </section>
    </PosLayout>
  );
}
