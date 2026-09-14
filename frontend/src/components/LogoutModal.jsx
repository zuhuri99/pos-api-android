export default function LogoutModal({ open, onClose, onConfirm }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative z-10 w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl">
        <h2 className="text-lg font-semibold text-slate-800">
          Konfirmasi Logout
        </h2>

        <p className="mt-2 text-sm text-slate-600">
          Akun ini akan dihapus dari aplikasi. Akun tersimpan lainnya tetap dapat digunakan.
        </p>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100"
          >
            Batal
          </button>

          <button
            onClick={onConfirm}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
          >
            Keluar dari akun
          </button>
        </div>
      </div>
    </div>
  );
}
