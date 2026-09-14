import { useState } from "react";

export default function TransactionDeleteDialog({
  sale,
  requiresPin,
  busy = false,
  error = "",
  onClose,
  onConfirm,
}) {
  const [reason, setReason] = useState("Transaksi salah");
  const [pin, setPin] = useState("");
  const [validation, setValidation] = useState("");

  const submit = (event) => {
    event.preventDefault();
    const cleanReason = reason.trim();
    if (cleanReason.length < 3) {
      setValidation("Alasan penghapusan minimal 3 karakter.");
      return;
    }
    if (requiresPin && pin.length < 4) {
      setValidation("Masukkan PIN otorisasi penghapusan.");
      return;
    }
    setValidation("");
    onConfirm({ reason: cleanReason, pin: requiresPin ? pin : undefined });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
      <form onSubmit={submit} className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl">
        <h2 className="text-lg font-black text-slate-900">Hapus transaksi?</h2>
        <p className="mt-1 text-sm text-slate-500">
          {sale.invoice_no || "Transaksi ini"} akan dihapus dan stok dikembalikan.
        </p>
        <label className="mt-4 block text-xs font-extrabold uppercase tracking-wide text-slate-600">
          Alasan
          <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows="2" className="mt-1 w-full resize-none rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold normal-case tracking-normal outline-none focus:border-blue-500" />
        </label>
        {requiresPin && (
          <label className="mt-3 block text-xs font-extrabold uppercase tracking-wide text-slate-600">
            PIN otorisasi
            <input type="password" inputMode="numeric" autoComplete="off" value={pin} onChange={(event) => setPin(event.target.value)} autoFocus className="mt-1 h-11 w-full rounded-xl border border-slate-300 px-3 text-center text-lg font-black tracking-[0.35em] outline-none focus:border-blue-500" />
          </label>
        )}
        {(validation || error) && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{validation || error}</p>}
        {requiresPin && <p className="mt-3 text-xs text-amber-700">Penghapusan oleh akun kasir memerlukan koneksi internet untuk memverifikasi PIN.</p>}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button type="button" onClick={onClose} disabled={busy} className="rounded-xl border border-slate-300 py-2.5 text-sm font-bold text-slate-700 disabled:opacity-50">Batal</button>
          <button type="submit" disabled={busy} className="rounded-xl bg-red-600 py-2.5 text-sm font-extrabold text-white disabled:opacity-50">{busy ? "Menghapus…" : "Hapus"}</button>
        </div>
      </form>
    </div>
  );
}
