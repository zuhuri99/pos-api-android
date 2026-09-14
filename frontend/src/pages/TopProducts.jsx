import { useEffect, useMemo, useState } from "react";
import incomeApi from "../api/incomeAxios";
import ProductAnalyticsDashboard from "../components/ProductAnalyticsDashboard";
import MobileLayout from "../layouts/MobileLayout";
import { isDraftTransaction } from "../features/pos/transactionStatus";

/* ===============================
 * HELPER FORMATTING
 * =============================== */
const formatRupiah = (angka) => {
  return new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(angka) || 0);
};

const getInitialMonthRange = () => {
  const today = new Date();
  const format = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };
  return {
    start_date: format(new Date(today.getFullYear(), today.getMonth(), 1)),
    end_date: format(new Date(today.getFullYear(), today.getMonth() + 1, 0)),
  };
};

export default function TopProducts() {
  const isSuperuser = localStorage.getItem("is_superuser") === "true";

  /* ===============================
   * STATE: FILTER TANGGAL
   * =============================== */
  const [datePreset, setDatePreset] = useState("this_month");
  const [dateRange, setDateRange] = useState(getInitialMonthRange);

  const applyDatePreset = (preset) => {
    const today = new Date();
    let start, end;

    const formatDateLocal = (date) => {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, "0");
      const d = String(date.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    };

    switch (preset) {
      case "today":
        start = end = formatDateLocal(today);
        break;
      case "yesterday": {
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        start = end = formatDateLocal(yesterday);
        break;
      }
      case "this_month":
        start = formatDateLocal(
          new Date(today.getFullYear(), today.getMonth(), 1),
        );
        end = formatDateLocal(
          new Date(today.getFullYear(), today.getMonth() + 1, 0),
        );
        break;
      case "last_month":
        start = formatDateLocal(
          new Date(today.getFullYear(), today.getMonth() - 1, 1),
        );
        end = formatDateLocal(
          new Date(today.getFullYear(), today.getMonth(), 0),
        );
        break;
      case "this_year":
        start = formatDateLocal(new Date(today.getFullYear(), 0, 1));
        end = formatDateLocal(new Date(today.getFullYear(), 11, 31));
        break;
      case "last_year":
        start = formatDateLocal(new Date(today.getFullYear() - 1, 0, 1));
        end = formatDateLocal(new Date(today.getFullYear() - 1, 11, 31));
        break;
      case "custom":
        return;
      default:
        start = end = "";
    }
    setDateRange({ start_date: start, end_date: end });
  };

  /* ===============================
   * STATE: FILTER & PENCARIAN
   * =============================== */
  const [searchKeyword, setSearchKeyword] = useState("");
  const [selectedGroup, setSelectedGroup] = useState("all");
  const [showFilter, setShowFilter] = useState(false);
  const [sortOrder, setSortOrder] = useState("desc"); // 'desc' (Terlaris) atau 'asc' (Sedikit Terjual)

  /* ===============================
   * STATE: PAGINATION / LIMIT BARIS
   * =============================== */
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchKeyword, selectedGroup, dateRange, rowsPerPage, sortOrder]);

  /* ===============================
   * STATE: DATA & STATUS
   * =============================== */
  const [invoicesData, setInvoicesData] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /* ===============================
   * FETCH DATA DARI API
   * =============================== */
  const loadData = async (retry = false) => {
    if (!dateRange.start_date || !dateRange.end_date) return;

    setLoading(true);
    setError(null);

    try {
      const params = {
        start_date: dateRange.start_date,
        end_date: dateRange.end_date,
        // Optional: Jika ingin filter produk hanya dari invoice 'paid' saja,
        // hilangkan komentar di bawah:
        // payment_status: "paid",
      };

      const res = await incomeApi.get("/income/lite", { params });

      if (res.data?.success) {
        setInvoicesData(res.data.data || {});
      }
    } catch (err) {
      if (err.isTimeout && !retry) {
        return loadData(true);
      }
      setError("Koneksi lambat. Gagal mengambil data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line
  }, [dateRange.start_date, dateRange.end_date]);

  const availableGroups = useMemo(
    () => Object.keys(invoicesData || {}),
    [invoicesData],
  );

  /* ===============================
   * PENGOLAHAN DATA: MENCARI PRODUK TERLARIS
   * =============================== */
  const processedProducts = useMemo(() => {
    let allInvoices = [];

    // 1. Kumpulkan invoice sesuai otoritas & filter grup
    if (isSuperuser && selectedGroup !== "all") {
      const groupArray = invoicesData[selectedGroup];
      if (Array.isArray(groupArray)) allInvoices = [...groupArray];
    } else {
      Object.values(invoicesData).forEach((groupArray) => {
        if (Array.isArray(groupArray))
          allInvoices = [...allInvoices, ...groupArray];
      });
    }

    // Draft belum merupakan penjualan final dan tidak ikut analitik produk.
    allInvoices = allInvoices.filter((invoice) => !isDraftTransaction(invoice));

    // 2. Ekstrak data produk dan grupkan berdasarkan SKU
    const productMap = {};
    allInvoices.forEach((inv) => {
      if (inv.sell_lines && Array.isArray(inv.sell_lines)) {
        inv.sell_lines.forEach((item) => {
          const sku = item.product_sku || "TANPA-SKU";
          const qty = Number(item.quantity) || 0;
          const price = Number(item.unit_price_inc_tax) || 0;
          const revenue = qty * price;

          if (!productMap[sku]) {
            productMap[sku] = {
              sku: sku,
              // Mengambil nama produk dari user pertama yg ditemukan
              // (walau nama beda tiap user, SKU sama = produk sama)
              name: item.product_name || "Produk Tidak Bernama",
              total_qty: 0,
              total_revenue: 0,
            };
          }
          productMap[sku].total_qty += qty;
          productMap[sku].total_revenue += revenue;
        });
      }
    });

    // 3. Konversi Object Map menjadi Array
    let productsArray = Object.values(productMap);

    // 4. Pencarian Universal (Berdasarkan SKU atau Nama)
    if (searchKeyword.trim() !== "") {
      const query = searchKeyword.toLowerCase();
      productsArray = productsArray.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          p.sku.toLowerCase().includes(query),
      );
    }

    // 5. Urutkan berdasarkan Qty Terjual
    productsArray.sort((a, b) => {
      return sortOrder === "desc"
        ? b.total_qty - a.total_qty
        : a.total_qty - b.total_qty;
    });

    return productsArray;
  }, [invoicesData, searchKeyword, selectedGroup, isSuperuser, sortOrder]);

  /* ===============================
   * POTONG DATA SESUAI PAGINATION
   * =============================== */
  const paginatedProducts = useMemo(() => {
    if (rowsPerPage === "all") return processedProducts;
    const start = (currentPage - 1) * Number(rowsPerPage);
    return processedProducts.slice(start, start + Number(rowsPerPage));
  }, [processedProducts, rowsPerPage, currentPage]);

  const totalPages =
    rowsPerPage === "all"
      ? 1
      : Math.ceil(processedProducts.length / Number(rowsPerPage));

  // Menghitung grand total pendapatan & item dari produk yang tampil
  const { totalRevenue, totalItemsSold } = useMemo(() => {
    return processedProducts.reduce(
      (acc, p) => {
        acc.totalRevenue += p.total_revenue;
        acc.totalItemsSold += p.total_qty;
        return acc;
      },
      { totalRevenue: 0, totalItemsSold: 0 },
    );
  }, [processedProducts]);

  /* ===============================
   * RENDER
   * =============================== */
  return (
    <MobileLayout title="Analitik Produk Terlaris">
      <div className="pb-20">
        <ProductAnalyticsDashboard
          products={processedProducts}
          totalItemsSold={totalItemsSold}
          totalRevenue={totalRevenue}
          loading={loading}
          dateRange={dateRange}
        />

        {/* KONTROL & TOMBOL AKSI */}
        <div className="mb-2 flex gap-2">
          {/* Tombol Filter */}
          <button
            onClick={() => setShowFilter(!showFilter)}
            className="flex-1 bg-white border border-gray-300 text-gray-700 py-2 px-2 text-[13px] font-medium hover:bg-gray-50 transition-colors flex items-center justify-center gap-1"
          >
            <svg
              className={`w-4 h-4 transition-transform ${showFilter ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="square" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
            {showFilter ? "Sembunyikan" : "Filter Data"}
          </button>

          {/* Tombol Refresh */}
          <button
            onClick={() => loadData()}
            className="bg-[#0067b8] text-white px-4 py-2 hover:bg-[#005da6] transition-colors flex items-center justify-center"
          >
            <svg
              className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="square"
                strokeWidth="2"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
        </div>

        {/* AREA FILTER & PENCARIAN */}
        {showFilter && (
          <div className="mb-4 animate-fade-in">
            <div className="bg-white p-4 shadow-sm border border-gray-200 flex flex-col gap-4">
              {/* Otorisasi: Filter Cabang */}
              {isSuperuser && availableGroups.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">
                    Filter Cabang / Grup User
                  </label>
                  <select
                    value={selectedGroup}
                    onChange={(e) => setSelectedGroup(e.target.value)}
                    className="w-full border border-gray-300 bg-[#f3f2f1] p-2 text-sm focus:outline-none focus:border-b-2 focus:border-[#0067b8]"
                  >
                    <option value="all">Semua Grup (Default)</option>
                    {availableGroups.map((g) => (
                      <option key={g} value={g}>
                        {g.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Pencarian Universal */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Cari Produk
                </label>
                <input
                  type="text"
                  placeholder="Ketik Nama Produk atau SKU..."
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  className="w-full border border-gray-300 bg-[#f3f2f1] p-2 text-sm focus:outline-none focus:border-b-2 focus:border-[#0067b8]"
                />
              </div>

              {/* Urutan */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Urutkan Berdasarkan
                </label>
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value)}
                  className="w-full border border-gray-300 bg-[#f3f2f1] p-2 text-sm focus:outline-none focus:border-b-2 focus:border-[#0067b8]"
                >
                  <option value="desc">Paling Banyak Terjual (Terlaris)</option>
                  <option value="asc">Paling Sedikit Terjual</option>
                </select>
              </div>

              {/* Pilihan Waktu (Rentang) */}
              <div className="p-3 bg-gray-50 border border-gray-200 border-l-2 border-l-[#0067b8]">
                <label className="block text-xs font-semibold text-gray-600 mb-2">
                  Rentang Waktu Terjual
                </label>
                <select
                  value={datePreset}
                  onChange={(e) => {
                    setDatePreset(e.target.value);
                    applyDatePreset(e.target.value);
                  }}
                  className="w-full border border-gray-300 bg-white p-2 text-sm focus:outline-none focus:border-[#0067b8] mb-3"
                >
                  <option value="today">Hari Ini</option>
                  <option value="yesterday">Kemarin</option>
                  <option value="this_month">Bulan Ini</option>
                  <option value="last_month">Bulan Lalu</option>
                  <option value="this_year">Tahun Ini</option>
                  <option value="last_year">Tahun Lalu</option>
                  <option value="custom">Rentang Waktu (Kustom)</option>
                </select>

                {datePreset === "custom" && (
                  <div className="grid grid-cols-2 gap-3 animate-fade-in">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">
                        Mulai
                      </label>
                      <input
                        type="date"
                        value={dateRange.start_date}
                        onChange={(e) =>
                          setDateRange((p) => ({
                            ...p,
                            start_date: e.target.value,
                          }))
                        }
                        className="w-full border border-gray-300 bg-white p-2 text-sm focus:outline-none focus:border-b-2 focus:border-[#0067b8]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">
                        Akhir
                      </label>
                      <input
                        type="date"
                        value={dateRange.end_date}
                        onChange={(e) =>
                          setDateRange((p) => ({
                            ...p,
                            end_date: e.target.value,
                          }))
                        }
                        className="w-full border border-gray-300 bg-white p-2 text-sm focus:outline-none focus:border-b-2 focus:border-[#0067b8]"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="mx-4 mb-4 bg-[#fde7e9] text-[#a4262c] border border-[#a4262c] p-3 text-sm">
            {error}
          </div>
        )}

        {/* LIST PRODUK TERLARIS */}
        <div className="px-0">
          {loading ? (
            <div className="text-center py-10 text-sm text-gray-500">
              Mengkalkulasi data produk...
            </div>
          ) : processedProducts.length > 0 ? (
            <div className="overflow-x-auto bg-white border border-gray-200 shadow-sm animate-fade-in">
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead className="bg-[#f3f2f1] text-gray-700 border-b border-gray-300 text-[11px] uppercase font-bold">
                  <tr>
                    <th className="px-3 py-2 w-10 text-center">No</th>
                    <th className="px-3 py-2">Nama Produk / SKU</th>
                    <th className="px-3 py-2 text-center">Qty Terjual</th>
                    <th className="px-3 py-2 text-right">Est. Pendapatan</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedProducts.map((p, idx) => {
                    const rowNumber =
                      (currentPage - 1) *
                        (rowsPerPage === "all" ? 0 : rowsPerPage) +
                      idx +
                      1;
                    return (
                      <tr
                        key={p.sku}
                        className="border-b border-gray-100 hover:bg-gray-50"
                      >
                        <td className="px-3 py-2 text-center text-gray-400 font-semibold text-xs">
                          {rowNumber}
                        </td>
                        <td className="px-3 py-2">
                          <p className="font-bold text-gray-800 text-sm truncate max-w-[150px] sm:max-w-xs">
                            {p.name}
                          </p>
                          <p className="text-[10px] text-[#0067b8] mt-0.5 font-mono bg-blue-50 px-1 inline-block border border-blue-100">
                            {p.sku}
                          </p>
                        </td>
                        <td className="px-3 py-2 text-center font-bold text-gray-800">
                          {formatRupiah(p.total_qty)}
                        </td>
                        <td className="px-3 py-2 text-right font-bold text-[#107c10]">
                          Rp {formatRupiah(p.total_revenue)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 p-8 text-center shadow-sm">
              <p className="text-gray-500 text-sm font-medium">
                Tidak ada data produk yang terjual pada rentang waktu ini.
              </p>
            </div>
          )}

          {/* NAVIGASI PAGINATION */}
          {!loading &&
            processedProducts.length > 0 &&
            rowsPerPage !== "all" &&
            totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between bg-white p-3 border border-gray-200 shadow-sm">
                <button
                  onClick={() =>
                    setCurrentPage((prev) => Math.max(prev - 1, 1))
                  }
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 text-xs font-semibold text-gray-700 bg-[#f3f2f1] hover:bg-gray-200 border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Sebelumnya
                </button>

                <select
                  value={rowsPerPage}
                  onChange={(e) => {
                    setRowsPerPage(
                      e.target.value === "all" ? "all" : Number(e.target.value),
                    );
                    setCurrentPage(1);
                  }}
                  className="text-xs border-b border-gray-300 bg-transparent text-center font-medium text-gray-600 focus:outline-none focus:border-[#0067b8]"
                >
                  <option value={10}>10 Baris</option>
                  <option value={25}>25 Baris</option>
                  <option value={50}>50 Baris</option>
                  <option value="all">Semua</option>
                </select>

                <button
                  onClick={() =>
                    setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                  }
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 text-xs font-semibold text-gray-700 bg-[#f3f2f1] hover:bg-gray-200 border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Selanjutnya
                </button>
              </div>
            )}
        </div>
      </div>
    </MobileLayout>
  );
}
