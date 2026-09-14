import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { payrollApi, getApiError } from "../../../api/payrollApi";
import PayrollShell from "../components/PayrollShell";
import { ConfirmDialog, ErrorBanner, Field, inputClass, LoadingState, Modal, primaryButton, secondaryButton, StatusPill } from "../components/PayrollUI";
import { buildSlipValidationUrl, formatCurrency, formatDate, formatDayCount, statusLabels } from "../payrollUtils";

const getDeductionRows = (slip) => {
  const breakdown = slip?.deduction_breakdown || {};
  const rows = [];
  if (Number(breakdown.cash_advance)) rows.push({ label: "Potongan kasbon", amount: breakdown.cash_advance });
  if (Number(breakdown.employee_loan)) rows.push({ label: "Cicilan utang karyawan", amount: breakdown.employee_loan });
  if (Number(breakdown.other)) rows.push({ label: "Potongan lainnya", amount: breakdown.other });
  if (!rows.length && Number(slip?.deductions_total)) rows.push({ label: "Potongan lainnya", amount: slip.deductions_total });
  return rows;
};

const transactionTitle = (item) => item.transaction_type === "repayment"
  ? (item.receivable_type === "cash_advance" ? "Potongan kasbon" : "Cicilan utang")
  : (item.receivable_type === "cash_advance" ? "Pencairan kasbon" : "Pencairan utang");

const getAdditionRows = (slip) => {
  if (!Number(slip?.additions_total)) return [];
  const details = (slip.addition_details || []).filter((item) => Number(item.amount));
  return details.length ? details : [{ category: "Tambahan", amount: slip.additions_total }];
};

export default function PayrollSlipDetail() {
  const { id } = useParams(); const navigate = useNavigate();
  const [slip, setSlip] = useState(null); const [error, setError] = useState(""); const [loading, setLoading] = useState(true);
  const [actionModal, setActionModal] = useState(null);
  const [noteModal, setNoteModal] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const [saving, setSaving] = useState(false);
  const loadData = useCallback(async () => { setLoading(true); try { const res = await payrollApi.slips.get(id); setSlip(res.data); } catch (err) { setError(getApiError(err, "Slip tidak ditemukan.")); } finally { setLoading(false); } }, [id]);
  useEffect(() => { loadData(); }, [loadData]);
  const verificationUrl = buildSlipValidationUrl(slip);
  const publish = async () => { setSaving(true); try { await payrollApi.slips.publish(id); setConfirmation(null); await loadData(); } catch (err) { setError(getApiError(err)); } finally { setSaving(false); } };

  const executeAction = async (event) => {
    event.preventDefault(); setSaving(true); setError("");
    try {
      if (actionModal.type === "cancel") {
        await payrollApi.slips.cancel(id, actionModal.reason);
        setActionModal(null); await loadData();
      } else if (actionModal.type === "revise") {
        const response = await payrollApi.slips.revise(id, actionModal.reason);
        setActionModal(null); navigate(`/payroll/slips/${response.data.data.id}`);
      }
    } catch (err) { setError(getApiError(err, "Tindakan slip gagal.")); }
    finally { setSaving(false); }
  };

  const markPaid = async () => {
    setSaving(true);
    try { await payrollApi.slips.markPaid(id); setConfirmation(null); await loadData(); }
    catch (err) { setError(getApiError(err, "Gagal menandai pembayaran.")); }
    finally { setSaving(false); }
  };

  const recalculate = async () => {
    setSaving(true);
    try { await payrollApi.slips.recalculate(id); setConfirmation(null); await loadData(); }
    catch (err) { setError(getApiError(err, "Gagal menghitung ulang slip.")); }
    finally { setSaving(false); }
  };

  const saveNote = async (event) => {
    event.preventDefault(); setSaving(true); setError("");
    try { await payrollApi.slips.setNote(id, noteModal); setNoteModal(null); await loadData(); }
    catch (err) { setError(getApiError(err, "Gagal menyimpan catatan slip.")); }
    finally { setSaving(false); }
  };

  return <PayrollShell title="Detail Slip" actions={<><button onClick={() => navigate("/payroll/slips")} className={secondaryButton}>← Kembali</button>{slip?.available_actions?.includes("update_note") && <button onClick={() => setNoteModal(slip.note || "")} className={secondaryButton}>Catatan</button>}{slip?.available_actions?.includes("recalculate") && <button onClick={() => setConfirmation("recalculate")} className={secondaryButton}>Hitung ulang</button>}{slip?.available_actions?.includes("publish") && <button onClick={() => setConfirmation("publish")} className={primaryButton}>Terbitkan</button>}{slip?.available_actions?.includes("mark_paid") && <button onClick={() => setConfirmation("paid")} className="bg-green-700 hover:bg-green-800 text-white px-4 py-2.5 text-sm font-semibold">Tandai dibayar</button>}{slip?.available_actions?.includes("revise") && <button onClick={() => setActionModal({ type: "revise", reason: "" })} className={secondaryButton}>Buat revisi</button>}{slip?.available_actions?.includes("cancel") && <button onClick={() => setActionModal({ type: "cancel", reason: "" })} className="bg-white border border-red-300 text-red-700 px-4 py-2.5 text-sm font-semibold">Batalkan</button>}<button onClick={() => navigate(`/payroll/slips/${id}/print`)} className={secondaryButton}>Pratinjau cetak</button></>}>
    <ErrorBanner message={error} onRetry={loadData} />{loading ? <LoadingState /> : slip && <div className="bg-white border border-gray-300 max-w-3xl mx-auto print:border-0 print:max-w-none payroll-print"><header className="p-6 border-b-2 border-gray-800 flex justify-between gap-5"><div><p className="text-xs font-bold tracking-[0.2em] text-[#0067b8]">FINANCE SYSTEM</p><h1 className="text-2xl font-bold text-gray-900 mt-1">SLIP UPAH {slip.slip_type === "monthly" ? "BULANAN" : "MINGGUAN"}</h1><p className="text-xs text-gray-500 mt-1">No. Ref: {slip.document_reference}</p></div><div className="text-right"><StatusPill status={slip.status} /><p className="text-xs text-gray-500 mt-2">Terbit: {formatDate(slip.issued_at)}</p></div></header>
      {slip.pending_revision && <section className="m-6 mb-0 border border-blue-300 bg-blue-50 p-4 flex flex-wrap items-center justify-between gap-3"><div><p className="font-bold text-sm text-blue-900">Perubahan tersimpan pada draft revisi</p><p className="text-xs text-blue-700 mt-1">Potongan atau koreksi terbaru tidak mengubah slip terbit ini. Buka {slip.pending_revision.document_reference} untuk melihat hasilnya.</p></div><button onClick={() => navigate(`/payroll/slips/${slip.pending_revision.id}`)} className={primaryButton}>Buka draft revisi</button></section>}
      <section className="p-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-4 border-b"><div><p className="text-xs text-gray-500">Karyawan</p><p className="font-bold text-lg">{slip.employee_name}</p><p className="text-sm text-gray-600">ID {slip.employee_code} · NIK {slip.employee_nik || "-"}</p>{slip.revision_of_reference && <p className="text-xs text-blue-700 mt-2">Revisi dari {slip.revision_of_reference}: {slip.revision_reason}</p>}{slip.replaced_by_reference && <p className="text-xs text-amber-700 mt-2">Diganti oleh {slip.replaced_by_reference}</p>}{slip.cancellation_reason && <p className="text-xs text-red-700 mt-2">Dibatalkan: {slip.cancellation_reason}</p>}</div><div className="sm:text-right lg:text-left"><p className="text-xs text-gray-500">Periode</p><p className="font-semibold">{formatDate(slip.period_start)} – {formatDate(slip.period_end)}</p><p className="text-sm text-gray-600">{formatDayCount(slip.wage_days)} hari upah · {formatDayCount(slip.transport_days)} hari transport</p></div><div className="sm:col-span-2 lg:col-span-1 lg:text-right"><p className="text-xs text-gray-500">Tarif harian</p><p className="text-sm text-gray-700">Upah <strong className="text-gray-900">{formatCurrency(slip.daily_wage)}</strong></p><p className="text-sm text-gray-700">Transport <strong className="text-gray-900">{formatCurrency(slip.daily_transport)}</strong></p></div></section>
      <section className="p-6"><h2 className="font-bold text-sm uppercase text-gray-700 mb-3">Rincian penerimaan</h2><div className="border border-gray-200 divide-y text-sm"><Row label="Upah" detail={`${formatDayCount(slip.wage_days)} hari × ${formatCurrency(slip.daily_wage)}`} value={slip.base_wage} /><Row label="Transport" detail={`${formatDayCount(slip.transport_days)} hari × ${formatCurrency(slip.daily_transport)}`} value={slip.transport_total} />{getAdditionRows(slip).map((item) => <Row key={item.category} label={item.category} value={item.amount} />)}<Row label="Total upah" value={slip.total_before_adjustments} strong />{getDeductionRows(slip).map((item) => <Row key={item.label} label={item.label} value={item.amount} negative />)}<Row label="Sisa upah" value={slip.net_pay} total /></div></section>
      {slip.attendance_details?.length > 0 && <section className="px-6 pb-6"><h2 className="font-bold text-sm uppercase text-gray-700 mb-3">Kehadiran</h2><div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{slip.attendance_details.map((item) => <div key={item.date} className="border p-2 text-xs"><p className="font-semibold">{formatDate(item.date, { year: undefined })}</p><p className="text-gray-600">{statusLabels[item.status] || item.status}</p><p className="text-gray-400">Upah {formatDayCount(item.wage_fraction)} · Tr {formatDayCount(item.transport_fraction)}</p></div>)}</div></section>}
      {(slip.adjustments?.length > 0 || slip.receivable_details?.length > 0) && <section className="px-6 pb-6 grid sm:grid-cols-2 gap-5">{slip.adjustments?.length > 0 && <DetailList title="Tambahan & potongan lainnya" items={slip.adjustments.map((item) => ({ key: item.id, title: item.category, subtitle: `${formatDate(item.adjustment_date)} · ${item.description || "-"}`, amount: item.adjustment_type === "deduction" ? -Number(item.amount) : item.amount }))} />}{["cash_advance", "employee_loan"].map((receivableType) => { const transactions = slip.receivable_details?.filter((item) => item.receivable_type === receivableType) || []; return transactions.length > 0 && <DetailList key={receivableType} title={receivableType === "cash_advance" ? "Transaksi kasbon" : "Cicilan utang karyawan"} items={transactions.map((item, index) => ({ key: `${item.receivable_id}-${index}`, title: transactionTitle(item), subtitle: `${item.reference_number} · ${formatDate(item.transaction_date)}${item.note ? ` · ${item.note}` : ""}`, amount: item.transaction_type === "repayment" ? -Number(item.amount) : item.amount }))} />; })}</section>}
      {slip.outstanding_receivables?.length > 0 && <section className="px-6 pb-6"><h2 className="font-bold text-sm uppercase text-amber-800 mb-3">Sisa kasbon dan utang berjalan</h2><div className="grid sm:grid-cols-2 gap-3">{slip.outstanding_receivables.map((item) => <div key={item.id} className="border border-amber-200 bg-amber-50 p-3 flex justify-between gap-3"><div><p className="text-xs font-bold text-amber-900">{item.receivable_type === "cash_advance" ? "Sisa kasbon" : "Sisa utang karyawan"}</p><p className="text-xs text-gray-600">{item.reference_number}</p>{item.description && <p className="text-xs text-gray-500 mt-1">{item.description}</p>}</div><p className="font-bold text-red-700">{formatCurrency(item.remaining_balance)}</p></div>)}</div></section>}
      {slip.note && <section className="mx-6 mb-6 border border-amber-200 bg-amber-50 p-4"><h2 className="font-bold text-xs uppercase text-amber-800">Catatan slip</h2><p className="text-sm text-gray-700 whitespace-pre-wrap mt-1">{slip.note}</p></section>}
      <footer className="p-6 border-t flex justify-between items-end gap-5"><div className="text-xs text-gray-500 max-w-sm"><p className="font-semibold text-gray-700">Verifikasi dokumen</p><p className="break-all mt-1">{verificationUrl}</p><p className="mt-2">Dokumen dianggap sah jika QR menampilkan status valid.</p></div><div className="bg-white p-2 border"><QRCodeSVG value={verificationUrl || "-"} size={64} /></div></footer>
    </div>}
    {actionModal && <Modal title={actionModal.type === "revise" ? "Buat revisi slip" : "Batalkan slip"} onClose={() => setActionModal(null)}><form onSubmit={executeAction} className="space-y-4"><div className={`border p-3 text-sm ${actionModal.type === "revise" ? "bg-blue-50 border-blue-200 text-blue-800" : "bg-red-50 border-red-200 text-red-800"}`}>{actionModal.type === "revise" ? "Sistem akan membuat dokumen draft baru dengan nomor revisi. Dokumen lama baru berstatus diganti setelah revisi diterbitkan." : "Slip tidak dihapus. Status QR akan menjadi tidak valid dan alasan pembatalan tersimpan dalam audit."}</div><Field label={actionModal.type === "revise" ? "Alasan revisi" : "Alasan pembatalan"} required><textarea autoFocus required rows="4" className={inputClass} value={actionModal.reason} onChange={(event) => setActionModal((prev) => ({ ...prev, reason: event.target.value }))} /></Field><div className="flex justify-end gap-2"><button type="button" className={secondaryButton} onClick={() => setActionModal(null)}>Kembali</button><button disabled={saving} className={actionModal.type === "cancel" ? "bg-red-700 text-white px-4 py-2.5 text-sm font-semibold" : primaryButton}>{saving ? "Memproses..." : actionModal.type === "revise" ? "Buat draft revisi" : "Batalkan slip"}</button></div></form></Modal>}
    {noteModal !== null && <Modal title="Catatan slip" onClose={() => setNoteModal(null)}><form onSubmit={saveNote} className="space-y-4"><Field label="Keterangan tambahan"><textarea autoFocus rows="5" className={inputClass} placeholder="Contoh: Pembayaran dititipkan kepada bagian administrasi." value={noteModal} onChange={(event) => setNoteModal(event.target.value)} /></Field><p className="text-xs text-gray-500">Catatan akan tampil pada slip dan hasil cetak. Kosongkan untuk menghapus catatan.</p><div className="flex justify-end gap-2"><button type="button" className={secondaryButton} onClick={() => setNoteModal(null)}>Batal</button><button disabled={saving} className={primaryButton}>{saving ? "Menyimpan..." : "Simpan catatan"}</button></div></form></Modal>}
    {confirmation === "recalculate" && <ConfirmDialog title="Hitung ulang slip" message="Hitung ulang slip menggunakan data absensi, tarif, tambahan, kasbon, dan utang terbaru? Nilai draft saat ini akan diperbarui." confirmLabel="Hitung ulang" busy={saving} onClose={() => setConfirmation(null)} onConfirm={recalculate} />}
    {confirmation === "publish" && <ConfirmDialog title="Terbitkan slip" message={`Terbitkan ${slip.document_reference}? Setelah diterbitkan, perubahan berikutnya harus melalui revisi.`} confirmLabel="Terbitkan slip" busy={saving} onClose={() => setConfirmation(null)} onConfirm={publish} />}
    {confirmation === "paid" && <ConfirmDialog title="Tandai sudah dibayar" message={`Konfirmasi bahwa ${slip.document_reference} sudah dibayarkan kepada ${slip.employee_name}.`} confirmLabel="Tandai dibayar" busy={saving} onClose={() => setConfirmation(null)} onConfirm={markPaid} />}
  </PayrollShell>;
}

function Row({ label, detail, value, strong, negative, total }) { return <div className={`flex justify-between items-center gap-4 px-4 ${strong ? "bg-[#0f3154] py-3.5 text-base text-white" : total ? "bg-gray-50 py-3.5 text-base text-gray-600" : "py-3"}`}><span className={strong || total ? "font-bold" : "text-gray-600"}>{label}{detail && <small className={`mt-0.5 block text-xs font-normal ${strong ? "text-blue-100" : "text-gray-500"}`}>{detail}</small>}</span><span className={`shrink-0 font-bold ${negative && !total ? "text-red-700" : ""}`}>{negative && Number(value) > 0 ? "− " : ""}{formatCurrency(value)}</span></div>; }
function DetailList({ title, items }) { return <div><h2 className="font-bold text-sm uppercase text-gray-700 mb-2">{title}</h2><div className="border divide-y">{items.map((item) => <div key={item.key} className="p-3 flex justify-between gap-3 text-xs"><div><p className="font-semibold">{item.title}</p><p className="text-gray-500">{item.subtitle}</p></div><p className={`font-bold ${Number(item.amount) < 0 ? "text-red-700" : "text-green-700"}`}>{formatCurrency(Math.abs(Number(item.amount)))}</p></div>)}</div></div>; }
