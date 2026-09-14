import { NavLink, useLocation, useNavigate } from "react-router-dom";

import { logout } from "../utils/auth";

const links = [
  ["/pos", "Kasir"],
  ["/admin/products", "Produk"],
  ["/sync", "Sinkronisasi"],
  ["/settings/printer", "Printer"],
];

export default function PosLayout({ title, children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const signOut = async () => {
    await logout();
    navigate("/login", { replace: true });
  };
  return (
    <div className="min-h-[100dvh] bg-slate-100 pb-20">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex min-w-0 items-center gap-2.5">
          <img src="/asas-pos-logo.png" alt="" className="h-10 w-10 shrink-0 object-contain" />
          <div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-600">ASAS POS</p><h1 className="truncate text-lg font-black text-slate-900">{title}</h1></div>
        </div>
        <button type="button" onClick={signOut} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600">Keluar</button>
      </header>
      <main className="mx-auto max-w-4xl p-3">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-slate-200 bg-white px-1 pb-[max(0.4rem,env(safe-area-inset-bottom))] pt-2 shadow-2xl">
        {links.map(([path, label]) => (
          <NavLink key={path} to={path} className={`rounded-lg px-1 py-2 text-center text-[11px] font-extrabold ${location.pathname === path || (path === "/pos" && location.pathname.startsWith("/pos/")) ? "bg-blue-50 text-blue-700" : "text-slate-500"}`}>{label}</NavLink>
        ))}
      </nav>
    </div>
  );
}
