import { useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";

import { isNative } from "../platform/native";
import { openCashDrawer } from "../platform/thermalPrinter";
import api from "../api/axios";
import { getActiveAccount, logout } from "../utils/auth";

const links = [
  { path: "/transactions", label: "Transaksi", icon: "M4 5h16M4 12h16M4 19h10" },
  { path: "/products", label: "Produk", icon: "M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9Zm8 4.5 8-4.5M12 12 4 7.5M12 12v9" },
  { path: "/pos", label: "POS", center: true, icon: "M6 7h12l1 14H5L6 7Zm3 0V5a3 3 0 0 1 6 0v2M9 12h6" },
  { path: "/sync", label: "Sinkron", icon: "M20 7h-6V1M4 17h6v6M19 12a7 7 0 0 0-12-5L4 10m1 2a7 7 0 0 0 12 5l3-3" },
  { path: "/settings/printer", label: "Printer", icon: "M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v7H6v-7Z" },
];

export default function PosLayout({ title, children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [drawerBusy, setDrawerBusy] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [logoutPin, setLogoutPin] = useState("");
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const activeAccount = getActiveAccount();
  const requiresLogoutPin = !activeAccount?.user?.is_superuser;
  const signOut = async () => {
    if (requiresLogoutPin) {
      setLogoutPin("");
      setLogoutError("");
      setLogoutOpen(true);
      return;
    }
    await logout();
    navigate("/login", { replace: true });
  };
  const authorizeSignOut = async (event) => {
    event.preventDefault();
    if (logoutPin.length < 4) {
      setLogoutError("Masukkan PIN otorisasi untuk keluar.");
      return;
    }
    setLogoutBusy(true);
    setLogoutError("");
    try {
      await api.post("/auth/logout/", { pin: logoutPin });
      await logout();
      navigate("/login", { replace: true });
    } catch (error) {
      const detail = error.response?.data?.detail;
      setLogoutError(typeof detail === "string" ? detail : error.message || "Otorisasi keluar gagal.");
    } finally {
      setLogoutBusy(false);
    }
  };
  const openDrawer = async () => {
    if (!window.confirm("Buka laci kasir melalui printer thermal yang aktif?")) return;
    setDrawerBusy(true);
    try { await openCashDrawer(); }
    catch (error) { window.alert(error.message || "Laci kasir gagal dibuka."); }
    finally { setDrawerBusy(false); }
  };
  return (
    <div className="min-h-[100dvh] bg-[radial-gradient(circle_at_top,#e0f2fe_0,#f1f5f9_36%,#f8fafc_100%)] pb-28">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex min-w-0 items-center gap-2.5">
          <img src="/asas-pos-logo.png" alt="" className="h-10 w-10 shrink-0 object-contain" />
          <div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-600">ASAS POS</p><h1 className="truncate text-lg font-black text-slate-900">{title}</h1></div>
        </div>
        <div className="flex items-center gap-2">
          {isNative && <button type="button" onClick={openDrawer} disabled={drawerBusy} className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-extrabold text-amber-800 disabled:opacity-50">{drawerBusy ? "Membuka…" : "Buka Laci"}</button>}
          <button type="button" onClick={signOut} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600">Keluar</button>
        </div>
      </header>
      <main className="mx-auto max-w-4xl p-3">{children}</main>
      <nav className="liquid-glass-nav liquid-nav-safe-bottom fixed inset-x-3 bottom-3 z-40 grid grid-cols-5 items-end rounded-[28px] border border-white/70 bg-white/65 px-2 pt-2 shadow-[0_18px_55px_rgba(15,23,42,0.22),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-2xl sm:inset-x-auto sm:left-1/2 sm:w-[520px] sm:-translate-x-1/2">
        {links.map(({ path, label, icon, center }) => {
          const active = location.pathname === path
            || (path === "/pos" && location.pathname.startsWith("/pos/"))
            || (path === "/products" && location.pathname.startsWith("/admin/products"));
          return (
            <NavLink key={path} to={path} aria-label={label} className={`${center ? "-mt-7" : ""} flex min-w-0 flex-col items-center gap-1 rounded-2xl px-1 py-2 text-[10px] font-extrabold transition active:scale-95 ${active ? "text-blue-700" : "text-slate-500"}`}>
              <span className={`flex items-center justify-center ${center ? "h-14 w-14 rounded-full border border-white/80 bg-gradient-to-b from-sky-400 to-blue-700 text-white shadow-[0_10px_28px_rgba(2,132,199,0.45),inset_0_1px_1px_rgba(255,255,255,0.6)]" : `h-8 w-10 rounded-xl ${active ? "bg-blue-100/80" : "bg-white/30"}`}`}>
                <svg className={center ? "h-7 w-7" : "h-5 w-5"} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true"><path d={icon} /></svg>
              </span>
              <span className="truncate">{label}</span>
            </NavLink>
          );
        })}
      </nav>
      {logoutOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <form onSubmit={authorizeSignOut} className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl">
            <h2 className="text-lg font-black text-slate-900">Otorisasi keluar</h2>
            <p className="mt-1 text-sm text-slate-500">Masukkan PIN otorisasi untuk keluar dari akun {activeAccount?.user?.username || "kasir"}.</p>
            <label className="mt-4 block text-xs font-extrabold uppercase tracking-wide text-slate-600">
              PIN otorisasi
              <input type="password" inputMode="numeric" autoComplete="off" autoFocus value={logoutPin} onChange={(event) => setLogoutPin(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-slate-300 px-3 text-center text-lg font-black tracking-[0.35em] outline-none focus:border-blue-500" />
            </label>
            {logoutError && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{logoutError}</p>}
            <p className="mt-3 text-xs text-amber-700">Koneksi internet diperlukan untuk memverifikasi PIN.</p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button type="button" disabled={logoutBusy} onClick={() => setLogoutOpen(false)} className="rounded-xl border border-slate-300 py-2.5 text-sm font-bold text-slate-700 disabled:opacity-50">Batal</button>
              <button type="submit" disabled={logoutBusy} className="rounded-xl bg-slate-900 py-2.5 text-sm font-extrabold text-white disabled:opacity-50">{logoutBusy ? "Memeriksa…" : "Keluar"}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
