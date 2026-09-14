import { useEffect, useRef, useState } from "react";

const SCRIPT_ID = "cloudflare-turnstile-script";
const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

function loadTurnstileScript() {
  if (window.turnstile) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID);
    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

export default function TurnstileWidget({ siteKey, onTokenChange }) {
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);
  const callbackRef = useRef(onTokenChange);
  const [loadError, setLoadError] = useState(false);
  const [errorCode, setErrorCode] = useState("");

  useEffect(() => {
    callbackRef.current = onTokenChange;
  }, [onTokenChange]);

  useEffect(() => {
    let disposed = false;

    loadTurnstileScript()
      .then(() => {
        if (disposed || !containerRef.current || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          action: "login",
          theme: "auto",
          size: "flexible",
          callback: (token) => callbackRef.current(token),
          "expired-callback": () => callbackRef.current(""),
          "timeout-callback": () => callbackRef.current(""),
          "error-callback": (code) => {
            callbackRef.current("");
            setErrorCode(String(code || ""));
            setLoadError(true);
          },
        });
      })
      .catch(() => {
        if (!disposed) setLoadError(true);
      });

    return () => {
      disposed = true;
      callbackRef.current("");
      if (widgetIdRef.current !== null && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
      }
    };
  }, [siteKey]);

  if (loadError) {
    return (
      <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
        Verifikasi keamanan gagal dimuat{errorCode ? ` (kode ${errorCode})` : ""}.
        Pastikan koneksi ke challenges.cloudflare.com tidak diblokir, lalu coba lagi.
      </div>
    );
  }

  return (
    <div className="min-h-[65px] w-full overflow-hidden" aria-label="Verifikasi keamanan Cloudflare Turnstile">
      <div ref={containerRef} className="w-full" />
    </div>
  );
}
