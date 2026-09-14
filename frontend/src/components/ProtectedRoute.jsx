import { getAuthToken } from "../utils/auth";
import { Navigate } from "react-router-dom";
import { isSessionExpired, logout } from "../utils/auth";

export default function ProtectedRoute({ children }) {
  const token = getAuthToken();
  if (!token || isSessionExpired()) {
    if (token) {
      logout().catch(() => {});
      sessionStorage.setItem(
        "auth_message",
        "Token telah kedaluwarsa. Silakan login kembali.",
      );
    }
    return <Navigate to="/login" replace />;
  }
  return children;
}
