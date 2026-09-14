import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { isNative } from "../platform/native";

export default function NativeNavigation() {
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    if (!isNative) return;
    let disposed = false;
    let handle;
    import("@capacitor/app").then(async ({ App }) => {
      handle = await App.addListener("backButton", () => {
        if (window.history.state?.idx > 0) navigate(-1);
        else if (!["/pos", "/login", "/server"].includes(location.pathname)) navigate("/pos", { replace: true });
        else App.minimizeApp();
      });
      if (disposed) handle.remove();
    });
    return () => { disposed = true; handle?.remove(); };
  }, [navigate, location.pathname]);
  return null;
}
