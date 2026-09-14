import { saveBlob, savePdf } from "../platform/files";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";
import MobileLayout from "../layouts/MobileLayout";
import TransactionCard from "../components/TransactionCard";
import ReceiptImage from "../components/ReceiptImage";

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable"; // 🔹 FIX: import sebagai fungsi 'autoTable'

/* ===============================
   HELPER
   =============================== */
const monthLabel = (ym) => {
  const [y, m] = ym.split("-");
  return new Date(y, m - 1, 1).toLocaleDateString("id-ID", {
    month: "long",
    year: "numeric",
  });
};

const getReceiptUrls = (item) =>
  Array.isArray(item.receipts)
    ? item.receipts.map((receipt) => receipt.url).filter(Boolean)
    : [];

const getReceiptFilenames = (item) =>
  Array.isArray(item.receipts)
    ? item.receipts
        .map((receipt) => receipt.filename)
        .filter(Boolean)
        .slice(0, 5)
    : [];

const formatReceiptFilenames = (item) => {
  const filenames = getReceiptFilenames(item);
  return filenames.length > 0
    ? filenames.map((filename, index) => `${index + 1}. ${filename}`).join("\n")
    : "-";
};

export default function ExpenseList() {
  const navigate = useNavigate();

  /* ===============================
     STATE
     =============================== */
  const [pageItems, setPageItems] = useState([]);
  const [allItems, setAllItems] = useState([]);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20); // 🔹 Dibuat jadi state agar bisa diubah
  const [count, setCount] = useState(0);

  const [loadingPage, setLoadingPage] = useState(false);
  const [loadingAll, setLoadingAll] = useState(false);

  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({
    year: "",
    month: "",
    category: "",
    status: "",
    is_posted: "",
    username: "",
  });

  const [collapsed, setCollapsed] = useState({});

  // STATE UI/UX
  const [showTools, setShowTools] = useState(false);
  const [viewMode, setViewMode] = useState(() =>
    window.matchMedia("(min-width: 1024px)").matches ? "table" : "card",
  ); // Desktop default tabel, mobile/tablet default kartu

  /* ===============================
     FETCH LIST (PAGINATION AWAL DARI API)
     =============================== */
  useEffect(() => {
    const fetchPage = async () => {
      setLoadingPage(true);
      try {
        const res = await api.get("/expenses/", { params: { page } });
        setPageItems(res.data.results || []);
        setCount(res.data.count || 0);
      } finally {
        setLoadingPage(false);
      }
    };
    fetchPage();
  }, [page]);

  /* ===============================
     FETCH ALL DATA (SUMMARY)
     =============================== */
  useEffect(() => {
    const fetchAll = async () => {
      setLoadingAll(true);
      try {
        let results = [];
        let p = 1;
        let hasNext = true;

        while (hasNext) {
          const res = await api.get("/expenses/", { params: { page: p } });
          results = results.concat(res.data.results || []);
          hasNext = Boolean(res.data.next);
          p++;
        }

        setAllItems(results);
      } catch (e) {
        console.error("Fetch all expenses failed:", e);
      } finally {
        setLoadingAll(false);
      }
    };
    fetchAll();
  }, []);

  /* ===============================
     DAPATKAN & SET USERNAME OTOMATIS
     =============================== */
  const usernames = useMemo(() => {
    return Array.from(
      new Set(allItems.map((i) => i.username || i.user?.username || i.user)),
    ).filter(Boolean);
  }, [allItems]);

  useEffect(() => {
    if (usernames.length === 1) {
      setFilters((prev) => prev.username === usernames[0]
        ? prev
        : { ...prev, username: usernames[0] });
    }
  }, [usernames]);

  /* ===============================
     FILTER HANDLER
     =============================== */
  const changeFilter = (e) => {
    const { name, value } = e.target;
    setFilters((p) => ({ ...p, [name]: value }));
    setPage(1);
  };

  const handleSearch = (e) => {
    setSearch(e.target.value);
    setPage(1);
  };

  /* ===============================
     GLOBAL FILTER & SEARCH SOURCE
     =============================== */
  const globalFilteredItems = useMemo(() => {
    return allItems.filter((i) => {
      if (filters.year && !i.date.startsWith(filters.year)) return false;
      if (filters.month && i.date.slice(0, 7) !== filters.month) return false;
      if (filters.category && i.category !== filters.category) return false;
      if (filters.status && i.status !== filters.status) return false;
      if (filters.is_posted !== "" && String(i.is_posted) !== filters.is_posted)
        return false;

      const itemUsername = i.username || i.user?.username || i.user;
      if (filters.username && itemUsername !== filters.username) return false;

      if (search) {
        const q = search.toLowerCase();
        const text = [i.transaction_code, i.category, i.detail, itemUsername]
          .join(" ")
          .toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }, [allItems, filters, search]);

  /* ===============================
     SUMMARY PERHITUNGAN
     =============================== */
  const yearlySummary = useMemo(() => {
    const map = {};
    globalFilteredItems.forEach((i) => {
      const y = i.date.slice(0, 4);
      const amt = Number(i.amount);
      if (!map[y]) map[y] = 0;
      map[y] += amt;
    });

    return Object.entries(map)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([year, total]) => ({ year, total }));
  }, [globalFilteredItems]);

  const monthlySummary = useMemo(() => {
    const map = {};
    globalFilteredItems.forEach((i) => {
      const ym = i.date.slice(0, 7);
      const amt = Number(i.amount);
      if (!map[ym]) map[ym] = 0;
      map[ym] += amt;
    });

    return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0]));
  }, [globalFilteredItems]);

  const hasSearchOrFilter =
    search.trim() !== "" || Object.values(filters).some((v) => v !== "");

  /* 🔹 UPDATE: Logic Potong Data Menggunakan pageSize State 🔹 */
  const displayedItems = useMemo(() => {
    if (hasSearchOrFilter || pageSize !== 20) {
      if (pageSize === "all") return globalFilteredItems;
      const startIndex = (page - 1) * Number(pageSize);
      return globalFilteredItems.slice(
        startIndex,
        startIndex + Number(pageSize),
      );
    }
    return pageItems;
  }, [hasSearchOrFilter, globalFilteredItems, pageItems, page, pageSize]);

  const currentTotalCount =
    hasSearchOrFilter || pageSize !== 20 ? globalFilteredItems.length : count;

  const totalPages =
    pageSize === "all"
      ? 1
      : Math.ceil(currentTotalCount / Number(pageSize)) || 1;

  const groupedPageItems = useMemo(() => {
    const map = {};
    displayedItems.forEach((i) => {
      const ym = i.date.slice(0, 7);
      if (!map[ym]) map[ym] = [];
      map[ym].push(i);
    });
    return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0]));
  }, [displayedItems]);

  useEffect(() => {
    setCollapsed({});
  }, [filters, search, page, pageSize]);

  const toggleMonth = (ym) => {
    setCollapsed((p) => ({ ...p, [ym]: !p[ym] }));
  };

  const categories = useMemo(
    () => Array.from(new Set(allItems.map((i) => i.category))).filter(Boolean),
    [allItems],
  );
  const years = useMemo(
    () =>
      Array.from(new Set(allItems.map((i) => i.date.slice(0, 4)))).sort(
        (a, b) => b - a,
      ),
    [allItems],
  );
  const months = useMemo(
    () =>
      Array.from(new Set(allItems.map((i) => i.date.slice(0, 7)))).sort(
        (a, b) => b.localeCompare(a),
      ),
    [allItems],
  );

  /* ===============================
     FUNGSI EXPORT DATA (TIDAK DIGANGGU GUGAT)
     =============================== */
  const exportExcel = async () => {
    try {
      const response = await api.get("/expenses/export/", {
        params: {
          ...filters,
          search,
        },
        responseType: "blob",
      });
      await saveBlob(response.data, "Export_Transaksi_Pengeluaran.xlsx");
    } catch (e) {
      console.error(e);
      alert("Gagal export Excel. Silakan coba kembali.");
    }
  };

  const exportPDF = async () => {
    try {
      const doc = new jsPDF("landscape");

      const tableColumn = [
        "Kode Transaksi",
        "Tanggal",
        "Status",
        "Kategori",
        "Detail",
        "Jumlah",
        "Bukti Foto",
        "Status Posting",
        "Username",
      ];
      const tableRows = [];

      let totalAmount = 0;

      globalFilteredItems.forEach((item) => {
        const amountVal = Number(item.amount) || 0;
        totalAmount += amountVal;

        const rowData = [
          item.transaction_code || "-",
          item.date || "-",
          item.status || "-",
          item.category || "-",
          item.detail || "-",
          `Rp ${amountVal.toLocaleString("id-ID")}`,
          formatReceiptFilenames(item),
          item.is_posted ? "Posted" : "Draft",
          item.username || item.user?.username || item.user || "-",
        ];
        tableRows.push(rowData);
      });

      const tableFoot = [
        [
          {
            content: "Total",
            colSpan: 5,
            styles: { halign: "right", fontStyle: "bold" },
          },
          {
            content: `Rp ${totalAmount.toLocaleString("id-ID")}`,
            styles: { fontStyle: "bold" },
          },
          "",
          "",
          "",
        ],
      ];

      doc.setFontSize(14);
      doc.text("Laporan Data Transaksi-Pengeluaran", 14, 15);

      autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        foot: tableFoot,
        showFoot: "lastPage",
        startY: 20,
        styles: { fontSize: 7, cellPadding: 2, overflow: "linebreak" },
        columnStyles: {
          6: { cellWidth: 50 },
        },
        headStyles: { fillColor: [0, 103, 184] },
        footStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0] },
      });

      const pdfTotalPages = doc.internal.getNumberOfPages();
      for (let i = 1; i <= pdfTotalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(100);
        const pageSizeParams = doc.internal.pageSize;
        const pageWidth = pageSizeParams.width || pageSizeParams.getWidth();
        const pageHeight = pageSizeParams.height || pageSizeParams.getHeight();

        doc.text(
          `Halaman ${i} dari ${pdfTotalPages}`,
          pageWidth - 14,
          pageHeight - 10,
          { align: "right" },
        );
      }

      await savePdf(doc, "Export_Transaksi_Pengeluaran.pdf");
    } catch (e) {
      console.error(e);
      alert(
        "Gagal Export PDF. Coba refresh halaman, pastikan server npm run dev sudah di-restart.",
      );
    }
  };

  /* ===============================
     RENDER
     =============================== */
  return (
    <MobileLayout title="Expenses">
      {/* 🔹 KONTROL PENCARIAN & USERNAME 🔹 */}
      <div className="bg-white p-3 lg:p-4 border-b border-gray-200 shadow-sm mb-2 flex flex-col lg:flex-row gap-2 lg:items-center">
        <select
          name="username"
          value={filters.username}
          onChange={changeFilter}
          disabled={usernames.length <= 1}
          className="w-full lg:w-64 lg:shrink-0 border border-gray-300 p-2 text-sm focus:outline-none focus:border-[#0067b8] focus:border-b-2 bg-[#f3f2f1] transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
        >
          {usernames.length !== 1 && <option value="">Semua Username</option>}
          {usernames.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>

        <input
          type="text"
          placeholder="Cari kode, kategori, keterangan…"
          value={search}
          onChange={handleSearch}
          className="w-full lg:flex-1 border border-gray-300 p-2 text-sm focus:outline-none focus:border-[#0067b8] focus:border-b-2 bg-[#f3f2f1] transition-colors"
        />
      </div>

      {/* KONTROL UI UTAMA */}
      <div className="flex flex-wrap justify-between items-center bg-white p-3 border-b mb-4 shadow-sm text-sm gap-2">
        <button
          onClick={() => setShowTools(!showTools)}
          className="text-[#0067b8] font-semibold hover:underline flex items-center gap-1 shrink-0"
        >
          {showTools
            ? "▼ Sembunyikan Filter & Analisis"
            : "▶ Tampilkan Filter & Analisis"}
        </button>

        <div className="flex border border-gray-300 bg-gray-100 shrink-0">
          <button
            onClick={() => setViewMode("card")}
            className={`px-3 py-1 transition-colors ${
              viewMode === "card"
                ? "bg-[#0067b8] text-white"
                : "text-gray-700 hover:bg-gray-200"
            }`}
          >
            Grup List
          </button>
          <button
            onClick={() => setViewMode("table")}
            className={`px-3 py-1 transition-colors ${
              viewMode === "table"
                ? "bg-[#0067b8] text-white"
                : "text-gray-700 hover:bg-gray-200"
            }`}
          >
            Tabel Data
          </button>
        </div>
      </div>

      {/* FILTER & SUMMARY SECTION */}
      {showTools && (
        <div className="mb-6 border border-gray-200 bg-white p-4 shadow-sm animate-fade-in">
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-2 text-sm mb-4">
            <select
              name="year"
              value={filters.year}
              onChange={changeFilter}
              className="border border-gray-300 p-2 bg-[#f3f2f1] focus:outline-none focus:border-[#0067b8]"
            >
              <option value="">Semua Tahun</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <select
              name="month"
              value={filters.month}
              onChange={changeFilter}
              className="border border-gray-300 p-2 bg-[#f3f2f1] focus:outline-none focus:border-[#0067b8]"
            >
              <option value="">Semua Bulan</option>
              {months.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </select>
            <select
              name="category"
              value={filters.category}
              onChange={changeFilter}
              className="border border-gray-300 p-2 bg-[#f3f2f1] focus:outline-none focus:border-[#0067b8]"
            >
              <option value="">Semua Kategori</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select
              name="status"
              value={filters.status}
              onChange={changeFilter}
              className="border border-gray-300 p-2 bg-[#f3f2f1] focus:outline-none focus:border-[#0067b8]"
            >
              <option value="">Semua Status</option>
              <option value="produksi">Produksi</option>
              <option value="non">Non Produksi</option>
            </select>
            <select
              name="is_posted"
              value={filters.is_posted}
              onChange={changeFilter}
              className="border border-gray-300 p-2 bg-[#f3f2f1] focus:outline-none focus:border-[#0067b8]"
            >
              <option value="">Semua Posting</option>
              <option value="true">Sudah Diposting</option>
              <option value="false">Belum Diposting</option>
            </select>

            {/* 🔹 INPUT PILIHAN BARIS (PAGINATION LIMIT) DI SINI 🔹 */}
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(
                  e.target.value === "all" ? "all" : Number(e.target.value),
                );
                setPage(1);
              }}
              className="border border-gray-300 p-2 bg-[#f3f2f1] focus:outline-none focus:border-[#0067b8]"
            >
              <option value={10}>10 Baris</option>
              <option value={20}>20 Baris</option>
              <option value={25}>25 Baris</option>
              <option value={50}>50 Baris</option>
              <option value={100}>100 Baris</option>
              <option value={250}>250 Baris</option>
              <option value={500}>500 Baris</option>
              <option value="all">Semua Data</option>
            </select>
          </div>

          {loadingAll && (
            <div className="text-xs text-gray-500 mb-2">
              Menghitung ringkasan…
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-gray-200 p-3 bg-gray-50">
              <h4 className="text-xs font-bold text-gray-500 mb-2 uppercase">
                Total Per Tahun
              </h4>
              {yearlySummary.map((y) => (
                <div key={y.year} className="flex justify-between text-sm mb-1">
                  <span>{y.year}</span>
                  <span className="text-green-700 font-semibold">
                    Rp {y.total.toLocaleString("id-ID")}
                  </span>
                </div>
              ))}
            </div>
            <div className="border border-gray-200 p-3 bg-gray-50 max-h-32 overflow-y-auto">
              <h4 className="text-xs font-bold text-gray-500 mb-2 uppercase">
                Total Per Bulan
              </h4>
              {monthlySummary.map(([ym, total]) => (
                <div
                  key={ym}
                  className="flex justify-between text-xs py-1 border-b last:border-0 border-gray-200"
                >
                  <span>{monthLabel(ym)}</span>
                  <span className="font-semibold">
                    Rp {total.toLocaleString("id-ID")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {displayedItems.length === 0 && !loadingPage && (
        <div className="text-center text-gray-500 text-sm py-8 border border-gray-200 bg-white shadow-sm">
          Tidak ada data transaksi.
        </div>
      )}

      {/* MODE 1: GRUP LIST (CARD) */}
      {viewMode === "card" && (
        <div>
          {groupedPageItems.map(([ym, rows]) => {
            const isClosed = collapsed[ym];
            return (
              <div key={ym} className="mb-4">
                <button
                  onClick={() => toggleMonth(ym)}
                  className="sticky top-0 z-10 w-full bg-[#f3f2f1] border border-gray-300 px-4 py-2 flex justify-between items-center text-sm font-semibold text-gray-800 shadow-sm"
                >
                  <span>{monthLabel(ym)}</span>
                  <span>{isClosed ? "▶" : "▼"}</span>
                </button>
                {!isClosed &&
                  rows.map((item) => (
                    <TransactionCard key={item.id} item={item} />
                  ))}
              </div>
            );
          })}
        </div>
      )}

      {/* MODE 2: TABEL DATA INFORMATIF */}
      {viewMode === "table" && displayedItems.length > 0 && (
        <div className="bg-white border border-gray-200 shadow-sm mb-4 animate-fade-in">
          <div className="p-3 border-b border-gray-200 flex justify-end gap-2 bg-[#f3f2f1]">
            <button
              onClick={exportExcel}
              className="px-3 py-1.5 text-xs font-semibold bg-green-600 text-white hover:bg-green-700 transition-colors shadow-sm flex items-center gap-1"
            >
              Export Excel
            </button>
            <button
              onClick={exportPDF}
              className="px-3 py-1.5 text-xs font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors shadow-sm flex items-center gap-1"
            >
              Export PDF
            </button>
          </div>

          <div className="w-full overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm table-auto">
              <thead className="sticky top-0 z-10 bg-gray-50 border-b border-gray-300 text-gray-700">
                <tr>
                  <th className="p-2 xl:p-3 font-semibold">Bukti</th>
                  <th className="p-2 xl:p-3 font-semibold whitespace-nowrap">Kode & Tgl</th>
                  <th className="p-2 xl:p-3 font-semibold">Username</th>
                  <th className="p-2 xl:p-3 font-semibold">Kategori</th>
                  <th className="p-2 xl:p-3 font-semibold w-full">Keterangan</th>
                  <th className="p-2 xl:p-3 font-semibold text-center">Status</th>
                  <th className="p-2 xl:p-3 font-semibold text-center">Posting</th>
                  <th className="p-2 xl:p-3 font-semibold text-right">Nominal</th>
                  <th className="p-2 xl:p-3 font-semibold text-center">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {displayedItems.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => navigate(`/expense/${item.id}`)}
                    className="border-b border-gray-100 hover:bg-blue-50 transition-colors cursor-pointer"
                  >
                    <td className="p-2 xl:p-3">
                      {getReceiptUrls(item).length > 0 ? (
                        <div className="relative w-10 h-10 bg-gray-200 border border-gray-300 overflow-hidden shrink-0 flex items-center justify-center">
                          <ReceiptImage
                            expenseId={item.id}
                            receipt={item.receipts[0]}
                            alt="Bukti"
                            className="w-full h-full object-cover"
                          />
                          {getReceiptUrls(item).length > 1 && (
                            <span className="absolute bottom-0 right-0 bg-black/75 px-1 text-[9px] font-bold text-white">
                              +{getReceiptUrls(item).length - 1}
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="w-10 h-10 bg-gray-100 border border-gray-200 flex items-center justify-center text-[10px] text-gray-400">
                          N/A
                        </div>
                      )}
                    </td>
                    <td className="p-2 xl:p-3 whitespace-nowrap">
                      <div className="font-semibold text-[#0067b8]">
                        {item.transaction_code || "-"}
                      </div>
                      <div className="text-xs text-gray-500">{item.date}</div>
                    </td>
                    <td className="p-2 xl:p-3 text-gray-700 text-xs font-semibold break-all">
                      {item.username || item.user?.username || item.user || "-"}
                    </td>
                    <td className="p-2 xl:p-3">
                      <span className="bg-gray-100 border border-gray-200 px-2 py-1 text-xs">
                        {item.category}
                      </span>
                    </td>
                    <td className="p-2 xl:p-3 min-w-0">
                      <div
                        className="truncate max-w-[140px] xl:max-w-xs 2xl:max-w-md text-gray-800"
                        title={item.detail}
                      >
                        {item.detail}
                      </div>
                    </td>

                    <td className="p-2 xl:p-3 text-center whitespace-nowrap">
                      <span
                        className={`px-2 py-1 text-[10px] font-bold uppercase rounded-sm border ${
                          item.status?.toLowerCase() === "produksi"
                            ? "bg-purple-50 text-purple-700 border-purple-200"
                            : "bg-gray-50 text-gray-600 border-gray-200"
                        }`}
                      >
                        {item.status || "-"}
                      </span>
                    </td>

                    <td className="p-2 xl:p-3 text-center whitespace-nowrap">
                      <span
                        className={`px-2 py-1 text-[10px] font-bold uppercase rounded-sm border ${
                          item.is_posted
                            ? "bg-[#dff6dd] text-[#107c10] border-[#c3f3c0]"
                            : "bg-[#fde7e9] text-[#d13438] border-[#fbc5c8]"
                        }`}
                      >
                        {item.is_posted ? "Posted" : "Draft"}
                      </span>
                    </td>

                    <td className="p-2 xl:p-3 text-right font-semibold text-gray-900 whitespace-nowrap">
                      Rp {Number(item.amount).toLocaleString("id-ID")}
                    </td>
                    <td className="p-2 xl:p-3 text-center">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          navigate(`/expense/${item.id}/edit`);
                        }}
                        className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-[#0067b8] hover:bg-blue-100"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PAGINATION */}
      {totalPages > 1 && pageSize !== "all" && (
        <div className="flex justify-center items-center gap-2 mt-4 text-sm mb-6">
          <button
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
            className="px-3 py-1 bg-white border border-gray-300 disabled:opacity-50 hover:bg-gray-100"
          >
            Prev
          </button>
          <span className="px-3 py-1 font-semibold text-gray-700">
            {page} / {totalPages}
          </span>
          <button
            disabled={page === totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1 bg-white border border-gray-300 disabled:opacity-50 hover:bg-gray-100"
          >
            Next
          </button>
        </div>
      )}

      {/* FAB */}
      <div className="sticky -bottom-2 z-40 flex justify-end -mx-6 px-4 pointer-events-none mt-4 mb-2">
        <button
          onClick={() => navigate("/expense/new")}
          className="pointer-events-auto bg-[#0067b8] text-white w-12 h-12 shadow-[0_4px_12px_rgba(0,0,0,0.3)] text-3xl hover:bg-[#005a9e] active:bg-[#004578] transition-colors flex items-center justify-center font-light"
          title="Tambah Transaksi Baru"
        >
          +
        </button>
      </div>
    </MobileLayout>
  );
}
