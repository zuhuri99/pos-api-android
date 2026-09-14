import { useState } from "react";
import { useNavigate } from "react-router-dom";

import api from "../api/axios";
import MobileLayout from "../layouts/MobileLayout";
import { scanDeviceLoginCode } from "../platform/native";
import { getActiveAccount } from "../utils/auth";

const readApprovalToken = (value) => {
  const match = String(value || "").match(/^finance-login:v1:([A-Za-z0-9_-]{32,128})$/);
  return match?.[1] || "";
};

const requestError = (error, fallback) =>
  error.response?.data?.detail || error.message || fallback;

export default function DeviceLoginApproval() {
  const navigate = useNavigate();
  const account = getActiveAccount();
  const [approvalToken, setApprovalToken] = useState("");
  const [loginRequest, setLoginRequest] = useState(null);
  const [otpToken, setOtpToken] = useState("");
  const [codeConfirmed, setCodeConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const scan = async () => {
    setBusy(true);
    setError("");
    setSuccess("");
    setLoginRequest(null);
    setCodeConfirmed(false);
    setOtpToken("");
    try {
      const rawValue = await scanDeviceLoginCode();
      const token = readApprovalToken(rawValue);
      if (!token) throw new Error("QR bukan kode login Finance yang valid.");
      const response = await api.post("/auth/device-login/inspect/", {
        approval_token: token,
      });
      setApprovalToken(token);
      setLoginRequest(response.data);
    } catch (scanError) {
      setError(requestError(scanError, "QR login tidak dapat dipindai."));
    } finally {
      setBusy(false);
    }
  };

  const decide = async (action) => {
    if (!approvalToken) return;
    if (action === "approve" && !codeConfirmed) {
      setError("Pastikan kode pada kedua perangkat sama.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.post("/auth/device-login/approve/", {
        approval_token: approvalToken,
        action,
        ...(loginRequest?.requires_totp ? { otp_token: otpToken } : {}),
      });
      setLoginRequest(null);
      setApprovalToken("");
      setSuccess(
        action === "approve"
          ? "Perangkat baru berhasil diizinkan untuk login."
          : "Permintaan login telah ditolak.",
      );
    } catch (decisionError) {
      setError(requestError(decisionError, "Permintaan tidak dapat diproses."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <MobileLayout title="Persetujuan login">
      <div className="mx-auto max-w-xl space-y-4">
        <button type="button" onClick={() => navigate("/sessions")} className="text-sm font-semibold text-blue-700 hover:underline">
          ← Kembali ke perangkat & sesi
        </button>

        <section className="border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">Login antarperangkat</p>
          <h1 className="mt-2 text-xl font-bold text-slate-900">Pindai QR perangkat baru</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Anda masuk sebagai <strong>{account?.user?.username || "User"}</strong>. Hanya setujui perangkat yang berada di depan Anda.
          </p>
          {!loginRequest && (
            <button type="button" onClick={scan} disabled={busy} className="mt-5 w-full bg-[#0067b8] px-5 py-3 font-bold text-white hover:bg-[#005da6] disabled:opacity-50">
              {busy ? "Membuka kamera…" : "Pindai QR login"}
            </button>
          )}
        </section>

        {error && <div role="alert" className="border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
        {success && <div role="status" className="border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{success}</div>}

        {loginRequest && (
          <section className="border border-amber-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
              Pastikan informasi dan kode berikut sama dengan yang tampil pada perangkat baru.
            </div>
            <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
              <div><dt className="text-slate-500">Perangkat</dt><dd className="mt-1 font-bold text-slate-900">{loginRequest.device?.device_name || "Tidak diketahui"}</dd></div>
              <div><dt className="text-slate-500">Platform</dt><dd className="mt-1 font-bold text-slate-900">{[loginRequest.device?.platform, loginRequest.device?.os_version].filter(Boolean).join(" ") || "-"}</dd></div>
              <div><dt className="text-slate-500">Aplikasi</dt><dd className="mt-1 font-bold text-slate-900">{[loginRequest.device?.browser, loginRequest.device?.app_version].filter(Boolean).join(" · ") || "-"}</dd></div>
              <div><dt className="text-slate-500">Alamat IP</dt><dd className="mt-1 font-bold text-slate-900">{loginRequest.device?.ip_address || "-"}</dd></div>
            </dl>

            <div className="my-6 rounded-2xl border-2 border-blue-200 bg-blue-50 p-5 text-center">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">Kode pembanding</p>
              <p className="mt-2 text-3xl font-black tracking-[0.28em] text-slate-900">
                {String(loginRequest.display_code || "").replace(/(\d{3})(\d{3})/, "$1 $2")}
              </p>
            </div>

            <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-4 text-sm text-slate-700">
              <input type="checkbox" checked={codeConfirmed} onChange={(event) => setCodeConfirmed(event.target.checked)} className="mt-0.5 h-4 w-4" />
              <span>Saya memastikan kode pada kedua perangkat sama dan mengenali perangkat baru ini.</span>
            </label>

            {loginRequest.requires_totp && (
              <label className="mt-4 block">
                <span className="mb-2 block text-sm font-bold text-slate-700">Kode Authenticator administrator</span>
                {loginRequest.totp_available ? (
                  <input value={otpToken} onChange={(event) => setOtpToken(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="6 digit TOTP" className="w-full border border-slate-300 px-4 py-3 text-center text-xl font-bold tracking-[0.3em] outline-none focus:border-blue-500" />
                ) : (
                  <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">Akun administrator ini belum memiliki TOTP. Gunakan metode login biasa.</p>
                )}
              </label>
            )}

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={() => decide("reject")} disabled={busy} className="border border-red-300 px-5 py-3 font-bold text-red-700 hover:bg-red-50 disabled:opacity-50">Tolak</button>
              <button type="button" onClick={() => decide("approve")} disabled={busy || !codeConfirmed || (loginRequest.requires_totp && (!loginRequest.totp_available || otpToken.length !== 6))} className="bg-emerald-600 px-5 py-3 font-bold text-white hover:bg-emerald-700 disabled:opacity-50">{busy ? "Memproses…" : "Setujui login"}</button>
            </div>
          </section>
        )}
      </div>
    </MobileLayout>
  );
}
