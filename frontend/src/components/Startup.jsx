import { useEffect, useState } from "react";
import App from "../App";
import PosServerSetup from "../pages/PosServerSetup";
import { environmentServerProfile, readServerProfile } from "../config/serverProfile";
import { initializeApiEndpoint } from "../config/apiEndpoints";
import { serverSetupEnabled } from "../platform/native";
import { initializeAuthSession } from "../utils/auth";
import { initializeSyncEngine } from "../features/offline/syncEngine";

export default function Startup() {
  const serverRoute = window.location.pathname === "/server";
  const bundledProfile = environmentServerProfile(import.meta.env);
  const needsSetup = serverSetupEnabled && !readServerProfile() && !bundledProfile;
  const opensServerSetup = needsSetup || (serverSetupEnabled && serverRoute);
  const [status, setStatus] = useState("loading");
  useEffect(() => {
    if (opensServerSetup) return;
    let active = true;
    (async () => {
      try {
        await initializeApiEndpoint();
        await initializeAuthSession();
        await initializeSyncEngine();
        if (active) setStatus("ready");
      } catch { if (active) setStatus("error"); }
    })();
    return () => { active = false; };
  }, [opensServerSetup]);
  if (opensServerSetup) return <PosServerSetup />;
  if (status === "error") return <main className="p-8 text-center"><p>Sesi aplikasi gagal dimuat.</p>{serverSetupEnabled ? <a href="/server" className="text-blue-700">Buka pengaturan server</a> : <button type="button" onClick={() => window.location.reload()} className="text-blue-700">Coba lagi</button>}</main>;
  if (status !== "ready") return <div className="min-h-[100dvh] flex items-center justify-center text-slate-600" role="status">Menghubungkan ke server…</div>;
  return <App />;
}
