import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";
import MobileLayout from "../layouts/MobileLayout";

export default function Categories() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  // State untuk Filter User
  const [selectedUser, setSelectedUser] = useState("");

  // State untuk Custom Pop-up (Modal) React
  const [confirmInfo, setConfirmInfo] = useState(null);
  const [alertInfo, setAlertInfo] = useState(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await api.get("/categories/");
      if (res.data?.success) {
        setItems(res.data.data);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // ==========================================
  // LOGIKA FILTER
  // ==========================================

  const uniqueUsers = useMemo(() => {
    const users = items.map(
      (cat) => cat.username || cat.user?.username || "Unknown",
    );
    return [...new Set(users)];
  }, [items]);

  const filteredItems = useMemo(() => {
    if (!selectedUser) return items;
    return items.filter((cat) => {
      const catUser = cat.username || cat.user?.username || "Unknown";
      return catUser === selectedUser;
    });
  }, [items, selectedUser]);

  // ==========================================
  // LOGIKA HAPUS (REACT MODAL)
  // ==========================================

  const handleDeleteClick = (cat) => {
    setConfirmInfo({
      id: cat.id,
      name: cat.name,
    });
  };

  const executeDelete = async () => {
    if (!confirmInfo) return;

    try {
      const res = await api.delete(`/categories/${confirmInfo.id}/`);

      if (res.status === 200) {
        setAlertInfo({ type: "success", message: "Kategori berhasil dihapus" });
        loadData();
      } else {
        setAlertInfo({ type: "error", message: "Gagal menghapus kategori" });
      }
    } catch (err) {
      console.error("Delete category error:", err);
      setAlertInfo({
        type: "error",
        message: "Terjadi kesalahan saat menghapus kategori",
      });
    } finally {
      setConfirmInfo(null);
    }
  };

  return (
    <MobileLayout title="Categories">
      {/* LOADING STATE */}
      {loading && (
        <div className="text-center text-sm text-gray-500 my-4">Loading...</div>
      )}

      {/* FILTER USER */}
      {uniqueUsers.length > 1 && (
        <div className="mt-2 mb-4">
          <select
            value={selectedUser}
            onChange={(e) => setSelectedUser(e.target.value)}
            className="w-full p-3 bg-gray-50 border-b-2 border-gray-300 focus:outline-none focus:border-[#0067b8] text-gray-800 transition-colors rounded-none appearance-none font-medium text-sm"
          >
            <option value="">Semua User</option>
            {uniqueUsers.map((user, idx) => (
              <option key={idx} value={user}>
                User: {user}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* LIST KATEGORI */}
      <div className="bg-white border border-gray-200 mt-2 mb-4">
        {filteredItems.map((cat, index) => {
          const catUser = cat.username || cat.user?.username || "Unknown";

          return (
            <div
              key={cat.id}
              className={`p-4 flex justify-between items-center hover:bg-gray-50 transition-colors ${
                index !== filteredItems.length - 1
                  ? "border-b border-gray-200"
                  : ""
              }`}
            >
              <div className="flex flex-col">
                <span className="font-semibold text-gray-800">{cat.name}</span>
                {/* Penanda Username */}
                <span className="text-xs text-gray-500 mt-1 font-medium bg-gray-100 w-max px-2 py-0.5 border border-gray-200">
                  👤 {catUser}
                </span>
              </div>

              <div className="flex gap-4 text-sm font-medium">
                <button
                  onClick={() => navigate(`/expense/categories/${cat.id}/edit`)}
                  className="text-[#0067b8] hover:underline"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDeleteClick(cat)}
                  className="text-[#d13438] hover:underline"
                >
                  Hapus
                </button>
              </div>
            </div>
          );
        })}

        {filteredItems.length === 0 && !loading && (
          <div className="p-6 text-center text-gray-500 text-sm">
            {items.length > 0
              ? "Kategori tidak ditemukan untuk user ini"
              : "Belum ada kategori"}
          </div>
        )}
      </div>

      {/* 🔹 FAB (PERSIS SEPERTI TRANSACTIONS.JSX) 🔹 */}
      <div className="sticky -bottom-2 z-40 flex justify-end -mx-6 px-4 pointer-events-none -mt-12 mb-2">
        <button
          onClick={() => navigate("/categories/new")}
          className="pointer-events-auto bg-[#0067b8] text-white w-12 h-12 shadow-[0_4px_12px_rgba(0,0,0,0.3)] text-3xl hover:bg-[#005a9e] active:bg-[#004578] transition-colors flex items-center justify-center font-light"
          title="Tambah Kategori"
        >
          +
        </button>
      </div>

      {/* ======================================================== */}
      {/* 🔹 CUSTOM REACT MODALS (MENGGANTIKAN ALERT & CONFIRM) 🔹 */}
      {/* ======================================================== */}

      {/* 1. Modal Konfirmasi Hapus */}
      {confirmInfo && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm">
          <div className="bg-white p-6 w-full max-w-sm shadow-xl border border-gray-200">
            <h3 className="text-xl font-semibold mb-2 text-gray-900">
              Konfirmasi
            </h3>
            <p className="text-gray-600 mb-6">
              Apakah Anda yakin ingin menghapus kategori{" "}
              <span className="font-bold text-gray-800">
                "{confirmInfo.name}"
              </span>
              ?
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmInfo(null)}
                className="px-5 py-2 bg-gray-200 text-gray-800 hover:bg-gray-300 transition-colors font-medium"
              >
                Batal
              </button>
              <button
                onClick={executeDelete}
                className="px-5 py-2 bg-[#d13438] text-white hover:bg-[#b32b2b] transition-colors font-medium"
              >
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Modal Informasi (Sukses / Error) */}
      {alertInfo && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm">
          <div className="bg-white p-6 w-full max-w-sm shadow-xl border border-gray-200 text-center">
            <div
              className={`text-5xl mb-4 ${
                alertInfo.type === "success"
                  ? "text-green-600"
                  : "text-[#d13438]"
              }`}
            >
              {alertInfo.type === "success" ? "✓" : "⚠"}
            </div>
            <p className="text-gray-800 mb-6 font-medium">
              {alertInfo.message}
            </p>
            <button
              onClick={() => setAlertInfo(null)}
              className="px-6 py-2 bg-[#0067b8] text-white hover:bg-[#005da6] w-full transition-colors font-medium"
            >
              Tutup
            </button>
          </div>
        </div>
      )}
    </MobileLayout>
  );
}
