import { isNative, scanPayrollCode } from "../../../platform/native";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getApiError, listResults, payrollApi } from "../../../api/payrollApi";
import PayrollShell from "../components/PayrollShell";
import {
  ErrorBanner,
  Field,
  inputClass,
  primaryButton,
  secondaryButton,
  StatusPill,
} from "../components/PayrollUI";
import { formatCurrency, formatDate } from "../payrollUtils";

const extractIdentifier = (rawValue) => {
  const value = String(rawValue || "").trim();
  if (!value) return "";
  try {
    const url = new URL(value);
    return (
      url.searchParams.get("legacy_uid") ||
      url.searchParams.get("legacy_id") ||
      url.searchParams.get("public_token") ||
      url.pathname.split("/").filter(Boolean).pop() ||
      value
    );
  } catch {
    return value;
  }
};

export default function PayrollValidation() {
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const frameRef = useRef(null);
  const detectorRef = useRef(null);
  const validatingRef = useRef(false);
  const [validationCode, setValidationCode] = useState("");
  const [slip, setSlip] = useState(null);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");

  const stopCamera = useCallback(() => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setScanning(false);
  }, []);

  const validatePayroll = useCallback(
    async (rawValue) => {
      const normalized = extractIdentifier(rawValue);
      if (!normalized || validatingRef.current) return false;
      validatingRef.current = true;
      setValidationCode(normalized);
      setLoading(true);
      setSlip(null);
      setError("");
      try {
        // Backend belum menyediakan filter token, jadi muat seluruh halaman slip
        // dan cari public_token/legacy_uid dari kumpulan data yang sama.
        const response = await payrollApi.slips.all();
        const results = listResults(response.data);
        let match = results.find(
          (item) => String(item.public_token ?? "").trim() === normalized,
        );

        if (!match) {
          match = results.find(
            (item) => String(item.legacy_uid ?? "").trim() === normalized,
          );
        }

        if (!match) throw new Error("Kode tidak ditemukan pada data payroll.");
        setSlip(match);
        stopCamera();
        return true;
      } catch (err) {
        setError(getApiError(err, "Data payroll tidak dapat divalidasi."));
        return false;
      } finally {
        setLoading(false);
        validatingRef.current = false;
      }
    },
    [stopCamera],
  );

  const scanFrame = useCallback(async () => {
    if (!videoRef.current || !detectorRef.current || validatingRef.current)
      return;
    try {
      const codes = await detectorRef.current.detect(videoRef.current);
      if (codes.length) {
        const found = await validatePayroll(codes[0].rawValue);
        if (found) return;
      }
    } catch {
      // Frame kamera yang belum siap dapat gagal; lanjutkan ke frame berikutnya.
    }
    frameRef.current = requestAnimationFrame(scanFrame);
  }, [validatePayroll]);

  const startCamera = async () => {
    if (isNative) {
      setError("");
      try { const code = await scanPayrollCode(); if (code) await validatePayroll(code); }
      catch (err) { if (!/cancel/i.test(err.message || "")) setError(err.message || "Pemindai gagal dibuka."); }
      return;
    }
    setError("");
    setSlip(null);
    if (!("BarcodeDetector" in window)) {
      setError(
        "Pemindai QR belum didukung browser ini. Gunakan Chrome/Edge terbaru atau masukkan kode secara manual.",
      );
      return;
    }
    try {
      detectorRef.current = new window.BarcodeDetector({
        formats: ["qr_code"],
      });
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setScanning(true);
      frameRef.current = requestAnimationFrame(scanFrame);
    } catch (err) {
      stopCamera();
      setError(
        err?.name === "NotAllowedError"
          ? "Izin kamera ditolak. Izinkan akses kamera pada browser, lalu coba lagi."
          : "Kamera tidak dapat dibuka. Pastikan perangkat memiliki kamera dan halaman memakai HTTPS.",
      );
    }
  };

  useEffect(() => () => stopCamera(), [stopCamera]);

  const submitManual = (event) => {
    event.preventDefault();
    validatePayroll(validationCode);
  };

  return (
    <PayrollShell title="Validasi Payroll">
      <div className="grid lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)] gap-4">
        <section className="bg-white border border-gray-200 p-4 sm:p-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h2 className="font-bold text-gray-900">Scan QR Payroll</h2>
              <p className="text-sm text-gray-500 mt-1">
                Arahkan kamera ke QR pada dokumen slip.
              </p>
            </div>
            {scanning ? (
              <button
                type="button"
                onClick={stopCamera}
                className={secondaryButton}
              >
                Hentikan
              </button>
            ) : (
              <button
                type="button"
                onClick={startCamera}
                className={primaryButton}
              >
                Buka kamera
              </button>
            )}
          </div>
          <div className="relative bg-gray-950 aspect-[4/3] overflow-hidden flex items-center justify-center">
            <video
              ref={videoRef}
              muted
              playsInline
              className={`w-full h-full object-cover ${scanning ? "block" : "hidden"}`}
            />
            {!scanning && (
              <div className="text-center px-6">
                <div className="mx-auto w-14 h-14 border-2 border-dashed border-gray-500 flex items-center justify-center text-2xl text-gray-400">
                  ⌗
                </div>
                <p className="text-sm text-gray-400 mt-3">Kamera belum aktif</p>
              </div>
            )}
            {scanning && (
              <div className="absolute inset-[15%] border-2 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.3)] pointer-events-none">
                <span className="absolute -bottom-7 inset-x-0 text-center text-xs text-white">
                  Posisikan QR di dalam kotak
                </span>
              </div>
            )}
          </div>
          <form
            onSubmit={submitManual}
            className="mt-5 flex flex-col sm:flex-row sm:items-end gap-3"
          >
            <div className="flex-1">
              <Field
                label="Kode validasi"
                hint="Tempel kode atau URL QR secara manual"
              >
                <input
                  className={inputClass}
                  value={validationCode}
                  onChange={(event) => setValidationCode(event.target.value)}
                  placeholder="Masukkan kode validasi"
                  autoComplete="off"
                />
              </Field>
            </div>
            <button
              disabled={loading || !validationCode.trim()}
              className={primaryButton}
            >
              {loading ? "Memvalidasi..." : "Validasi"}
            </button>
          </form>
        </section>

        <section aria-live="polite">
          <ErrorBanner message={error} />
          {loading && (
            <div className="bg-white border border-blue-200 p-8 text-center h-full min-h-64 flex flex-col items-center justify-center">
              <div
                className="w-12 h-12 rounded-full border-4 border-blue-100 border-t-blue-600 animate-spin"
                aria-hidden="true"
              />
              <h2 className="font-semibold text-gray-800 mt-4">
                Sedang mencari slip
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                Seluruh data slip sedang diperiksa. Mohon tunggu.
              </p>
            </div>
          )}
          {!loading && !slip && !error && (
            <div className="bg-white border border-dashed border-gray-300 p-8 text-center h-full min-h-64 flex flex-col items-center justify-center">
              <div className="w-12 h-12 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center text-xl">
                ?
              </div>
              <h2 className="font-semibold text-gray-800 mt-3">
                Belum ada hasil
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                Scan QR atau masukkan kode untuk melihat status slip.
              </p>
            </div>
          )}
          {slip && (
            <div className="bg-white border border-green-300 overflow-hidden">
              <div className="bg-green-700 text-white p-5">
                <p className="text-xs font-bold uppercase tracking-wider text-green-100">
                  Data valid
                </p>
                <h2 className="text-xl font-bold mt-1">Slip ditemukan</h2>
              </div>
              <div className="p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-gray-500">Karyawan</p>
                    <p className="font-bold text-gray-900">
                      {slip.employee_name || "-"}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {slip.document_reference || "-"}
                    </p>
                  </div>
                  <StatusPill status={slip.status} />
                </div>
                <dl className="border-y divide-y text-sm">
                  <ResultRow label="Kode validasi" value={validationCode} />
                  <ResultRow
                    label="Periode"
                    value={`${formatDate(slip.period_start)} – ${formatDate(slip.period_end)}`}
                  />
                  <ResultRow
                    label="Total upah"
                    value={formatCurrency(slip.total_before_adjustments)}
                  />
                </dl>
                <button
                  type="button"
                  onClick={() => navigate(`/payroll/slips/${slip.id}`)}
                  className={`${primaryButton} w-full`}
                >
                  Lihat detail slip
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </PayrollShell>
  );
}

function ResultRow({ label, value }) {
  return (
    <div className="flex justify-between gap-4 py-3">
      <dt className="text-gray-500">{label}</dt>
      <dd className="font-semibold text-right text-gray-900">{value || "-"}</dd>
    </div>
  );
}
