export default function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title = "Hapus Expense?",
  message = "Data yang dihapus tidak dapat dikembalikan.",
  warning = "",
  confirmLabel = "Hapus",
  confirmClassName = "bg-red-600 text-white",
  busy = false,
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-5 w-full max-w-sm">
        <h2 className="text-lg font-semibold mb-3">
          {title}
        </h2>

        <p className="text-sm text-gray-600 mb-4">
          {message}
        </p>

        {warning && (
          <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-center text-sm font-black text-red-700">
            {warning}
          </p>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={busy}
            className="flex-1 border rounded py-2"
          >
            Batal
          </button>

          <button
            onClick={onConfirm}
            disabled={busy}
            className={`flex-1 rounded py-2 disabled:opacity-50 ${confirmClassName}`}
          >
            {busy ? "Memproses..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
