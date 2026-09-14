import { useState } from "react";

export default function TransactionMarkDialog({ sale, busy = false, error = "", onClose, onConfirm }) {
  const [markType, setMarkType] = useState("wrong");
  const [reason, setReason] = useState("");
  const [validation, setValidation] = useState("");

  const submit = (event) => {
    event.preventDefault();
    const cleanReason = reason.trim();
    if (markType === "other" && cleanReason.length < 3) {
      setValidation("Alasan lainnya wajib ditulis minimal 3 karakter.");
      return;
    }
    setValidation("");
    onConfirm({ markType, reason: markType === "wrong" ? "Transaksi salah" : cleanReason });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
      <form onSubmit={submit} className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl">
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-600">{sale.invoice_no}</p>
        <h2 className="mt-1 text-xl font-black text-slate-900">Tandai sebagai?</h2>
        <div className="mt-4 grid gap-2">
          <label className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-3 ${markType === "wrong" ? "border-red-300 bg-red-50 text-red-800" : "border-slate-200 text-slate-700"}`}>
            <input type="radio" name="mark-type" value="wrong" checked={markType === "wrong"} onChange={() => { setMarkType("wrong"); setValidation(""); }} />
            <span className="text-sm font-extrabold">Transaksi salah</span>
          </label>
          <label className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-3 ${markType === "other" ? "border-amber-300 bg-amber-50 text-amber-900" : "border-slate-200 text-slate-700"}`}>
            <input type="radio" name="mark-type" value="other" checked={markType === "other"} onChange={() => setMarkType("other")} />
            <span className="text-sm font-extrabold">Lainnya</span>
          </label>
        </div>
        {markType === "other" && (
          <label className="mt-3 block text-xs font-extrabold uppercase tracking-wide text-slate-600">
            Alasan lainnya
            <textarea autoFocus rows="3" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Wajib tulis alasan…" className="mt-1 w-full resize-none rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold normal-case tracking-normal outline-none focus:border-amber-500" />
          </label>
        )}
        {(validation || error) && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{validation || error}</p>}
        <p className="mt-3 text-xs text-slate-500">Penandaan tidak menghapus transaksi dan tidak mengubah stok.</p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button type="button" disabled={busy} onClick={onClose} className="rounded-xl border border-slate-300 py-2.5 text-sm font-bold text-slate-700 disabled:opacity-50">Batal</button>
          <button type="submit" disabled={busy} className="rounded-xl bg-amber-500 py-2.5 text-sm font-extrabold text-slate-950 disabled:opacity-50">{busy ? "Menandai…" : "Tandai"}</button>
        </div>
      </form>
    </div>
  );
}
