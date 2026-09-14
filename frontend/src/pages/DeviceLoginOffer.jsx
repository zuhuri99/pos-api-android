import { useCallback, useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useNavigate } from "react-router-dom";

import api from "../api/axios";
import MobileLayout from "../layouts/MobileLayout";
import { getActiveAccount } from "../utils/auth";

const requestError = (error, fallback) => error.response?.data?.detail || error.message || fallback;

export default function DeviceLoginOffer() {
  const navigate = useNavigate();
  const account = getActiveAccount();
  const [offer, setOffer] = useState(null);
  const [target, setTarget] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [otpToken, setOtpToken] = useState("");
  const [codeConfirmed, setCodeConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const createOffer = useCallback(async () => {
    setBusy(true);
    setError("");
    setSuccess("");
    setTarget(null);
    setCodeConfirmed(false);
    setOtpToken("");
    try {
      const response = await api.post("/auth/device-login/offer/", {});
      setOffer(response.data);
    } catch (requestFailure) {
      setError(requestError(requestFailure, "QR login tidak dapat dibuat."));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { createOffer(); }, [createOffer]);

  useEffect(() => {
    if (!offer?.expires_at) return undefined;
    const update = () => setTimeLeft(Math.max(0, Math.ceil((Date.parse(offer.expires_at) - Date.now()) / 1000)));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [offer]);

  useEffect(() => {
    if (!offer?.challenge_id || target) return undefined;
    let active = true;
    let inFlight = false;
    const poll = async () => {
      if (!active || inFlight) return;
      inFlight = true;
      try {
        const response = await api.post("/auth/device-login/offer/status/", { challenge_id: offer.challenge_id });
        if (active && response.data?.claimed) setTarget(response.data);
      } catch (pollError) {
        if (!active) return;
        if (pollError.response?.status === 410) {
          setError("QR login sudah kedaluwarsa.");
          setOffer(null);
        } else if (pollError.response?.status !== 429 && pollError.response?.status < 500) {
          setError(requestError(pollError, "Status QR login tidak dapat diperiksa."));
        }
      } finally {
        inFlight = false;
      }
    };
    poll();
    const timer = window.setInterval(poll, Math.max(2, Number(offer.poll_interval) || 3) * 1000);
    return () => { active = false; window.clearInterval(timer); };
  }, [offer, target]);

  const decide = async (action) => {
    if (!offer?.approval_token || !target) return;
    if (action === "approve" && !codeConfirmed) {
      setError("Pastikan kode pada kedua perangkat sama.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.post("/auth/device-login/approve/", {
        approval_token: offer.approval_token,
        action,
        ...(target.requires_totp ? { otp_token: otpToken } : {}),
      });
      setSuccess(action === "approve" ? "Login perangkat baru berhasil disetujui." : "Permintaan login ditolak.");
      setOffer(null);
      setTarget(null);
    } catch (requestFailure) {
      setError(requestError(requestFailure, "Permintaan login tidak dapat diproses."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <MobileLayout title="Tampilkan QR login">
      <div className="mx-auto max-w-xl space-y-4">
        <button type="button" onClick={() => navigate("/sessions")} className="text-sm font-semibold text-blue-700 hover:underline">← Kembali ke perangkat & sesi</button>
        <section className="border border-slate-200 bg-white p-5 text-center shadow-sm sm:p-6">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">Login antarperangkat</p>
          <h1 className="mt-2 text-xl font-bold text-slate-900">Pindai QR ini dari perangkat baru</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">QR akan memberikan akses ke akun <strong>{account?.user?.username || "User"}</strong> hanya setelah Anda menyetujuinya.</p>
          {offer && !target && <>
            <div className="mx-auto mt-5 w-fit rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><QRCodeSVG value={offer.qr_payload} size={220} level="M" /></div>
            <p className={`mt-4 text-sm font-semibold ${timeLeft <= 30 ? "text-red-600" : "text-slate-500"}`}>{timeLeft > 0 ? `Berlaku ${timeLeft} detik` : "Kode sudah kedaluwarsa"}</p>
            <p className="mt-1 text-sm text-slate-500">Menunggu dipindai perangkat baru…</p>
          </>}
          {!offer && !busy && !success && <button type="button" onClick={createOffer} className="mt-5 w-full bg-[#0067b8] px-5 py-3 font-bold text-white">Buat QR baru</button>}
          {busy && !target && <div className="mx-auto my-8 h-9 w-9 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />}
        </section>

        {error && <div role="alert" className="border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
        {success && <div role="status" className="border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{success}</div>}

        {target && <section className="border border-amber-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Perangkat berikut meminta akses. Pastikan kode yang terlihat pada kedua perangkat sama.</div>
          <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
            <div><dt className="text-slate-500">Perangkat</dt><dd className="mt-1 font-bold text-slate-900">{target.device?.device_name || "Tidak diketahui"}</dd></div>
            <div><dt className="text-slate-500">Platform</dt><dd className="mt-1 font-bold text-slate-900">{[target.device?.platform, target.device?.os_version].filter(Boolean).join(" ") || "-"}</dd></div>
            <div><dt className="text-slate-500">Aplikasi</dt><dd className="mt-1 font-bold text-slate-900">{[target.device?.browser, target.device?.app_version].filter(Boolean).join(" · ") || "-"}</dd></div>
            <div><dt className="text-slate-500">Alamat IP</dt><dd className="mt-1 font-bold text-slate-900">{target.device?.ip_address || "-"}</dd></div>
          </dl>
          <div className="my-6 rounded-2xl border-2 border-blue-200 bg-blue-50 p-5 text-center">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">Kode pembanding</p>
            <p className="mt-2 text-3xl font-black tracking-[0.28em] text-slate-900">{String(target.display_code || "").replace(/(\d{3})(\d{3})/, "$1 $2")}</p>
          </div>
          <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-4 text-sm text-slate-700">
            <input type="checkbox" checked={codeConfirmed} onChange={(event) => setCodeConfirmed(event.target.checked)} className="mt-0.5 h-4 w-4" />
            <span>Saya mengenali perangkat ini dan kode pada kedua perangkat sama.</span>
          </label>
          {target.requires_totp && <label className="mt-4 block">
            <span className="mb-2 block text-sm font-bold text-slate-700">Kode Authenticator administrator</span>
            {target.totp_available ? <input value={otpToken} onChange={(event) => setOtpToken(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder="6 digit TOTP" className="w-full border border-slate-300 px-4 py-3 text-center text-xl font-bold tracking-[0.3em]" /> : <p className="bg-red-50 p-3 text-sm text-red-700">Akun administrator belum memiliki TOTP.</p>}
          </label>}
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={() => decide("reject")} disabled={busy} className="border border-red-300 px-5 py-3 font-bold text-red-700 disabled:opacity-50">Tolak</button>
            <button type="button" onClick={() => decide("approve")} disabled={busy || !codeConfirmed || (target.requires_totp && (!target.totp_available || otpToken.length !== 6))} className="bg-emerald-600 px-5 py-3 font-bold text-white disabled:opacity-50">{busy ? "Memproses…" : "Setujui login"}</button>
          </div>
        </section>}
      </div>
    </MobileLayout>
  );
}
