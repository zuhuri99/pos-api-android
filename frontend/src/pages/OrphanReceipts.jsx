import { useCallback, useEffect, useState } from "react";
import api from "../api/axios";
import { getApiError } from "../api/payrollApi";
import ConfirmModal from "../components/ConfirmModal";
import MobileLayout from "../layouts/MobileLayout";

const CLEANUP_DELETE_LIMIT = 40;

/* ===============================
   COMPONENT
   =============================== */
export default function OrphanReceipts() {
  const [files, setFiles] = useState([]);
  const [total, setTotal] = useState(0);
  const [receiptUrls, setReceiptUrls] = useState({});
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  /* ===============================
     FETCH ORPHAN RECEIPTS
     =============================== */
  const fetchOrphans = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await api.get("/storage/orphan-receipts/");
      if (res.data?.success) {
        const fileList = res.data.files || [];
        setFiles(fileList);
        setTotal(res.data.total_orphan || 0);

        setReceiptUrls(res.data.access_urls || {});
      } else {
        setError("Gagal memuat daftar foto.");
      }
    } catch (err) {
      console.error("Fetch orphan receipts error:", err);
      setError(getApiError(err, "Tidak dapat mengambil data foto."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrphans();
  }, [fetchOrphans]);

  /* ===============================
     DELETE ORPHAN RECEIPTS
     =============================== */
  const deleteOrphans = async () => {
    if (total > CLEANUP_DELETE_LIMIT) {
      setShowDeleteConfirm(false);
      setError(
        `Penghapusan dibatasi maksimal ${CLEANUP_DELETE_LIMIT} foto sekali proses. Saat ini ada ${total} foto orphan.`,
      );
      return;
    }

    setDeleting(true);
    setError(null);

    try {
      const res = await api.post(
        "/storage/orphan-receipts/cleanup/",
        { confirm: true },
        {
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      if (res.data?.success) {
        setShowDeleteConfirm(false);
        setSuccessMessage(`Berhasil menghapus ${res.data.deleted} foto.`);
        setFiles([]);
        setTotal(0);
        setReceiptUrls({});
      } else {
        setError("Gagal menghapus foto.");
      }
    } catch (err) {
      console.error("Delete orphan receipts error:", err);
      setError(getApiError(err, "Terjadi kesalahan saat menghapus foto."));
    } finally {
      setDeleting(false);
    }
  };

  const exceedsDeleteLimit = total > CLEANUP_DELETE_LIMIT;

  /* ===============================
     RENDER
     =============================== */
  return (
    <MobileLayout title="Bukti Foto Diedit/Dihapus dari Expense">
      {/* INFO */}
      <div className="bg-blue-50 p-3 rounded-lg mb-4 text-sm overflow-hidden">
        <div className="font-semibold text-blue-700">
          Total Bukti Foto Tidak Digunakan
        </div>
        <div className="text-lg font-bold">{total}</div>
        <div className="text-xs text-gray-600 mt-1">
          Foto private yang tidak lagi terhubung dengan transaksi.
        </div>
      </div>

      {/* ERROR */}
      {error && (
        <div role="alert" className="bg-red-50 text-red-700 p-3 rounded mb-4 text-sm">
          {error}
        </div>
      )}

      {exceedsDeleteLimit && (
        <div role="alert" className="bg-amber-50 text-amber-800 p-3 rounded mb-4 text-sm">
          Terdapat {total} foto orphan. Cleanup otomatis hanya dapat menghapus
          maksimal {" "}{CLEANUP_DELETE_LIMIT} foto sekali proses. Kurangi jumlah
          file terlebih dahulu atau hubungi administrator.
        </div>
      )}

      {/* LOADING */}
      {loading && (
        <div className="text-center text-sm text-gray-500">
          Memuat daftar foto...
        </div>
      )}

      {/* EMPTY */}
      {!loading && files.length === 0 && (
        <div className="text-center text-sm text-gray-500">
          Tidak ada foto diedit/dihapus dari transaksi 🎉
        </div>
      )}

      {/* GRID IMAGES */}
      {!loading && files.length > 0 && (
        <div className="grid grid-cols-2 gap-3 mb-6">
          {files.map((file) => (
            <div key={file} className="bg-white rounded shadow overflow-hidden">
              <img
                src={receiptUrls[file] || ""}
                alt={file}
                className="w-full h-40 object-cover"
                loading="lazy"
                referrerPolicy="no-referrer"
              />
              <div className="p-2 text-xs truncate">{file}</div>
            </div>
          ))}
        </div>
      )}

      {/* DELETE BUTTON */}
      {files.length > 0 && (
        <button
          onClick={() => setShowDeleteConfirm(true)}
          disabled={deleting || exceedsDeleteLimit}
          className="w-full bg-red-600 text-white py-3 rounded font-semibold disabled:opacity-50"
        >
          {deleting
            ? "Menghapus foto..."
            : exceedsDeleteLimit
              ? `Tidak dapat dihapus (maksimal ${CLEANUP_DELETE_LIMIT})`
              : "Hapus Semua Foto"}
        </button>
      )}

      <ConfirmModal
        open={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={deleteOrphans}
        title="Hapus semua foto?"
        message="Semua foto transaksi yang tidak digunakan akan dihapus dan tidak dapat dikembalikan."
        confirmLabel="Ya, Hapus Semua"
        busy={deleting}
      />

      {successMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-success-title"
            className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl"
          >
            <h2
              id="delete-success-title"
              className="text-lg font-semibold text-gray-900"
            >
              Foto berhasil dihapus
            </h2>
            <p className="mt-2 text-sm text-gray-600">{successMessage}</p>
            <button
              type="button"
              onClick={() => setSuccessMessage("")}
              className="mt-5 w-full rounded bg-[#0067b8] px-4 py-2 font-semibold text-white hover:bg-[#005a9e]"
            >
              Tutup
            </button>
          </div>
        </div>
      )}
    </MobileLayout>
  );
}
