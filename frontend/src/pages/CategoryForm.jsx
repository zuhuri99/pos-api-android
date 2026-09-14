import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../api/axios";
import MobileLayout from "../layouts/MobileLayout";
import ErrorAlert from "../components/ErrorAlert";

export default function CategoryForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  // State untuk input form
  const [name, setName] = useState("");

  // State tambahan untuk menampilkan informasi lama saat edit
  const [originalName, setOriginalName] = useState("");
  const [owner, setOwner] = useState("");

  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  // State untuk mengontrol pop-up sukses
  const [showSuccess, setShowSuccess] = useState(false);

  /* LOAD DATA (EDIT) */
  useEffect(() => {
    if (!isEdit) return;

    api
      .get(`/categories/${id}/`)
      .then((res) => {
        // 🔹 FIX: Sesuaikan dengan struktur API { success: true, data: { ... } }
        // Menggunakan fallback 'res.data' untuk berjaga-jaga jika detail API tidak dibungkus 'data'
        const catData = res.data.data || res.data;

        // Mengisi state berdasarkan properti yang ada di API Anda
        setOriginalName(catData.name);
        setOwner(catData.username || "Tidak diketahui");

        // Isi form dengan nama saat ini agar mudah diedit
        setName(catData.name);
      })
      .catch((err) => {
        console.error("Load category error:", err);
        setError("Gagal memuat data kategori");
      });
  }, [id, isEdit]);

  /* SUBMIT */
  const submit = async () => {
    if (!name.trim()) {
      setError("Nama kategori wajib diisi");
      return;
    }

    setLoading(true);
    try {
      const payload = { name };

      if (isEdit) {
        await api.put(`/categories/${id}/`, payload);
      } else {
        await api.post("/categories/", payload);
      }

      // Tampilkan popup sukses dan tunggu 1.5 detik sebelum redirect
      setShowSuccess(true);
      setTimeout(() => {
        navigate("/expense/categories");
      }, 1500);
    } catch (err) {
      setError(err.response?.data?.message || "Gagal menyimpan kategori");
      setLoading(false);
    }
  };

  return (
    <MobileLayout title={isEdit ? "Edit Category" : "Add Category"}>
      <ErrorAlert message={error} onClose={() => setError(null)} />

      {/* Kontainer form bergaya flat/kotak */}
      <div className="bg-white p-5 shadow space-y-5">
        {/* INFORMASI KATEGORI LAMA (Hanya Tampil Saat Edit Mode) */}
        {isEdit && (
          <div className="bg-gray-100 p-4 border-l-4 border-gray-400 text-sm space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-gray-600 font-medium">
                Nama Kategori Saat Ini:
              </span>
              <span className="font-semibold text-gray-900">
                {originalName || "Memuat..."}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600 font-medium">Pemilik:</span>
              <span className="font-semibold text-gray-900 flex items-center gap-1">
                <svg
                  className="w-4 h-4 text-gray-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                  />
                </svg>
                {owner || "Memuat..."}
              </span>
            </div>
          </div>
        )}

        {/* INPUT FORM */}
        <div>
          <label className="text-sm font-semibold text-gray-800 mb-1 block">
            {isEdit ? "Ubah Nama Kategori Menjadi" : "Nama Kategori"}
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Contoh: Listrik"
            className="w-full bg-gray-50 border-b-2 border-gray-300 focus:border-[#0067b8] outline-none p-2.5 transition-colors"
          />
        </div>

        <button
          onClick={submit}
          disabled={loading || showSuccess}
          className="w-full bg-[#0067b8] text-white font-medium py-2.5 hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {loading && !showSuccess ? "Menyimpan..." : "Simpan"}
        </button>
      </div>

      {/* MODAL SUCCESS (Microsoft UI Style) */}
      {showSuccess && (
        <div className="fixed inset-0 bg-black/40 z-[100] flex items-center justify-center p-4">
          <div className="bg-white p-6 shadow-2xl w-full max-w-sm text-center border-t-4 border-[#0067b8] animate-fade-in">
            <div className="mb-4">
              <svg
                className="w-14 h-14 text-[#0067b8] mx-auto"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="square"
                  strokeLinejoin="miter"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              Tersimpan
            </h3>
            <p className="text-sm text-gray-600">
              Kategori berhasil disimpan ke sistem.
            </p>
          </div>
        </div>
      )}
    </MobileLayout>
  );
}
