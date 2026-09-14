import { isNative, openExternal, serverSetupEnabled } from "../platform/native";
import { getAuthToken, getStoredAccounts, MAX_AUTH_ACCOUNTS, switchAccount } from "../utils/auth";
import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { logout } from "../utils/auth";
import LogoutModal from "../components/LogoutModal";
import axios from "axios";
import {
  checkActiveEndpointHealth,
  getApiBaseUrl,
} from "../config/apiEndpoints";

const NAV_GROUPS = [
  {
    id: "expense",
    label: "Expense",
    path: "/expense",
    icon: "M12 2 3 7v10l9 5 9-5V7l-9-5Zm0 0v20M3 7l9 5 9-5",
    items: [
      { path: "/expense", label: "Expense", end: true, patterns: [/^\/expense\/(?:new|\d+(?:\/edit)?)\/?$/], icon: "M3 10l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" },
      { path: "/expense/categories", label: "Category", icon: "M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 0 1 0 2.828l-7 7a2 2 0 0 1-2.828 0l-7-7A1.994 1.994 0 0 1 3 12V7a4 4 0 0 1 4-4z" },
      { path: "/expense/posting", label: "Posting", icon: "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" },
      { path: "/expense/storage/orphan-receipts", label: "Hapus Foto", icon: "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" },
    ],
  },
  {
    id: "income",
    label: "Income",
    path: "/income",
    icon: "M12 2v20m5-16H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
    items: [
      { path: "/income", label: "Income", end: true, patterns: [/^\/income\/(?:invoice\/[^/]+|bulk-print)\/?$/], icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
      { path: "/income/pos/new", label: "Kasir POS", prefixes: ["/income/pos/"], icon: "M4 7h16l-1 13H5L4 7Zm3 0V5a5 5 0 0 1 10 0v2M8 11v5m4-5v5m4-5v5" },
      ...(isNative ? [{ path: "/settings/printer", label: "Printer Thermal", icon: "M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2m-12-4h12v7H6v-7Z" }] : []),
      { path: "/settings/payment-aliases", label: "Alias Pembayaran", icon: "M4 7h16M4 12h10M4 17h7m7-5 2 2-4 4" },
      { path: "/income/top-products", label: "Top Products", icon: "M4 19V9m6 10V5m6 14v-7m5 7H3" },
    ],
  },
  {
    id: "payroll",
    label: "Payroll",
    path: "/payroll",
    icon: "M9 14l2 2 4-4m5-5h-2.586a1 1 0 01-.707-.293l-1.414-1.414A1 1 0 0014.586 5H9.414a1 1 0 00-.707.293L7.293 6.707A1 1 0 016.586 7H4v14h16V7zM9 3h6v4H9V3z",
    items: [
      { path: "/payroll", label: "Ringkasan", end: true, icon: "M4 13h6V4H4v9Zm0 7h6v-3H4v3Zm10 0h6v-9h-6v9Zm0-13h6V4h-6v3Z" },
      { path: "/payroll/employees", label: "Karyawan", icon: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m7-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.87m-1-12a4 4 0 0 1 0 7.75" },
      { path: "/payroll/attendance", label: "Absensi", icon: "M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Zm4 11 2 2 4-4" },
      { path: "/payroll/periods", label: "Periode", icon: "M12 8v4l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" },
      { path: "/payroll/slips", label: "Slip", icon: "M6 2h9l5 5v15H6V2Zm9 0v6h5M9 13h8M9 17h8" },
      { path: "/payroll/kasbon", label: "Kasbon", icon: "M3 7h18v13H3V7Zm0 4h18M16 16h2" },
      { path: "/payroll/utang", label: "Utang", icon: "M4 5h16v14H4V5Zm4 4h8m-8 4h5" },
      { path: "/payroll/validation", label: "Validasi Payroll", icon: "m5 12 4 4L19 6" },
    ],
  },
];

const DOWNLOAD_NAV_ITEM = {
  path: "/downloads",
  label: "Unduh Data",
  icon: "M12 3v12m0 0 4-4m-4 4-4-4M5 21h14",
};

const DASHBOARD_NAV_ITEM = {
  path: "/dashboard",
  label: "Dashboard",
  end: true,
  icon: "M4 13h6V4H4v9Zm0 7h6v-3H4v3Zm10 0h6v-9h-6v9Zm0-13h6V4h-6v3Z",
};

const POS_NAV_ITEM = {
  id: "pos",
  path: "/income/pos/new",
  label: "POS",
  icon: "M5 4h14l1 7H4l1-7Zm0 7v9h14v-9M8 15h3m5-11V2M8 4V2",
};

const isNavItemActive = (pathname, item) =>
  pathname === item.path ||
  (!item.end && pathname.startsWith(`${item.path}/`)) ||
  item.prefixes?.some((prefix) => pathname.startsWith(prefix)) ||
  item.patterns?.some((pattern) => pattern.test(pathname));

const getActiveGroupId = (pathname) =>
  NAV_GROUPS.find((group) => group.items.some((item) => isNavItemActive(pathname, item)))?.id || null;

function NavigationIcon({ path, className = "h-5 w-5", strokeWidth = 2 }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={strokeWidth} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d={path} />
    </svg>
  );
}

export default function MobileLayout({ title, children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const username = localStorage.getItem("username");

  const [showLogout, setShowLogout] = useState(false);
  const [showAccountSwitcher, setShowAccountSwitcher] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [accounts] = useState(() => getStoredAccounts());
  const [switchError, setSwitchError] = useState("");
  const [switchingAccount, setSwitchingAccount] = useState("");

  // 🔹 STATE UNTUK SIDEBAR
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [expandedGroup, setExpandedGroup] = useState(() =>
    getActiveGroupId(location.pathname),
  );

  // Ambil dan format nama domain dari endpoint yang terpilih saat startup.
  const rawApiUrl = getApiBaseUrl() || "finance.local";
  const displayDomain = rawApiUrl.replace(/^https?:\/\//, "").split("/")[0];

  const openAccountSwitcher = () => {
    setSwitchError("");
    setIsSidebarOpen(false);
    setShowAccountSwitcher(true);
  };

  // Pengecekan Koneksi Real-time
  useEffect(() => {
    const checkHealth = async () => {
      setIsOnline(await checkActiveEndpointHealth());
    };

    checkHealth();
    const interval = setInterval(checkHealth, 10000);
    return () => clearInterval(interval);
  }, []);

  // Set Judul Tab
  useEffect(() => {
    if (title) {
      document.title = `${title} | Finance System`;
    } else {
      document.title = "Finance System";
    }
  }, [title]);

  const confirmLogout = async () => {
    let ssoLogoutUrl = null;
    try {
      const token = getAuthToken();

      const response = await axios.post(
        `${getApiBaseUrl()}/auth/logout/`,
        {},
        {
          headers: {
            Authorization: `Token ${token}`,
          },
        },
      );
      ssoLogoutUrl = response.data?.logout_url || null;
    } catch {
      // Abaikan error, misalnya token sudah tidak valid
    }

    const nextAccount = await logout();
    if (nextAccount) {
      window.location.replace("/dashboard");
      return;
    }
    if (ssoLogoutUrl) {
      if (isNative) { await openExternal(ssoLogoutUrl); navigate("/login"); }
      else window.location.assign(ssoLogoutUrl);
    } else {
      navigate("/login");
    }
  };

  const selectAccount = async (account) => {
    if (account.isActive || switchingAccount) return;
    setSwitchError("");
    setSwitchingAccount(account.key);
    try {
      await switchAccount(account.key);
      window.location.replace("/dashboard");
    } catch (error) {
      setSwitchError(error.message || "Akun gagal dibuka.");
      setSwitchingAccount("");
    }
  };

  return (
    <>
      {/* 🔹 1. KONTINER LUAR: Fix 100dvh & hilangkan overflow luar */}
      <div className="h-[100dvh] w-full bg-[#f3f2f1] flex justify-center font-sans overflow-hidden lg:p-4">
        {/* 🔹 2. KONTINER UTAMA: Ubah min-h-screen menjadi h-full */}
        <div className="w-full max-w-md md:max-w-6xl lg:max-w-none mx-auto h-full flex bg-white shadow-md lg:shadow-xl lg:border lg:border-gray-200 lg:rounded-xl overflow-hidden relative">
          {/* ================= SIDEBAR COMPONENT ================= */}
          {/* Backdrop */}
          {isSidebarOpen && (
            <div
              className="absolute inset-0 bg-black/30 backdrop-blur-[1px] z-40 transition-opacity lg:hidden"
              onClick={() => setIsSidebarOpen(false)}
            />
          )}

          {/* Sidebar Panel */}
          <div
            className={`absolute top-0 bottom-0 left-0 w-64 bg-white z-50 shadow-2xl flex flex-col transition-transform duration-300 ease-in-out lg:relative lg:inset-auto lg:translate-x-0 lg:shrink-0 lg:shadow-none lg:border-r lg:border-gray-200 ${
              isSidebarOpen ? "translate-x-0" : "-translate-x-full"
            }`}
          >
            {/* Header Sidebar */}
            <div className="p-5 border-b border-gray-200 flex items-center justify-between bg-[#f3f2f1]">
              <div className="flex items-center gap-3">
                <img
                  src={import.meta.env.VITE_LOGO_1 || "/finance.svg"}
                  alt="Logo"
                  className="w-6 h-6 object-contain"
                />
                <span className="font-semibold text-gray-800 tracking-tight">
                  Finance App
                </span>
              </div>
              <button
                onClick={() => setIsSidebarOpen(false)}
                className="p-1.5 text-gray-500 hover:bg-gray-200 hover:text-black transition-colors lg:hidden"
                aria-label="Tutup menu"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  ></path>
                </svg>
              </button>
            </div>

            {/* Menu Navigasi Sidebar */}
            <div className="flex-1 overflow-y-auto px-3 py-4">
              <div className="mb-3 px-2 text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400">
                Navigasi
              </div>
              <div className="space-y-2">
                {serverSetupEnabled && <button type="button" onClick={() => navigate("/server")} className="w-full rounded-xl border border-gray-200 px-4 py-3 text-left text-sm font-semibold text-gray-700">Pengaturan server</button>}
                <button
                  type="button"
                  aria-current={isNavItemActive(location.pathname, DASHBOARD_NAV_ITEM) ? "page" : undefined}
                  onClick={() => { navigate(DASHBOARD_NAV_ITEM.path); setExpandedGroup(null); setIsSidebarOpen(false); }}
                  className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-sm font-bold transition-colors ${isNavItemActive(location.pathname, DASHBOARD_NAV_ITEM) ? "border-blue-200 bg-blue-50/40 text-[#0067b8]" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"}`}
                >
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${isNavItemActive(location.pathname, DASHBOARD_NAV_ITEM) ? "bg-[#0067b8] text-white shadow-sm" : "bg-gray-100 text-gray-500"}`}>
                    <NavigationIcon path={DASHBOARD_NAV_ITEM.icon} className="h-[18px] w-[18px]" />
                  </span>
                  <span className="flex-1 text-left">{DASHBOARD_NAV_ITEM.label}</span>
                </button>
                {NAV_GROUPS.map((group) => {
                  const isExpanded = expandedGroup === group.id;
                  const isGroupActive = group.items.some((item) =>
                    isNavItemActive(location.pathname, item),
                  );
                  return (
                    <section key={group.id} className={`overflow-hidden rounded-xl border transition-colors ${isGroupActive ? "border-blue-200 bg-blue-50/40" : "border-gray-200 bg-white"}`}>
                      <button
                        type="button"
                        aria-expanded={isExpanded}
                        aria-controls={`navigation-group-${group.id}`}
                        onClick={() => setExpandedGroup((current) => current === group.id ? null : group.id)}
                        className={`flex w-full items-center gap-3 px-3 py-3 text-sm font-bold transition-colors ${isGroupActive ? "text-[#0067b8]" : "text-gray-700 hover:bg-gray-50"}`}
                      >
                        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${isGroupActive ? "bg-[#0067b8] text-white shadow-sm" : "bg-gray-100 text-gray-500"}`}>
                          <NavigationIcon path={group.icon} className="h-[18px] w-[18px]" />
                        </span>
                        <span className="flex-1 text-left">{group.label}</span>
                        <svg className={`h-4 w-4 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
                        </svg>
                      </button>

                      <div id={`navigation-group-${group.id}`} className={`grid transition-[grid-template-rows,opacity] duration-200 ${isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                        <div className="min-h-0 overflow-hidden">
                          <div className="mb-2 ml-7 mr-2 border-l border-gray-200 pl-3">
                            {group.items.map((item) => {
                              const isActive = isNavItemActive(location.pathname, item);
                              return (
                                <button
                                  key={item.path}
                                  type="button"
                                  aria-current={isActive ? "page" : undefined}
                                  onClick={() => {
                                    navigate(item.path);
                                    setIsSidebarOpen(false);
                                  }}
                                  className={`my-0.5 flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${isActive ? "bg-white font-bold text-[#0067b8] shadow-sm ring-1 ring-blue-100" : "font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900"}`}
                                >
                                  <NavigationIcon path={item.icon} className="h-4 w-4 shrink-0" strokeWidth={isActive ? 2.4 : 2} />
                                  <span>{item.label}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </section>
                  );
                })}
                <button
                  type="button"
                  aria-current={isNavItemActive(location.pathname, DOWNLOAD_NAV_ITEM) ? "page" : undefined}
                  onClick={() => {
                    navigate(DOWNLOAD_NAV_ITEM.path);
                    setExpandedGroup(null);
                    setIsSidebarOpen(false);
                  }}
                  className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-sm font-bold transition-colors ${isNavItemActive(location.pathname, DOWNLOAD_NAV_ITEM) ? "border-blue-200 bg-blue-50/40 text-[#0067b8]" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"}`}
                >
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${isNavItemActive(location.pathname, DOWNLOAD_NAV_ITEM) ? "bg-[#0067b8] text-white shadow-sm" : "bg-gray-100 text-gray-500"}`}>
                    <NavigationIcon path={DOWNLOAD_NAV_ITEM.icon} className="h-[18px] w-[18px]" />
                  </span>
                  <span className="flex-1 text-left">{DOWNLOAD_NAV_ITEM.label}</span>
                </button>
              </div>
            </div>

            {/* Bagian Bawah Sidebar (Akun & Logout) */}
            <div className="p-4 border-t border-gray-200">
              <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400">Akun</p>
              <button
                type="button"
                onClick={openAccountSwitcher}
                className="mb-3 flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-left transition hover:border-blue-200 hover:bg-blue-50/60"
                aria-label="Buka pemilih akun"
              >
                <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#1688dd] to-[#005a9e] text-xs font-bold uppercase text-white shadow-sm">
                  {username ? username.substring(0, 2) : "US"}
                  <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-slate-800">{username || "User"}</span>
                  <span className="block truncate text-xs text-slate-500">Ketuk untuk ganti akun</span>
                </span>
                <svg className="h-4 w-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m9 18 6-6-6-6" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => { navigate("/sessions"); setIsSidebarOpen(false); }}
                className="mb-2 flex w-full items-center justify-center gap-2 border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
              >
                Perangkat & sesi
              </button>
              <button
                type="button"
                onClick={() => { navigate("/sessions/show-login-qr"); setIsSidebarOpen(false); }}
                className="mb-2 flex w-full items-center justify-center gap-2 bg-[#0067b8] px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#005da6]"
              >
                <NavigationIcon path="M3.5 3.5h6v6h-6v-6Zm11 0h6v6h-6v-6Zm-11 11h6v6h-6v-6Zm12 0h2v2h-2v-2Zm3 0h2v4h-2v-4Zm-3 4h2v2h-2v-2Z" className="h-4 w-4" />
                Tampilkan QR login
              </button>
              <button
                onClick={() => setShowLogout(true)}
                className="w-full py-2.5 px-4 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 transition-colors flex items-center justify-center gap-2"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                  ></path>
                </svg>
                Keluar dari akun ini
              </button>
            </div>
          </div>
          {/* =================================================== */}

          <div className="relative min-w-0 flex-1 h-full flex flex-col overflow-hidden">

          {/* Banner Peringatan Koneksi Terputus */}
          {!isOnline && (
            <div className="shrink-0 bg-[#d13438] text-white text-xs font-semibold text-center py-2 px-4 shadow-sm z-30 flex items-center justify-center gap-2">
              <span className="w-2 h-2 rounded-full bg-white animate-pulse"></span>
              Koneksi terputus. Mencoba menyambung kembali...
            </div>
          )}

          <header className="z-30 flex shrink-0 items-center justify-between border-b border-slate-200/80 bg-white/95 px-4 py-3 shadow-[0_1px_8px_rgba(15,23,42,0.05)] backdrop-blur-xl sm:px-5">
            <div className="flex min-w-0 items-center gap-3">
              <button
                onClick={() => {
                  setExpandedGroup(getActiveGroupId(location.pathname));
                  setIsSidebarOpen(true);
                }}
                className="-ml-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition active:scale-95 lg:hidden"
                aria-label="Open Menu"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4 6h16M4 12h16M4 18h16"
                  ></path>
                </svg>
              </button>

              <div className="min-w-0">
                <div className="truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Finance System</div>
                <div className="truncate text-lg font-bold leading-tight text-slate-900">{title}</div>
              </div>
            </div>
            <div className="ml-3 flex shrink-0 items-center gap-2">
              <span className={`hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold sm:flex ${isOnline ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${isOnline ? "bg-emerald-500" : "bg-red-500"}`} />
                {isOnline ? "Online" : "Offline"}
              </span>
              <button
                type="button"
                onClick={openAccountSwitcher}
                aria-label="Buka pemilih akun"
                className="relative flex h-10 items-center gap-2 rounded-full border border-slate-200 bg-white p-1 pr-2.5 shadow-sm transition active:scale-95"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#1688dd] to-[#005a9e] text-[10px] font-bold uppercase text-white">
                  {username ? username.substring(0, 2) : "US"}
                </span>
                <span className="hidden max-w-28 truncate text-xs font-bold text-slate-700 sm:block">{username || "User"}</span>
                <svg className="h-3.5 w-3.5 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
                </svg>
                <span className={`absolute bottom-0.5 left-7 h-2.5 w-2.5 rounded-full border-2 border-white ${isOnline ? "bg-emerald-500" : "bg-red-500"}`} />
              </button>
            </div>
          </header>

          {/* 🔹 4. CONTENT: Hapus pb-20, pastikan overflow-y-auto ada di sini */}
          <main className="relative flex-1 overflow-y-auto bg-[#f3f2f1] p-4 pb-28 lg:p-6 xl:p-8">
              {children}
          </main>

          {/* Floating iOS-style Liquid Glass navigation */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 px-3 liquid-nav-safe-bottom lg:hidden">
            <nav aria-label="Navigasi utama" className="liquid-glass-nav pointer-events-auto relative mx-auto grid max-w-sm grid-cols-5 overflow-visible rounded-[30px] border border-white/70 bg-white/55 p-1.5 shadow-[0_18px_45px_rgba(15,23,42,0.22),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-2xl backdrop-saturate-[180%]">
              <span className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent" aria-hidden="true" />
              <span className="pointer-events-none absolute inset-0 rounded-[30px] bg-gradient-to-b from-white/35 via-white/5 to-blue-100/15" aria-hidden="true" />
              {[
                { ...DASHBOARD_NAV_ITEM, id: "dashboard" },
                NAV_GROUPS[0],
                POS_NAV_ITEM,
                NAV_GROUPS[1],
                NAV_GROUPS[2],
              ].map((group) => {
                const isPos = group.id === "pos";
                const isActive = isPos
                  ? location.pathname.startsWith("/income/pos/")
                  : group.id === "dashboard"
                    ? location.pathname === "/dashboard"
                    : getActiveGroupId(location.pathname) === group.id && !location.pathname.startsWith("/income/pos/");
                return (
                  <button
                    key={group.id}
                    type="button"
                    aria-current={isActive ? "page" : undefined}
                    onClick={() => {
                      setExpandedGroup(group.id);
                      navigate(group.path);
                    }}
                    className={`relative z-10 flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-[24px] px-1 py-2 transition-all duration-300 active:scale-95 ${isPos ? "-mt-5" : ""} ${isActive ? "bg-white/70 text-[#0067b8] shadow-[0_7px_18px_rgba(0,103,184,0.16),inset_0_1px_1px_rgba(255,255,255,1)] ring-1 ring-white/80" : "text-slate-500 hover:bg-white/35 hover:text-slate-800"}`}
                  >
                    <span className={`relative flex items-center justify-center rounded-full transition-all duration-300 ${isPos ? "h-12 w-12 border border-white/90 bg-gradient-to-b from-[#41adf5]/95 to-[#0067b8]/95 text-white shadow-[0_12px_28px_rgba(0,103,184,0.42),inset_0_2px_2px_rgba(255,255,255,0.55)] backdrop-blur-xl" : `h-7 w-9 ${isActive ? "bg-gradient-to-b from-[#1688dd] to-[#0067b8] text-white shadow-[0_5px_12px_rgba(0,103,184,0.3),inset_0_1px_1px_rgba(255,255,255,0.45)]" : "text-slate-500"}`}`}>
                      {isPos && <span className="pointer-events-none absolute inset-1 rounded-full border border-white/30" />}
                      <NavigationIcon path={group.icon} className={isPos ? "h-6 w-6" : "h-[18px] w-[18px]"} strokeWidth={isActive || isPos ? 2.35 : 2} />
                    </span>
                    <span className={`truncate text-[10px] tracking-tight ${isActive || isPos ? "font-bold" : "font-semibold"}`}>{group.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>
          </div>
        </div>
      </div>

      {showAccountSwitcher && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="account-switcher-title">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/45 backdrop-blur-sm"
            onClick={() => !switchingAccount && setShowAccountSwitcher(false)}
            aria-label="Tutup pemilih akun"
          />
          <section className="relative max-h-[82dvh] w-full max-w-md overflow-hidden rounded-t-[28px] border border-white/70 bg-white shadow-[0_-16px_60px_rgba(15,23,42,0.2)] sm:rounded-[28px] sm:shadow-2xl">
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-slate-300 sm:hidden" />
            <div className="flex items-start justify-between border-b border-slate-100 px-5 pb-4 pt-4 sm:p-6">
              <div>
                <h2 id="account-switcher-title" className="text-xl font-bold text-slate-900">Pilih akun</h2>
                <p className="mt-1 text-sm text-slate-500">{accounts.length} dari {MAX_AUTH_ACCOUNTS} akun tersimpan</p>
              </div>
              <button
                type="button"
                onClick={() => setShowAccountSwitcher(false)}
                disabled={Boolean(switchingAccount)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200 disabled:opacity-50"
                aria-label="Tutup"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="max-h-[52dvh] space-y-2 overflow-y-auto p-4 sm:px-5">
              {accounts.map((account) => (
                <button
                  key={account.key}
                  type="button"
                  onClick={() => selectAccount(account)}
                  disabled={account.isActive || Boolean(switchingAccount)}
                  aria-current={account.isActive ? "true" : undefined}
                  className={`flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left transition active:scale-[0.99] ${account.isActive ? "border-blue-200 bg-blue-50/70" : "border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50 disabled:opacity-60"}`}
                >
                  <span className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xs font-bold uppercase ${account.isActive ? "bg-gradient-to-br from-[#1688dd] to-[#005a9e] text-white shadow-md shadow-blue-200" : "bg-slate-100 text-slate-600"}`}>
                    {(account.user.username || "US").substring(0, 2)}
                    {account.isActive && <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-500" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-slate-900">{account.user.username || `User ${account.user.id}`}</span>
                    <span className="mt-0.5 block truncate text-xs text-slate-500">{account.user.email || displayDomain}</span>
                  </span>
                  {account.isActive ? (
                    <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[#0067b8] shadow-sm">Aktif</span>
                  ) : switchingAccount === account.key ? (
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-blue-200 border-t-[#0067b8]" aria-label="Membuka akun" />
                  ) : (
                    <svg className="h-4 w-4 text-slate-300" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m9 18 6-6-6-6" />
                    </svg>
                  )}
                </button>
              ))}
              {switchError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{switchError}</p>}
            </div>

            <div className="space-y-2 border-t border-slate-100 bg-slate-50/80 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-5">
              <button
                type="button"
                disabled={Boolean(switchingAccount)}
                onClick={() => {
                  setShowAccountSwitcher(false);
                  navigate("/sessions/show-login-qr");
                }}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-blue-200 bg-white px-4 py-3 text-sm font-bold text-[#0067b8] transition hover:bg-blue-50 active:scale-[0.99] disabled:opacity-50"
              >
                <NavigationIcon path="M3.5 3.5h6v6h-6v-6Zm11 0h6v6h-6v-6Zm-11 11h6v6h-6v-6Zm12 0h2v2h-2v-2Zm3 0h2v4h-2v-4Zm-3 4h2v2h-2v-2Z" className="h-4 w-4" />
                Tampilkan QR login
              </button>
              <button
                type="button"
                disabled={Boolean(switchingAccount)}
                onClick={() => {
                  setShowAccountSwitcher(false);
                  navigate("/sessions");
                }}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 active:scale-[0.99] disabled:opacity-50"
              >
                Perangkat & sesi
              </button>
              <button
                type="button"
                disabled={accounts.length >= MAX_AUTH_ACCOUNTS || Boolean(switchingAccount)}
                onClick={() => window.location.assign("/login?add_account=1")}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#0067b8] px-4 py-3 text-sm font-bold text-white shadow-lg shadow-blue-700/15 transition hover:bg-[#005da6] active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
              >
                <span className="text-lg leading-none">+</span>
                {accounts.length >= MAX_AUTH_ACCOUNTS ? "Batas 5 akun tercapai" : "Tambahkan akun lain"}
              </button>
            </div>
          </section>
        </div>
      )}

      <LogoutModal
        open={showLogout}
        onClose={() => setShowLogout(false)}
        onConfirm={confirmLogout}
      />
    </>
  );
}
