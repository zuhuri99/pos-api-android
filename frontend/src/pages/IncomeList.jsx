import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import incomeApi from "../api/incomeAxios";
import MobileLayout from "../layouts/MobileLayout";
import { isDraftTransaction, normalizedTransactionStatus } from "../features/pos/transactionStatus";

/* ===============================
 * HELPER FORMATTING
 * =============================== */
const formatRupiah = (angka) => {
  return new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(angka) || 0);
};

const formatTanggal = (tgl) => {
  if (!tgl) return "-";
  const dateObj = new Date(tgl);
  return dateObj.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getStatusStyle = (status) => {
  switch (status?.toLowerCase()) {
    case "paid":
      return "bg-[#dff6dd] text-[#107c10]";
    case "due":
      return "bg-[#fde7e9] text-[#a4262c]";
    case "partial":
      return "bg-[#fff4ce] text-[#797775]";
    default:
      return "bg-gray-200 text-gray-700";
  }
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

export default function IncomeList() {
  const navigate = useNavigate();
  const isSuperuser = localStorage.getItem("is_superuser") === "true";

  /* ===============================
   * STATE: TAMPILAN
   * =============================== */
  const [viewMode, setViewMode] = useState(() =>
    window.matchMedia("(min-width: 1024px)").matches ? "table" : "card",
  ); // Desktop default tabel, mobile/tablet default kartu

  /* ===============================
   * STATE: FILTER TANGGAL
   * =============================== */
  const [datePreset, setDatePreset] = useState("this_month");
  const [dateRange, setDateRange] = useState(getInitialMonthRange);

  const applyDatePreset = (preset) => {
    const today = new Date();
    let start, end;

    // HELPER: Format Date ke YYYY-MM-DD menggunakan Local Time (Bukan UTC)
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
  const [paymentStatus, setPaymentStatus] = useState([]);
  const [transactionStatus, setTransactionStatus] = useState([]);
  const [selectedInvoicePrefixes, setSelectedInvoicePrefixes] = useState([]);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [selectedGroup, setSelectedGroup] = useState("all");
  const [showFilter, setShowFilter] = useState(false);

  // 🔹 STATE BARU: URUTAN TANGGAL
  const [sortOrder, setSortOrder] = useState("desc"); // 'desc' (Terbaru) atau 'asc' (Terlama)

  /* ===============================
   * STATE: PAGINATION / LIMIT BARIS
   * =============================== */
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  // Reset ke halaman 1 jika ada perubahan filter atau pencarian
  useEffect(() => {
    setCurrentPage(1);
  }, [
    searchKeyword,
    selectedGroup,
    paymentStatus,
    transactionStatus,
    selectedInvoicePrefixes,
    dateRange,
    rowsPerPage,
    sortOrder,
  ]);

  /* ===============================
   * STATE: DATA & STATUS
   * =============================== */
  const [invoicesData, setInvoicesData] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  /* ===============================
   * TOGGLE MULTI-SELECT STATUS PEMBAYARAN
   * =============================== */
  const togglePaymentStatus = (status) => {
    setPaymentStatus((prev) =>
      prev.includes(status)
        ? prev.filter((s) => s !== status)
        : [...prev, status],
    );
  };

  const toggleTransactionStatus = (status) => {
    setTransactionStatus((current) =>
      current.includes(status)
        ? current.filter((item) => item !== status)
        : [...current, status],
    );
  };

  /* ===============================
   * FETCH DATA DARI API
   * =============================== */
  const loadData = async (retry = false) => {
    if (!dateRange.start_date || !dateRange.end_date) return;

    setLoading(true);
    setError(null);
    setExpandedId(null);

    try {
      const params = {
        start_date: dateRange.start_date,
        end_date: dateRange.end_date,
      };

      if (paymentStatus.length > 0) {
        params.payment_status = paymentStatus.join(",");
      }

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
  }, [dateRange.start_date, dateRange.end_date, paymentStatus]);

  const availableGroups = useMemo(
    () => Object.keys(invoicesData || {}),
    [invoicesData],
  );

  const invoicesForSelectedGroup = useMemo(() => {
    if (isSuperuser && selectedGroup !== "all") {
      return Array.isArray(invoicesData[selectedGroup])
        ? invoicesData[selectedGroup]
        : [];
    }
    return Object.values(invoicesData).flatMap((group) =>
      Array.isArray(group) ? group : [],
    );
  }, [invoicesData, isSuperuser, selectedGroup]);

  const availableInvoicePrefixes = useMemo(
    () => [...new Set(
      invoicesForSelectedGroup
        .map((invoice) => String(invoice.invoice_no || "").trim().slice(0, 3).toUpperCase())
        .filter((prefix) => /^[A-Z]{3}$/.test(prefix)),
    )].sort(),
    [invoicesForSelectedGroup],
  );

  useEffect(() => {
    setSelectedInvoicePrefixes((current) =>
      current.filter((prefix) => availableInvoicePrefixes.includes(prefix)),
    );
  }, [availableInvoicePrefixes]);

  const toggleInvoicePrefix = (prefix) => {
    setSelectedInvoicePrefixes((current) =>
      current.includes(prefix)
        ? current.filter((item) => item !== prefix)
        : [...current, prefix],
    );
  };

  /* ===============================
   * PENGOLAHAN DATA & PENCARIAN
   * =============================== */
  const processedInvoices = useMemo(() => {
    let all = [];

    if (isSuperuser && selectedGroup !== "all") {
      const groupArray = invoicesData[selectedGroup];
      if (Array.isArray(groupArray)) all = [...groupArray];
    } else {
      Object.values(invoicesData).forEach((groupArray) => {
        if (Array.isArray(groupArray)) all = [...all, ...groupArray];
      });
    }

    if (searchKeyword.trim() !== "") {
      const query = searchKeyword.toLowerCase();
      all = all.filter((inv) => {
        const matchInvoice = inv.invoice_no?.toLowerCase().includes(query);
        const matchCustomer = inv.contact?.toLowerCase().includes(query);
        const matchProduct = inv.sell_lines?.some((item) =>
          item.product_name?.toLowerCase().includes(query),
        );
        return matchInvoice || matchCustomer || matchProduct;
      });
    }

    if (selectedInvoicePrefixes.length > 0) {
      all = all.filter((invoice) =>
        selectedInvoicePrefixes.includes(
          String(invoice.invoice_no || "").trim().slice(0, 3).toUpperCase(),
        ),
      );
    }

    if (transactionStatus.length > 0) {
      all = all.filter((invoice) =>
        transactionStatus.includes(normalizedTransactionStatus(invoice.status)),
      );
    }

    // 🔹 LOGIKA PENGURUTAN BERDASARKAN sortOrder
    all.sort((a, b) => {
      const dateA = new Date(a.transaction_date);
      const dateB = new Date(b.transaction_date);
      return sortOrder === "desc" ? dateB - dateA : dateA - dateB;
    });

    return all;
  }, [invoicesData, searchKeyword, selectedGroup, isSuperuser, sortOrder, selectedInvoicePrefixes, transactionStatus]);

  /* ===============================
   * POTONG DATA SESUAI PAGINATION
   * =============================== */
  const paginatedInvoices = useMemo(() => {
    if (rowsPerPage === "all") return processedInvoices;
    const start = (currentPage - 1) * Number(rowsPerPage);
    return processedInvoices.slice(start, start + Number(rowsPerPage));
  }, [processedInvoices, rowsPerPage, currentPage]);

  const totalPages =
    rowsPerPage === "all"
      ? 1
      : Math.ceil(processedInvoices.length / Number(rowsPerPage));

  const dynamicTotal = useMemo(() => {
    return processedInvoices.reduce(
      (sum, inv) => sum + (isDraftTransaction(inv) ? 0 : Number(inv.final_total || 0)),
      0,
    );
  }, [processedInvoices]);
  const visibleDraftCount = useMemo(
    () => processedInvoices.filter(isDraftTransaction).length,
    [processedInvoices],
  );

  /* ===============================
   * Ke Halaman Bulk Print
   * =============================== */
  const handleBulkPrint = () => {
    if (processedInvoices.length === 0) {
      alert("Tidak ada data transaksi untuk dicetak!");
      return;
    }
    navigate("/income/bulk-print", { state: { invoices: processedInvoices } });
  };

  const posEditUrl = (invoice) =>
    `/income/pos/${invoice.id}/edit${invoice._source_user ? `?source=${encodeURIComponent(invoice._source_user)}` : ""}`;
  const invoiceDetailUrl = (invoice) =>
    `/income/invoice/${invoice.id}${invoice._source_user ? `?source=${encodeURIComponent(invoice._source_user)}` : ""}`;

  /* ===============================
   * RENDER
   * =============================== */
  return (
    <MobileLayout title="Daftar Income (Invoice)">
      <div className="pb-20">
        {/* HEADER SUMMARY */}
        <div className="bg-white p-4 shadow-sm border-b border-gray-200 mb-4">
          <p className="text-sm text-gray-500 font-medium">
            Total Income (Tampil)
          </p>
          <h2 className="text-2xl font-bold text-[#0067b8]">
            Rp {formatRupiah(dynamicTotal)}
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            Dari {processedInvoices.length - visibleDraftCount} transaksi final
            {visibleDraftCount > 0 ? ` · ${visibleDraftCount} draft tidak dihitung` : ""}
          </p>
          <button
            type="button"
            onClick={() => navigate("/income/pos/new")}
            className="mt-4 hidden w-auto items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-[#1688dd] to-[#0067b8] px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-700/20 transition hover:-translate-y-0.5 lg:inline-flex"
          >
            <span className="text-lg leading-none">+</span> Transaksi POS Baru
          </button>
        </div>

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
            {showFilter ? "Sembunyikan" : "Filter"}
          </button>

          {/* Tombol Ganti Tampilan */}
          <button
            onClick={() => setViewMode(viewMode === "card" ? "table" : "card")}
            className="flex-1 bg-white border border-gray-300 text-gray-700 py-2 px-2 text-[13px] font-medium hover:bg-gray-50 transition-colors flex items-center justify-center gap-1"
          >
            {viewMode === "card" ? (
              <>
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="square"
                    strokeWidth="2"
                    d="M4 6h16M4 10h16M4 14h16M4 18h16"
                  />
                </svg>
                Tabel
              </>
            ) : (
              <>
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="square"
                    strokeWidth="2"
                    d="M4 6a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V6z"
                  />
                </svg>
                Kartu
              </>
            )}
          </button>

          {/* Tombol Refresh */}
          <button
            type="button"
            onClick={() => loadData()}
            disabled={loading}
            title="Muat ulang data income"
            className="flex items-center justify-center gap-1.5 bg-[#0067b8] px-3 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[#005da6] disabled:cursor-wait disabled:opacity-60"
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
            <span>{loading ? "Memuat" : "Refresh"}</span>
          </button>
          <button
            onClick={() => handleBulkPrint()}
            className="bg-[#0067b8] text-white px-3 py-2 hover:bg-[#005da6] transition-colors flex items-center justify-center"
          >
            <svg
              className={`w-4 h-4`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 9V3h12v6M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v7H6v-7z"
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
                    Filter Cabang / Grup
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
                  Pencarian Universal
                </label>
                <input
                  type="text"
                  placeholder="Cari No Invoice, Customer, atau Produk..."
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  className="w-full border border-gray-300 bg-[#f3f2f1] p-2 text-sm focus:outline-none focus:border-b-2 focus:border-[#0067b8]"
                />
              </div>

              {availableInvoicePrefixes.length > 0 && (
                <div>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <label className="text-xs font-semibold text-gray-600">
                      Prefix Nomor Invoice
                    </label>
                    {selectedInvoicePrefixes.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedInvoicePrefixes([])}
                        className="text-xs font-semibold text-[#0067b8] hover:underline"
                      >
                        Tampilkan semua
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {availableInvoicePrefixes.map((prefix) => (
                      <label
                        key={prefix}
                        className={`flex cursor-pointer items-center gap-2 border px-3 py-2 text-sm font-semibold transition-colors ${selectedInvoicePrefixes.includes(prefix) ? "border-[#0067b8] bg-blue-50 text-[#0067b8]" : "border-gray-300 bg-white text-gray-700"}`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedInvoicePrefixes.includes(prefix)}
                          onChange={() => toggleInvoicePrefix(prefix)}
                          className="h-4 w-4 accent-[#0067b8]"
                        />
                        {prefix}
                      </label>
                    ))}
                  </div>
                  <p className="mt-1.5 text-[11px] text-gray-400">
                    Tanpa pilihan berarti semua prefix ditampilkan.
                  </p>
                </div>
              )}

              {/* 🔹 FILTER BARU: Urutan Tanggal */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Urutan Tanggal
                </label>
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value)}
                  className="w-full border border-gray-300 bg-[#f3f2f1] p-2 text-sm focus:outline-none focus:border-b-2 focus:border-[#0067b8]"
                >
                  <option value="desc">Terbaru ke Terlama</option>
                  <option value="asc">Terlama ke Terbaru</option>
                </select>
              </div>

              {/* Batas Baris / Limit Tampil */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Tampilkan Baris
                </label>
                <select
                  value={rowsPerPage}
                  onChange={(e) =>
                    setRowsPerPage(
                      e.target.value === "all" ? "all" : Number(e.target.value),
                    )
                  }
                  className="w-full border border-gray-300 bg-[#f3f2f1] p-2 text-sm focus:outline-none focus:border-b-2 focus:border-[#0067b8]"
                >
                  <option value={10}>10 Baris</option>
                  <option value={25}>25 Baris</option>
                  <option value={50}>50 Baris</option>
                  <option value={100}>100 Baris</option>
                  <option value={250}>250 Baris</option>
                  <option value={500}>500 Baris</option>
                  <option value="all">Semua Data</option>
                </select>
              </div>

              {/* Status Pembayaran (Multi Select Checkbox) */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-2">
                  Status Transaksi
                </label>
                <div className="flex flex-wrap gap-4">
                  {[{ value: "final", label: "Final" }, { value: "draft", label: "Draft" }].map((status) => (
                    <label key={status.value} className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={transactionStatus.includes(status.value)}
                        onChange={() => toggleTransactionStatus(status.value)}
                        className="h-4 w-4 accent-[#0067b8]"
                      />
                      <span>{status.label}</span>
                    </label>
                  ))}
                </div>
                <p className="mt-1.5 text-[11px] text-gray-400">Tanpa pilihan berarti final dan draft ditampilkan.</p>
              </div>

              {/* Status Pembayaran (Multi Select Checkbox) */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-2">
                  Status Pembayaran
                </label>
                <div className="flex gap-4">
                  {["paid", "partial", "due"].map((status) => (
                    <label
                      key={status}
                      className="flex items-center gap-2 cursor-pointer text-sm text-gray-700"
                    >
                      <input
                        type="checkbox"
                        checked={paymentStatus.includes(status)}
                        onChange={() => togglePaymentStatus(status)}
                        className="w-4 h-4 accent-[#0067b8] border-gray-300"
                      />
                      <span className="capitalize">{status}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Pilihan Waktu (Rentang) */}
              <div className="p-3 bg-gray-50 border border-gray-200 border-l-2 border-l-[#0067b8]">
                <label className="block text-xs font-semibold text-gray-600 mb-2">
                  Pilihan Waktu
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

        {/* LIST TRANSAKSI */}
        <div className="px-0">
          {loading ? (
            <div className="text-center py-10 text-sm text-gray-500">
              Memuat data...
            </div>
          ) : processedInvoices.length > 0 ? (
            viewMode === "card" ? (
              /* TAMPILAN KARTU */
              <div className="flex flex-col gap-3">
                {paginatedInvoices.map((inv) => (
                  <div
                    key={`${inv._source_user || "pos"}-${inv.id}`}
                    className="bg-white border border-gray-200 shadow-sm p-4 relative overflow-hidden group flex flex-col"
                  >
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#0067b8]"></div>

                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h3
                          className="font-bold text-[#0067b8] text-sm hover:underline cursor-pointer"
                          onClick={() => navigate(invoiceDetailUrl(inv))}
                        >
                          {inv.invoice_no}
                        </h3>
                        <p className="text-[10px] text-gray-400">
                          ID: {inv.id} | {formatTanggal(inv.transaction_date)}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {isDraftTransaction(inv) && (
                          <span className="border border-amber-300 bg-amber-100 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-amber-900">DRAFT</span>
                        )}
                        <div
                          className={`px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${getStatusStyle(inv.payment_status)}`}
                        >
                          {inv.payment_status}
                        </div>
                        {isSuperuser && inv.mapped_user && (
                          <span className="text-[10px] bg-gray-100 text-gray-600 px-1 border border-gray-200 uppercase">
                            {inv.mapped_user}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="mt-2 flex justify-between items-end">
                      <div className="text-xs text-gray-500 flex flex-col">
                        <span>
                          Customer:{" "}
                          <span className="font-semibold text-gray-700">
                            {inv.contact}
                          </span>
                        </span>
                        <span>Admin: {inv._source_user || "-"}</span>
                      </div>
                      <div className="text-right">
                        <span className="block text-[10px] text-gray-500 mb-0.5">
                          Total Tagihan
                        </span>
                        <span className="font-bold text-[#0067b8] text-base">
                          Rp {formatRupiah(inv.final_total)}
                        </span>
                      </div>
                    </div>

                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => navigate(invoiceDetailUrl(inv))}
                        className="flex-1 py-1.5 text-xs font-semibold text-white bg-[#0067b8] hover:bg-[#005da6] transition-colors flex justify-center items-center"
                      >
                        Detail Lengkap
                      </button>
                      <button
                        onClick={() => navigate(posEditUrl(inv))}
                        className="py-1.5 px-3 text-xs font-semibold text-[#0067b8] bg-blue-50 hover:bg-blue-100 transition-colors border border-blue-200"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() =>
                          setExpandedId(expandedId === inv.id ? null : inv.id)
                        }
                        className="py-1.5 px-3 text-xs font-semibold text-gray-600 bg-[#f3f2f1] hover:bg-gray-200 transition-colors border border-gray-300 flex justify-center items-center"
                      >
                        <svg
                          className={`w-3 h-3 transition-transform ${expandedId === inv.id ? "rotate-180" : ""}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="square"
                            strokeWidth="2"
                            d="M19 9l-7 7-7-7"
                          />
                        </svg>
                      </button>
                    </div>

                    {expandedId === inv.id && (
                      <div className="mt-2 p-3 bg-gray-50 border border-gray-200 animate-fade-in">
                        <h4 className="text-[11px] font-bold text-gray-700 mb-2 border-b border-gray-200 pb-1">
                          Sekilas Produk Dibeli
                        </h4>
                        {inv.sell_lines && inv.sell_lines.length > 0 ? (
                          <ul className="space-y-2">
                            {inv.sell_lines.map((item) => (
                              <li
                                key={item.id}
                                className="flex justify-between items-start text-xs border-b border-dashed border-gray-200 pb-2 last:border-0 last:pb-0"
                              >
                                <div className="flex-1 pr-2">
                                  <p className="font-semibold text-gray-800">
                                    {item.product_name}
                                  </p>
                                  <p className="text-[10px] text-gray-500 mt-0.5">
                                    {Number(item.quantity)} x Rp{" "}
                                    {formatRupiah(item.unit_price_inc_tax)}
                                  </p>
                                </div>
                                <div className="text-right font-bold text-gray-700 whitespace-nowrap">
                                  Rp{" "}
                                  {formatRupiah(
                                    Number(item.quantity) *
                                      Number(item.unit_price_inc_tax),
                                  )}
                                </div>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-xs text-gray-500 italic">
                            Tidak ada rincian produk.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              /* TAMPILAN TABEL */
              <div className="overflow-x-auto bg-white border border-gray-200 shadow-sm animate-fade-in">
                <table className="w-full text-sm text-left whitespace-nowrap">
                  <thead className="bg-[#f3f2f1] text-gray-700 border-b border-gray-300 text-[11px] uppercase font-bold">
                    <tr>
                      <th className="px-3 py-2">No Invoice</th>
                      <th className="px-3 py-2">Tanggal</th>
                      <th className="px-3 py-2">Customer</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2 text-right">Total Tagihan</th>
                      <th className="px-3 py-2 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedInvoices.map((inv) => (
                      <tr
                        key={`${inv._source_user || "pos"}-${inv.id}`}
                        className="border-b border-gray-100 hover:bg-gray-50"
                      >
                        <td
                          className="px-3 py-2 font-bold text-[#0067b8] cursor-pointer hover:underline"
                          onClick={() => navigate(invoiceDetailUrl(inv))}
                        >
                          {inv.invoice_no}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-600">
                          {formatTanggal(inv.transaction_date)}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-800">
                          {inv.contact}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap items-center gap-1">
                          {isDraftTransaction(inv) && (
                            <span className="border border-amber-300 bg-amber-100 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-amber-900">DRAFT</span>
                          )}
                          <span
                            className={`px-2 py-1 text-[9px] font-bold uppercase tracking-wider ${getStatusStyle(inv.payment_status)}`}
                          >
                            {inv.payment_status}
                          </span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right font-bold text-gray-800">
                          Rp {formatRupiah(inv.final_total)}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button
                            onClick={() =>
                              navigate(invoiceDetailUrl(inv))
                            }
                            className="text-[10px] text-white bg-[#0067b8] hover:bg-[#005da6] px-2 py-1 transition-colors"
                          >
                            Detail
                          </button>
                          <button
                            onClick={() => navigate(posEditUrl(inv))}
                            className="ml-1 text-[10px] text-[#0067b8] bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2 py-1 transition-colors"
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            <div className="bg-white border border-gray-200 p-8 text-center shadow-sm">
              <p className="text-gray-500 text-sm font-medium">
                Tidak ada transaksi invoice ditemukan
              </p>
            </div>
          )}

          {/* NAVIGASI PAGINATION */}
          {!loading &&
            processedInvoices.length > 0 &&
            rowsPerPage !== "all" &&
            totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between bg-white p-3 border border-gray-200 shadow-sm rounded-sm">
                <button
                  onClick={() =>
                    setCurrentPage((prev) => Math.max(prev - 1, 1))
                  }
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 text-xs font-semibold text-gray-700 bg-[#f3f2f1] hover:bg-gray-200 border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Sebelumnya
                </button>
                <span className="text-xs font-medium text-gray-600">
                  Hal {currentPage} dari {totalPages}
                </span>
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
