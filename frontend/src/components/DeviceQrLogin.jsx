import { useCallback, useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

import api from "../api/axios";
import { getLoginDeviceInfo } from "../platform/deviceInfo";
import { scanLoginOfferCode } from "../platform/native";
import { storeAuthSession } from "../utils/auth";
import { readLoginOffer } from "../utils/deviceLogin";

const errorMessage = (error, fallback) =>
  error.response?.data?.detail ||
  (typeof error.response?.data?.message === "string" ? error.response.data.message : "") ||
  error.message ||
  fallback;

export default function DeviceQrLogin({ onBack }) {
  const [challenge, setChallenge] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [timeLeft, setTimeLeft] = useState(0);
  const [pollStatus, setPollStatus] = useState("Membuat QR login…");
  const deviceRef = useRef(null);
  const requestVersion = useRef(0);

  const startChallenge = useCallback(async () => {
    const version = requestVersion.current + 1;
    requestVersion.current = version;
    setLoading(true);
    setError("");
    setPollStatus("Membuat QR login…");
    setChallenge(null);
    try {
      const device = await getLoginDeviceInfo();
      const response = await api.post(
        "/auth/device-login/start/",
        { device },
        { skipAuth: true },
      );
      if (requestVersion.current !== version) return;
      deviceRef.current = device;
      setChallenge(response.data);
      setPollStatus("Menunggu persetujuan dari perangkat lain…");
    } catch (requestError) {
      if (requestVersion.current === version) {
        setError(errorMessage(requestError, "Tidak dapat membuat kode login."));
      }
    } finally {
      if (requestVersion.current === version) setLoading(false);
    }
  }, []);

  const scanOffer = async () => {
    const version = requestVersion.current + 1;
    requestVersion.current = version;
    setLoading(true);
    setError("");
    setChallenge(null);
    setPollStatus("Membuka pemindai QR…");
    try {
      const rawValue = await scanLoginOfferCode();
      const offer = readLoginOffer(rawValue);
      if (!offer) throw new Error("QR bukan kode login dari perangkat aktif yang valid.");
      const device = await getLoginDeviceInfo();
      deviceRef.current = device;
      const response = await api.post(
        "/auth/device-login/claim/",
        { ...offer, device },
        { skipAuth: true },
      );
      if (requestVersion.current !== version) return;
      setChallenge({
        ...response.data,
        challenge_id: offer.challenge_id,
        exchange_token: offer.exchange_token,
        display_code: offer.display_code,
        reverse: true,
      });
      setPollStatus("QR diterima. Menunggu persetujuan perangkat aktif…");
    } catch (scanError) {
      if (requestVersion.current === version) {
        setError(errorMessage(scanError, "QR login tidak dapat dipindai."));
        setPollStatus("Pemindaian berhenti.");
      }
    } finally {
      if (requestVersion.current === version) setLoading(false);
    }
  };

  useEffect(() => {
    startChallenge();
    return () => { requestVersion.current += 1; };
  }, [startChallenge]);

  useEffect(() => {
    if (!challenge?.expires_at) return undefined;
    const update = () => {
      const remaining = Math.max(
        0,
        Math.ceil((Date.parse(challenge.expires_at) - Date.now()) / 1000),
      );
      setTimeLeft(remaining);
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [challenge]);

  useEffect(() => {
    if (!challenge?.challenge_id || !challenge?.exchange_token) return undefined;
    let active = true;
    let inFlight = false;
    let resumeListener;
    const interval = Math.max(2, Number(challenge.poll_interval) || 3) * 1000;

    const poll = async () => {
      if (!active || inFlight) return;
      inFlight = true;
      try {
        const response = await api.post(
          "/auth/device-login/exchange/",
          {
            challenge_id: challenge.challenge_id,
            exchange_token: challenge.exchange_token,
            device: deviceRef.current,
          },
          { skipAuth: true },
        );
        if (!active) return;
        if (response.status === 202 || response.data?.status === "pending") {
          setPollStatus("Menunggu persetujuan dari perangkat lain…");
          return;
        }
        setPollStatus("Persetujuan diterima. Menyimpan sesi…");
        try {
          await storeAuthSession(response.data);
        } catch (storageError) {
          if (active) {
            setError(errorMessage(storageError, "Persetujuan diterima, tetapi sesi tidak dapat disimpan di perangkat ini."));
            setPollStatus("Sesi gagal disimpan.");
          }
          active = false;
          return;
        }
        if (active) {
          active = false;
          setPollStatus("Login berhasil. Membuka dashboard…");
          window.location.replace("/dashboard");
        }
      } catch (pollError) {
        if (!active) return;
        const status = pollError.response?.status;
        if (status === 429) {
          setPollStatus("Terlalu banyak permintaan. Mencoba kembali…");
          return;
        }
        if (status >= 500) {
          setPollStatus(`Server mengalami kesalahan (HTTP ${status}). Mencoba kembali…`);
          return;
        }
        if (!pollError.response) {
          setPollStatus("Koneksi terputus. Mencoba kembali…");
          return;
        }
        setError(errorMessage(pollError, "Permintaan login tidak dapat digunakan."));
        setPollStatus("Permintaan login berhenti.");
        active = false;
      } finally {
        inFlight = false;
      }
    };

    const pollWhenVisible = () => {
      if (document.visibilityState === "visible") poll();
    };
    const timer = window.setInterval(poll, interval);
    window.addEventListener("focus", poll);
    document.addEventListener("visibilitychange", pollWhenVisible);
    import("@capacitor/app")
      .then(({ App }) => App.addListener("resume", poll))
      .then((listener) => {
        if (active) resumeListener = listener;
        else listener.remove();
      })
      .catch(() => {});
    poll();

    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", poll);
      document.removeEventListener("visibilitychange", pollWhenVisible);
      resumeListener?.remove();
    };
  }, [challenge]);

  return (
    <div className="animate-fade-in text-center">
      <button
        type="button"
        onClick={onBack}
        className="mb-6 block text-sm font-semibold text-blue-700 hover:underline"
      >
        ← Gunakan password
      </button>
      <p className="mb-2 text-sm font-semibold text-[#0078d4]">Login antarperangkat</p>
      <h1 className="text-3xl font-bold tracking-tight text-slate-900">Pindai QR untuk masuk</h1>
      <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-slate-500">
        Tampilkan QR ini untuk dipindai perangkat aktif, atau pindai QR yang ditampilkan perangkat aktif.
      </p>

      {error && (
        <div role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading && (
        <div className="mx-auto my-10 h-10 w-10 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" role="status" />
      )}

      {challenge && (
        <>
          {challenge.qr_payload && <div className="mx-auto mt-6 w-fit rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <QRCodeSVG value={challenge.qr_payload} size={220} level="M" />
          </div>}
          {challenge.reverse && <div className="mx-auto mt-6 max-w-sm rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm font-semibold leading-6 text-emerald-800">
            QR berhasil dipindai. Konfirmasikan kode berikut pada perangkat aktif.
          </div>}
          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Kode pembanding</p>
          <p className="mt-1 text-3xl font-black tracking-[0.28em] text-slate-900">
            {String(challenge.display_code || "").replace(/(\d{3})(\d{3})/, "$1 $2")}
          </p>
          <p className={`mt-3 text-sm font-semibold ${timeLeft <= 30 ? "text-red-600" : "text-slate-500"}`}>
            {timeLeft > 0 ? `Berlaku ${timeLeft} detik` : "Kode sudah kedaluwarsa"}
          </p>
          <p role="status" className="mt-2 text-sm text-slate-500">{pollStatus}</p>
          {!challenge.reverse && (
            <button type="button" onClick={scanOffer} disabled={loading} className="mt-5 w-full rounded-xl border border-[#0067b8] bg-white px-6 py-3 font-semibold text-[#0067b8] hover:bg-blue-50 disabled:opacity-50">
              Pindai QR dari perangkat aktif
            </button>
          )}
        </>
      )}

      {(!challenge || timeLeft === 0) && !loading && (
        <div className="mt-6 grid gap-3">
          <button type="button" onClick={startChallenge} className="w-full rounded-xl bg-[#0067b8] px-6 py-3 font-semibold text-white hover:bg-[#005da6]">Buat QR baru</button>
          <button type="button" onClick={scanOffer} className="w-full rounded-xl border border-[#0067b8] bg-white px-6 py-3 font-semibold text-[#0067b8] hover:bg-blue-50">Pindai QR dari perangkat aktif</button>
        </div>
      )}
    </div>
  );
}
