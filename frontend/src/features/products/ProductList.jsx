import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import PosLayout from "../../layouts/PosLayout";
import { getCatalogBootstrap, searchLocalProducts } from "../offline/localStore";
import { syncNow } from "../offline/syncEngine";

const rupiah = (value) => new Intl.NumberFormat("id-ID", {
  style: "currency", currency: "IDR", maximumFractionDigits: 0,
}).format(Number(value) || 0);

export default function ProductList() {
  const navigate = useNavigate();
  const isAdmin = localStorage.getItem("is_superuser") === "true";
  const [products, setProducts] = useState([]);
  const [locations, setLocations] = useState([]);
  const [locationId, setLocationId] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (synchronize = false) => {
    setBusy(true); setError("");
    try {
      if (synchronize) await syncNow();
      const [rows, bootstrap] = await Promise.all([
        searchLocalProducts({ per_page: 100000 }),
        getCatalogBootstrap(),
      ]);
      setProducts(rows);
      setLocations(bootstrap.locations || []);
      setLocationId((current) => current || String(bootstrap.locations?.[0]?.id || ""));
    } catch (requestError) {
      setError(requestError.message || "Daftar produk gagal dimuat.");
    } finally { setBusy(false); }
  }, []);

  useEffect(() => { load(false); }, [load]);

  const rows = useMemo(() => products.flatMap((product) =>
    (product.product_variations || []).flatMap((group) => (group.variations || []).map((variation) => {
      const balances = variation.variation_location_details || [];
      const stock = balances
        .filter((item) => !locationId || Number(item.location_id) === Number(locationId))
        .reduce((sum, item) => sum + Number(item.qty_available || 0), 0);
      return { product, variation, stock };
    }))), [locationId, products]);
  const filtered = rows.filter(({ product, variation }) =>
    [product.name, product.sku, variation.name, variation.sub_sku]
      .join(" ").toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <PosLayout title="Daftar Produk">
      <div className="space-y-3 pb-24">
        <section className="rounded-[24px] border border-white/80 bg-white/90 p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold text-slate-500">{filtered.length} variasi produk</p>
            <div className="flex gap-2">
              {isAdmin && <button type="button" onClick={() => navigate("/admin/products")} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-extrabold text-slate-700">Import / Export</button>}
              <button type="button" disabled={busy} onClick={() => load(true)} className="rounded-xl bg-blue-700 px-3 py-2 text-xs font-extrabold text-white disabled:opacity-50">{busy ? "Memuat…" : "↻ Refresh"}</button>
            </div>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari nama atau SKU…" className="h-11 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-400" />
            <select value={locationId} onChange={(event) => setLocationId(event.target.value)} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold">
              {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
            </select>
          </div>
          {error && <p className="mt-3 rounded-xl bg-red-50 p-3 text-xs font-bold text-red-700">{error}</p>}
        </section>
        <section className="grid gap-3 sm:grid-cols-2">
          {filtered.map(({ product, variation, stock }) => (
            <article key={variation.id} className="rounded-[22px] border border-white/80 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="truncate font-black text-slate-900">{product.name}</h2><p className="mt-0.5 truncate text-xs text-slate-500">SKU: {variation.sub_sku || product.sku || "-"}{variation.name && variation.name !== "DUMMY" ? ` · ${variation.name}` : ""}</p></div><span className={`rounded-full px-2 py-1 text-[10px] font-black ${product.is_inactive ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>{product.is_inactive ? "Nonaktif" : "Aktif"}</span></div>
              <div className="mt-4 flex items-end justify-between border-t border-dashed border-slate-200 pt-3"><div><p className="text-[10px] font-bold uppercase text-slate-400">Stok</p><p className="text-xl font-black text-slate-800">{Number(product.enable_stock) === 1 ? stock : "∞"}</p></div><p className="font-black text-blue-700">{rupiah(variation.sell_price_inc_tax || variation.default_sell_price)}</p></div>
            </article>
          ))}
        </section>
        {!busy && !filtered.length && <div className="rounded-2xl bg-white p-8 text-center text-sm text-slate-500">Produk tidak ditemukan.</div>}
      </div>
    </PosLayout>
  );
}
