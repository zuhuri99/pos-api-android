import { readServerProfile } from "../config/serverProfile";
import { buildSsoLoginUrl, openExternal, serverSetupEnabled } from "../platform/native";
import { useState, useRef, useEffect } from "react";
import api from "../api/axios";
import TurnstileWidget from "../components/TurnstileWidget";
import DeviceQrLogin from "../components/DeviceQrLogin";
import { storeAuthSession } from "../utils/auth";
import { getLoginDeviceInfo } from "../platform/deviceInfo";
import {
  getActiveEndpointStatus,
  getApiBaseUrl,
} from "../config/apiEndpoints";

const serverProfile = readServerProfile();
const turnstileEnabled = serverProfile ? serverProfile.turnstileEnabled : import.meta.env.VITE_TURNSTILE_ENABLED === "true";
const turnstileSiteKey = serverProfile ? serverProfile.turnstileSiteKey : import.meta.env.VITE_TURNSTILE_SITE_KEY || "";
const ssoEnabled = serverProfile ? serverProfile.ssoEnabled : import.meta.env.VITE_OIDC_ENABLED === "true";

export default function Login() {
  const isAddingAccount = new URLSearchParams(window.location.search).get("add_account") === "1";
  // === STATE STEPS ===
  // 1: Credential (User/Pass), 2: Choose Method, 3: Input OTP
  const [step, setStep] = useState(1);
  const [loginMode, setLoginMode] = useState("credentials");
  const [userId, setUserId] = useState(null);
  const [loginChallenge, setLoginChallenge] = useState("");
  const [challengeExpiresAt, setChallengeExpiresAt] = useState("");

  // Data Form
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [method, setMethod] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");

  // Data Form OTP (6 Digit)
  const [otp, setOtp] = useState(new Array(6).fill(""));
  const otpInputRefs = useRef([]);

  // State Timer
  const [timeLeft, setTimeLeft] = useState(300); // 5 Menit = 300 detik

  // === STATE UI ===
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(() => {
    const authMessage = sessionStorage.getItem("auth_message") || "";
    sessionStorage.removeItem("auth_message");
    return authMessage;
  });
  const [shake, setShake] = useState(false);
  const [serverStatus, setServerStatus] = useState("checking");
  const [serverFailure, setServerFailure] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);
  const [successUser, setSuccessUser] = useState("");

  const usernameRef = useRef(null);
  const ssoExchangeStarted = useRef(false);

  // Tukar kode opaque satu kali dari callback Django. Token API tidak pernah
  // ditempatkan pada URL browser.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ssoCode = params.get("sso_code");
    const ssoError = params.get("sso_error");
    if (!ssoCode && !ssoError) return;

    window.history.replaceState({}, document.title, "/login");
    if (ssoError) {
      setError("Login ASAS Account gagal atau tidak memiliki akses Finance.");
      return;
    }
    if (ssoExchangeStarted.current) return;
    ssoExchangeStarted.current = true;
    setLoading(true);

    getLoginDeviceInfo().then((device) => api.post("/auth/sso/exchange/", { code: ssoCode, device }, { skipAuth: true }))
      .then(async (res) => {
        await storeAuthSession(res.data);
        window.location.replace("/dashboard");
      })
      .catch((err) => {
        setError(
          err.response?.data?.detail ||
          err.message || "Kode login ASAS Account tidak valid atau sudah kedaluwarsa.",
        );
        setLoading(false);
      });
  }, []);

  // === CEK KESEHATAN SERVER ===
  useEffect(() => {
    const checkServerHealth = async () => {
      const result = await getActiveEndpointStatus();
      setServerFailure(result.ok ? "" : `${result.url}: ${result.message}`);
      setServerStatus(result.ok ? "up" : "down");
    };
    checkServerHealth();
  }, []);

  // === TIMER CHALLENGE LOGIN (BERLAKU UNTUK EMAIL DAN TOTP) ===
  useEffect(() => {
    if (step !== 3 || !challengeExpiresAt) return undefined;

    const updateRemainingTime = () => {
      const expiresAt = Date.parse(challengeExpiresAt);
      const remaining = Number.isFinite(expiresAt)
        ? Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000))
        : 0;
      setTimeLeft(remaining);
    };

    updateRemainingTime();
    const timer = window.setInterval(updateRemainingTime, 1000);
    return () => window.clearInterval(timer);
  }, [step, challengeExpiresAt]);

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60)
      .toString()
      .padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const triggerError = (msg) => {
    setError(msg);
    setShake(true);
    setTimeout(() => setShake(false), 400);
  };

  // === TRANSISI KE STEP 2 (Pilih Metode) ===
  const handleNextToMethod = () => {
    if (!username || !password) return;
    if (turnstileEnabled && !turnstileSiteKey) {
      triggerError("Konfigurasi Turnstile belum lengkap. Hubungi administrator.");
      return;
    }
    setError("");
    setCaptchaToken("");
    setStep(2);
  };

  // === SUBMIT STEP 1 (Ke Backend sekaligus membawa method) ===
  const submitStep1 = async (selectedMethod) => {
    if (turnstileEnabled && !captchaToken) {
      triggerError("Selesaikan verifikasi keamanan terlebih dahulu.");
      return;
    }
    setMethod(selectedMethod);
    setLoading(true);
    setError("");

    try {
      const res = await api.post("/auth/login/step1/", {
        username,
        password,
        method: selectedMethod,
        ...(turnstileEnabled ? { captcha_token: captchaToken } : {}),
      }, { skipAuth: true });

      if (
        res.data?.user_id &&
        res.data?.login_challenge &&
        res.data?.challenge_expires_at
      ) {
        setUserId(res.data.user_id);
        setLoginChallenge(res.data.login_challenge);
        setChallengeExpiresAt(res.data.challenge_expires_at);
        const expiresAt = Date.parse(res.data.challenge_expires_at);
        setTimeLeft(
          Number.isFinite(expiresAt)
            ? Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000))
            : 0,
        );
        setOtp(new Array(6).fill("")); // Reset OTP
        setStep(3);
        setTimeout(() => otpInputRefs.current[0]?.focus(), 100);
      } else {
        triggerError("Respons login tidak lengkap. Silakan ulangi dari awal.");
      }
    } catch (err) {
      console.error("LOGIN STEP 1 ERROR:", err);
      const errorMsg =
        err.response?.data?.message ||
        err.response?.data?.detail ||
        err.response?.data?.error ||
        "We couldn't sign you in. Please verify your credentials.";
      triggerError(errorMsg);
      setCaptchaToken("");
      // Kembali ke step 1 jika kredensial salah
      setStep(1);
    } finally {
      setLoading(false);
    }
  };

  // === OTP INPUT HANDLERS ===
  const handleOtpChange = (element, index) => {
    if (isNaN(element.value)) return;
    const newOtp = [...otp];
    newOtp[index] = element.value;
    setOtp(newOtp);

    // Auto focus ke kotak berikutnya
    if (element.value !== "" && index < 5) {
      otpInputRefs.current[index + 1].focus();
    }
  };

  const handleOtpKeyDown = (e, index) => {
    if (e.key === "Backspace") {
      if (otp[index] === "" && index > 0) {
        otpInputRefs.current[index - 1].focus();
      } else {
        const newOtp = [...otp];
        newOtp[index] = "";
        setOtp(newOtp);
      }
    } else if (e.key === "Enter") {
      const otpToken = otp.join("");
      if (otpToken.length === 6) submitStep2();
    }
  };

  const handleOtpPaste = (e) => {
    e.preventDefault();
    const pastedData = e.clipboardData
      .getData("text/plain")
      .slice(0, 6)
      .split("");
    if (pastedData.some(isNaN)) return;

    const newOtp = [...otp];
    pastedData.forEach((char, i) => {
      newOtp[i] = char;
    });
    setOtp(newOtp);

    const focusIndex = pastedData.length < 6 ? pastedData.length : 5;
    otpInputRefs.current[focusIndex]?.focus();
  };

  // === SUBMIT STEP 2 (Kirim OTP Token) ===
  const submitStep2 = async () => {
    const otpToken = otp.join("");
    if (otpToken.length < 6) {
      triggerError("Please enter the 6-digit code.");
      return;
    }
    if (!loginChallenge || timeLeft <= 0) {
      triggerError("Challenge login telah kedaluwarsa. Silakan masukkan password kembali.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await api.post("/auth/login/step2/", {
        user_id: userId,
        login_challenge: loginChallenge,
        otp_token: otpToken,
        device: await getLoginDeviceInfo(),
      }, { skipAuth: true });

      await storeAuthSession(res.data);
      setLoginChallenge("");
      setChallengeExpiresAt("");
      setPassword("");

      setSuccessUser(res.data.user.username);
      setShowSuccess(true);

      setTimeout(() => {
        window.location.href = "/dashboard";
      }, 1500);
    } catch (err) {
      console.error("LOGIN STEP 2 ERROR:", err);
      const errorMsg =
        err.response?.data?.message ||
        err.response?.data?.detail ||
        err.response?.data?.error ||
        err.message || "Invalid code. Please try again.";
      triggerError(errorMsg);
      // Bersihkan OTP jika salah
      setOtp(new Array(6).fill(""));
      otpInputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  // === LAYAR RENDER KONDISIONAL ===
  if (serverStatus === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f3f2f1] font-[Segoe_UI,sans-serif]">
        <div className="flex flex-col items-center">
          <div className="w-10 h-10 border-4 border-[#0067b8] border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-[#1b1b1b]">Menghubungkan ke server...</p>
        </div>
      </div>
    );
  }

  if (serverStatus === "down") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f3f2f1] font-[Segoe_UI,sans-serif] px-4">
        <div className="bg-white p-8 sm:p-10 shadow-[0_2px_6px_rgba(0,0,0,0.2)] w-full max-w-[440px]">
          <div className="flex items-center gap-2 mb-6">
            <span className="text-red-600 text-3xl">⚠</span>
            <h1 className="text-[24px] font-semibold text-[#1b1b1b]">
              Koneksi Gagal
            </h1>
          </div>
          <p className="text-[15px] text-[#1b1b1b] mb-6 leading-relaxed break-words">
            {serverFailure || "Server tidak dapat dihubungi."}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="bg-[#0067b8] hover:bg-[#005da6] text-white px-8 py-2 font-semibold transition-colors"
          >
            Coba Lagi
          </button>
          {serverSetupEnabled && <a href="/server" className="mt-5 block text-sm text-blue-700">Pengaturan server</a>}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="relative flex min-h-screen items-center overflow-hidden bg-gradient-to-br from-slate-950 via-[#063b64] to-[#0078d4] px-4 py-8 font-[Segoe_UI,sans-serif] sm:px-6">
        <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-cyan-400/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 -right-24 h-[30rem] w-[30rem] rounded-full bg-blue-300/20 blur-3xl" />
        <div
          className={`relative mx-auto grid min-h-[650px] w-full max-w-5xl overflow-hidden rounded-3xl bg-white shadow-[0_30px_90px_rgba(2,20,40,0.38)] transition-transform lg:grid-cols-[0.9fr_1.1fr] ${shake ? "animate-shake" : ""}`}
        >
          <aside className="relative hidden overflow-hidden bg-gradient-to-br from-[#005a9e] to-[#00365e] p-12 text-white lg:flex lg:flex-col lg:justify-between">
            <div className="absolute -right-24 top-24 h-72 w-72 rounded-full border border-white/10" />
            <div className="absolute -right-12 top-36 h-48 w-48 rounded-full border border-white/10" />
            <div className="relative">
              <div className="mb-8 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20">
                <img src={import.meta.env.VITE_LOGO_1 || "/finance.svg"} alt="" className="h-7 w-7 object-contain" />
              </div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-200">Finance System</p>
              <h2 className="mt-5 max-w-sm text-4xl font-semibold leading-tight">Keuangan lebih rapi, keputusan lebih pasti.</h2>
              <p className="mt-5 max-w-sm text-base leading-7 text-blue-100/80">Kelola transaksi dan laporan dalam satu ruang kerja yang aman.</p>
            </div>
            <div className="relative flex items-center gap-3 text-sm text-blue-100/80">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-300">✓</span>
              Dilindungi verifikasi dua langkah
            </div>
          </aside>

          <main className="flex items-center px-6 py-10 sm:px-12 lg:px-16">
            <div className="mx-auto w-full max-w-md">
          {isAddingAccount && <a href="/dashboard" className="mb-4 block text-sm font-semibold text-blue-700">← Kembali tanpa menambah akun</a>}
          {serverSetupEnabled && <a href="/server" className="mb-6 block break-all text-sm text-blue-700">{serverProfile ? `Server: ${new URL(serverProfile.serverUrl).host} · Ubah` : "Pengaturan server"}</a>}
          {/* Header Logo */}
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <img
              src={import.meta.env.VITE_LOGO_1 || "/finance.svg"}
              alt="Logo"
              className="h-8 w-8 object-contain"
            />
            <span className="text-lg font-semibold tracking-tight text-slate-700">
              Finance System
            </span>
          </div>

          {loginMode === "credentials" && <div className="mb-7 flex items-center gap-2" aria-label={`Langkah ${step} dari 3`}>
            {[1, 2, 3].map((item) => (
              <div key={item} className={`h-1.5 flex-1 rounded-full transition-colors ${item <= step ? "bg-[#0078d4]" : "bg-slate-200"}`} />
            ))}
          </div>}

          {loginMode === "credentials" && error && (
            <div role="alert" className="mb-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm text-red-700 animate-fade-in">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-100 font-bold">!</span>
              <span>{error}</span>
            </div>
          )}

          {/* ==============================================
              STEP 1: USERNAME & PASSWORD ONLY
              ============================================== */}
          {loginMode === "qr" && (
            <DeviceQrLogin onBack={() => { setError(""); setLoginMode("credentials"); }} />
          )}

          {loginMode === "credentials" && step === 1 && (
            <div className="animate-fade-in">
              <p className="mb-2 text-sm font-semibold text-[#0078d4]">{isAddingAccount ? "Tambahkan akun" : "Selamat datang kembali"}</p>
              <h1 className="mb-2 text-3xl font-bold tracking-tight text-slate-900">
                {isAddingAccount ? "Masuk dengan akun lain" : "Masuk ke akun Anda"}
              </h1>
              <p className="mb-8 text-sm leading-6 text-slate-500">Gunakan akun Finance System untuk melanjutkan.</p>

              {ssoEnabled && (
                <>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await openExternal(buildSsoLoginUrl(getApiBaseUrl()));
                      } catch { setError("Login SSO gagal dibuka."); }
                    }}
                    disabled={loading}
                    className="mb-6 w-full rounded-xl border border-[#0067b8] bg-white px-6 py-3 font-semibold text-[#0067b8] transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Masuk dengan ASAS Account
                  </button>
                  <div className="mb-6 flex items-center gap-3 text-xs uppercase tracking-wider text-slate-400">
                    <span className="h-px flex-1 bg-slate-200" />
                    atau gunakan akun lama
                    <span className="h-px flex-1 bg-slate-200" />
                  </div>
                </>
              )}

              <label className="mb-5 block">
                <span className="mb-2 block text-sm font-semibold text-slate-700">Username atau email</span>
                <input
                  ref={usernameRef}
                  type="text"
                  placeholder="Masukkan username atau email"
                  autoComplete="username"
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-[15px] text-slate-900 outline-none transition focus:border-[#0078d4] focus:bg-white focus:ring-4 focus:ring-blue-100 placeholder:text-slate-400"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    setError("");
                  }}
                  disabled={loading}
                  onKeyDown={(e) => e.key === "Enter" && handleNextToMethod()}
                />
              </label>

              <label className="mb-8 block">
                <span className="mb-2 block text-sm font-semibold text-slate-700">Password</span>
                <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Masukkan password"
                  autoComplete="current-password"
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 pr-20 text-[15px] text-slate-900 outline-none transition focus:border-[#0078d4] focus:bg-white focus:ring-4 focus:ring-blue-100 placeholder:text-slate-400"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError("");
                  }}
                  disabled={loading}
                  onKeyDown={(e) => e.key === "Enter" && handleNextToMethod()}
                />
                <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute inset-y-0 right-3 text-xs font-semibold text-[#0067b8] hover:text-[#004f87]">
                  {showPassword ? "Sembunyikan" : "Lihat"}
                </button>
                </div>
              </label>

              <div>
                <button
                  onClick={handleNextToMethod}
                  disabled={loading || !username || !password}
                  className="w-full rounded-xl bg-[#0067b8] px-6 py-3 font-semibold text-white shadow-lg shadow-blue-700/20 transition hover:-translate-y-0.5 hover:bg-[#005da6] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
                >
                  Lanjutkan
                </button>
                <button
                  type="button"
                  onClick={() => { setError(""); setLoginMode("qr"); }}
                  disabled={loading}
                  className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-6 py-3 font-semibold text-slate-700 transition hover:border-blue-300 hover:bg-blue-50"
                >
                  Masuk dengan QR perangkat lain
                </button>
              </div>
            </div>
          )}

          {/* ==============================================
              STEP 2: PILIH METODE 2FA (Otomatis Submit)
              ============================================== */}
          {loginMode === "credentials" && step === 2 && (
            <div className="animate-fade-in">
              <button type="button" className="group mb-7 flex items-center gap-2 text-sm text-slate-600" onClick={() => { setCaptchaToken(""); setLoginChallenge(""); setChallengeExpiresAt(""); setStep(1); }}>
                <span className="text-[#0067b8] text-[20px] font-bold mt-[-2px] group-hover:text-[#005da6]">
                  ←
                </span>
                <span className="group-hover:underline">
                  {username}
                </span>
              </button>

              <h1 className="mb-2 text-3xl font-bold tracking-tight text-slate-900">
                Verifikasi identitas
              </h1>
              <p className="mb-7 text-sm leading-6 text-slate-500">
                Pilih metode verifikasi yang paling mudah Anda akses.
              </p>

              {turnstileEnabled && (
                <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <TurnstileWidget
                    siteKey={turnstileSiteKey}
                    onTokenChange={setCaptchaToken}
                  />
                </div>
              )}

              <div className="flex flex-col gap-3">
                {/* Opsi TOTP */}
                <button
                  onClick={() => submitStep1("totp")}
                  disabled={loading || (turnstileEnabled && !captchaToken)}
                  className="group flex items-center gap-4 rounded-2xl border border-slate-200 p-4 text-left transition hover:-translate-y-0.5 hover:border-blue-300 hover:bg-blue-50/60 hover:shadow-md disabled:opacity-50"
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-2xl">📱</div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-semibold text-slate-900">
                      Aplikasi Authenticator
                    </div>
                    <div className="mt-0.5 text-[13px] text-slate-500">
                      Ambil kode dari aplikasi authenticator
                    </div>
                  </div>
                  <span className="text-xl text-slate-300 transition group-hover:translate-x-1 group-hover:text-blue-500">›</span>
                </button>

                {/* Opsi Email */}
                <button
                  onClick={() => submitStep1("email")}
                  disabled={loading || (turnstileEnabled && !captchaToken)}
                  className="group flex items-center gap-4 rounded-2xl border border-slate-200 p-4 text-left transition hover:-translate-y-0.5 hover:border-blue-300 hover:bg-blue-50/60 hover:shadow-md disabled:opacity-50"
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-cyan-100 text-2xl">✉️</div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-semibold text-slate-900">
                      Alamat Email
                    </div>
                    <div className="mt-0.5 text-[13px] text-slate-500">
                      Kirim kode ke email yang terdaftar
                    </div>
                  </div>
                  <span className="text-xl text-slate-300 transition group-hover:translate-x-1 group-hover:text-blue-500">›</span>
                </button>
              </div>

              {loading && (
                <div className="mt-4 flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-[#0067b8] border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-sm text-gray-600">Processing...</span>
                </div>
              )}
            </div>
          )}

          {/* ==============================================
              STEP 3: 6-DIGIT OTP INPUT
              ============================================== */}
          {loginMode === "credentials" && step === 3 && (
            <div className="animate-fade-in">
              <button type="button" className="group mb-7 flex items-center gap-2 text-sm text-slate-600" onClick={() => { setLoginChallenge(""); setChallengeExpiresAt(""); setStep(2); }}>
                <span className="text-[#0067b8] text-[20px] font-bold mt-[-2px] group-hover:text-[#005da6]">
                  ←
                </span>
                <span className="group-hover:underline">
                  Pilih metode lain
                </span>
              </button>

              <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-2xl ring-1 ring-blue-100">
                {method === "totp" ? "📱" : "✉️"}
              </div>
              <h1 className="mb-2 text-3xl font-bold tracking-tight text-slate-900">
                Masukkan kode OTP
              </h1>

              <div className="mb-7 flex items-start justify-between gap-3">
                <p className="flex-1 text-sm leading-6 text-slate-500">
                  Ketik enam digit kode dari{" "}
                  {method === "totp" ? <b className="text-slate-700">aplikasi authenticator</b> : <b className="text-slate-700">email Anda</b>}.
                </p>
                {(
                  <div
                    className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold tabular-nums ${timeLeft <= 60 ? "bg-red-50 text-red-600" : "bg-blue-50 text-[#0067b8]"}`}
                  >
                    {formatTime(timeLeft)}
                  </div>
                )}
              </div>

              {/* 6 Kotak Input OTP Modern (Responsif Mobile) */}
              <div
                className="mb-7 grid w-full grid-cols-6 gap-1.5 sm:gap-2.5"
                onPaste={handleOtpPaste}
              >
                {otp.map((data, index) => (
                  <input
                    key={index}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength="1"
                    ref={(el) => (otpInputRefs.current[index] = el)}
                    value={data}
                    onChange={(e) => handleOtpChange(e.target, index)}
                    onKeyDown={(e) => handleOtpKeyDown(e, index)}
                    disabled={loading || timeLeft === 0}
                    aria-label={`Digit OTP ${index + 1}`}
                    className="aspect-square min-w-0 rounded-xl border-2 border-slate-200 bg-slate-50 text-center text-xl font-bold text-slate-900 outline-none transition focus:-translate-y-0.5 focus:border-[#0078d4] focus:bg-white focus:ring-4 focus:ring-blue-100 disabled:bg-slate-100 sm:text-2xl"
                    autoComplete={index === 0 ? "one-time-code" : "off"}
                  />
                ))}
              </div>

              {timeLeft === 0 && (
                <div className="mb-5 rounded-xl bg-red-50 p-3 text-center text-sm text-red-600">
                  Kode sudah kedaluwarsa. Kembali dan minta kode baru.
                </div>
              )}

              <div className="mt-4">
                <button
                  onClick={submitStep2}
                  disabled={
                    loading ||
                    otp.join("").length < 6 ||
                    timeLeft === 0
                  }
                  className="w-full rounded-xl bg-[#0067b8] px-6 py-3 font-semibold text-white shadow-lg shadow-blue-700/20 transition hover:-translate-y-0.5 hover:bg-[#005da6] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
                >
                  {loading ? "Memverifikasi..." : "Verifikasi & masuk"}
                </button>
              </div>
            </div>
          )}
            </div>
          </main>
        </div>
      </div>

      {/* SUCCESS MODAL */}
      {showSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-[400px] bg-white p-8 shadow-2xl animate-fade-in">
            <div className="flex flex-col items-center text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#dff6dd] text-[#107c10] text-2xl font-bold">
                ✓
              </div>
              <h2 className="text-[20px] font-semibold text-[#1b1b1b]">
                Sign in successful
              </h2>
              <p className="mt-2 text-[15px] text-[#1b1b1b]">
                Welcome back, <b>{successUser}</b>
              </p>
              <div className="mt-6 w-full flex justify-center items-center gap-2">
                <div className="w-4 h-4 border-2 border-[#0067b8] border-t-transparent rounded-full animate-spin"></div>
                <span className="text-[13px] text-gray-500">
                  Redirecting...
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CSS Animasi */}
      <style>
        {`
          @keyframes shake {
            0%,100% { transform: translateX(0); }
            20% { transform: translateX(-6px); }
            40% { transform: translateX(6px); }
            60% { transform: translateX(-4px); }
            80% { transform: translateX(4px); }
          }
          .animate-shake {
            animation: shake 0.4s ease-in-out;
          }
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(-4px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .animate-fade-in {
            animation: fadeIn 0.2s ease-out forwards;
          }
        `}
      </style>
    </>
  );
}
