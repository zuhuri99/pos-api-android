import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";
import { ConfirmDialog, EmptyState, ErrorBanner, LoadingState, SuccessBanner } from "../features/payroll/components/PayrollUI";
import MobileLayout from "../layouts/MobileLayout";
import { logout } from "../utils/auth";

const formatTime = (value) => value
  ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
  : "-";

const deviceTypeLabel = (value) => {
  if (value === "android") return "Android";
  if (value === "web") return "Browser";
  return "Sesi lama";
};

export default function DeviceSessions() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [selected, setSelected] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await api.get("/auth/sessions/");
      setSessions(response.data?.results || []);
    } catch (err) {
      setError(err.response?.data?.detail || "Gagal memuat daftar perangkat.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  const revokeSession = async () => {
    if (!selected) return;
    setDeleting(true);
    setError("");
    try {
      await api.delete(`/auth/sessions/${selected.id}/`);
      if (selected.is_current) {
        await logout();
        sessionStorage.setItem("auth_message", "Sesi perangkat ini telah dihapus.");
        navigate("/login", { replace: true });
        return;
      }
      setSessions((current) => current.filter((item) => item.id !== selected.id));
      setSuccess(`Login pada ${selected.device_name} telah dihapus.`);
      setSelected(null);
    } catch (err) {
      setError(err.response?.data?.detail || "Gagal menghapus sesi perangkat.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <MobileLayout title="Perangkat & sesi">
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="flex flex-col gap-4 bg-white border border-gray-200 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Tempat Anda sedang login</h1>
            <p className="mt-1 text-sm text-gray-600">Periksa perangkat, browser, sistem operasi, alamat IP, dan aktivitas terakhir. Hapus sesi yang tidak dikenali.</p>
          </div>
          <div className="grid shrink-0 gap-2 sm:grid-cols-2">
            <button type="button" onClick={() => navigate("/sessions/approve-login")} className="border border-[#0067b8] bg-white px-4 py-2.5 text-sm font-bold text-[#0067b8] hover:bg-blue-50">Pindai QR perangkat baru</button>
            <button type="button" onClick={() => navigate("/sessions/show-login-qr")} className="bg-[#0067b8] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#005da6]">Tampilkan QR untuk login</button>
          </div>
        </div>
        <ErrorBanner message={error} onRetry={loadSessions} />
        <SuccessBanner message={success} onClose={() => setSuccess("")} />
        {loading ? <LoadingState /> : sessions.length === 0 ? (
          <EmptyState title="Tidak ada sesi aktif" description="Login aktif akan tampil di halaman ini." />
        ) : (
          <div className="space-y-3">
            {sessions.map((session) => (
              <article key={session.id} className={`bg-white border p-4 sm:p-5 ${session.is_current ? "border-blue-300 ring-1 ring-blue-100" : "border-gray-200"}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-bold text-gray-900 break-words">{session.device_name}</h2>
                      {session.is_current && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-700">Perangkat ini</span>}
                    </div>
                    <p className="mt-1 text-sm text-gray-600">{[session.browser, [session.platform, session.os_version].filter(Boolean).join(" ")].filter(Boolean).join(" · ")}</p>
                    {session.app_version && <p className="mt-1 text-xs text-gray-500">Versi aplikasi {session.app_version}</p>}
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold uppercase ${session.device_type === "android" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700"}`}>{deviceTypeLabel(session.device_type)}</span>
                </div>
                <dl className="mt-4 grid gap-3 border-t border-gray-100 pt-4 text-sm sm:grid-cols-3">
                  <div><dt className="text-xs text-gray-500">Alamat IP</dt><dd className="mt-0.5 font-medium text-gray-800 break-all">{session.ip_address || "Tidak tersedia"}</dd></div>
                  <div><dt className="text-xs text-gray-500">Login</dt><dd className="mt-0.5 font-medium text-gray-800">{formatTime(session.created_at)}</dd></div>
                  <div><dt className="text-xs text-gray-500">Aktivitas terakhir</dt><dd className="mt-0.5 font-medium text-gray-800">{formatTime(session.last_seen_at)}</dd></div>
                </dl>
                <div className="mt-4 flex items-center justify-between gap-3 border-t border-gray-100 pt-3">
                  <p className="text-xs text-gray-500">Login melalui {session.auth_method || "Finance"}</p>
                  <button type="button" onClick={() => setSelected(session)} className="text-sm font-bold text-red-600 hover:text-red-700">Hapus login</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
      {selected && <ConfirmDialog title="Hapus login perangkat" message={`${selected.device_name}${selected.is_current ? " adalah perangkat yang sedang digunakan. Anda akan keluar dari aplikasi ini." : " akan langsung kehilangan akses ke akun ini."}`} confirmLabel="Hapus login" danger busy={deleting} onClose={() => setSelected(null)} onConfirm={revokeSession} />}
    </MobileLayout>
  );
}
