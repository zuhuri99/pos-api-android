import { useEffect, useMemo, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import api from "../api/axios";
import { getAuthToken, isSessionExpired, logout } from "../utils/auth";

export default function PublicOnlyRoute({ children }) {
  const location = useLocation();
  const isSsoCallback = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.has("sso_code") || params.has("sso_error");
  }, [location.search]);
  const isAddingAccount = useMemo(() => new URLSearchParams(location.search).get("add_account") === "1", [location.search]);
  const token = getAuthToken();
  const expired = Boolean(token && isSessionExpired());
  const shouldVerify = Boolean(!isSsoCallback && !isAddingAccount && token && !expired);
  const [status, setStatus] = useState("checking");

  useEffect(() => {
    let active = true;

    if (!shouldVerify) {
      if (expired && !isSsoCallback && !isAddingAccount) logout().catch(() => {});
      return () => { active = false; };
    }
    if (!navigator.onLine) {
      return () => { active = false; };
    }

    api.get("/auth/token/verify/")
      .then(() => {
        if (active) setStatus("authenticated");
      })
      .catch(async () => {
        const nextAccount = await logout().catch(() => null);
        if (active) setStatus(nextAccount ? "authenticated" : "guest");
      });

    return () => { active = false; };
  }, [expired, isAddingAccount, isSsoCallback, shouldVerify]);

  if (!shouldVerify) return children;
  if (!navigator.onLine) return <Navigate replace to="/pos" />;
  if (status === "authenticated") return <Navigate replace to="/pos" />;
  if (status === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f3f2f1]" role="status">
        <div className="text-center text-slate-600">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-[#0067b8] border-t-transparent" />
          <p>Memeriksa sesi…</p>
        </div>
      </div>
    );
  }
  return children;
}
