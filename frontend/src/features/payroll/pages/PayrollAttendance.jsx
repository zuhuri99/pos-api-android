import { useCallback, useEffect, useMemo, useState } from "react";
import { payrollApi, getApiError, listResults, paginationInfo } from "../../../api/payrollApi";
import PayrollShell from "../components/PayrollShell";
import { ConfirmDialog, EmptyState, ErrorBanner, Field, inputClass, LoadingState, Modal, Pagination, primaryButton, secondaryButton, StatusPill, SuccessBanner } from "../components/PayrollUI";
import { formatDate, statusLabels, todayLocal } from "../payrollUtils";

const attendanceOptions = ["present", "half_day", "sick", "permission", "absent", "holiday", "leave"];

const addDays = (value, days) => {
  const result = new Date(`${value}T00:00:00`);
  result.setDate(result.getDate() + days);
  return new Date(result.getTime() - result.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

const datesInRange = (start, end) => {
  if (!start || !end || end < start) return [];
  const dates = []; let current = start;
  while (current <= end && dates.length < 31) { dates.push(current); current = addDays(current, 1); }
  return dates;
};

export default function PayrollAttendance() {
  const [employees, setEmployees] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [items, setItems] = useState([]);
  const [filterEmployee, setFilterEmployee] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [filterYear, setFilterYear] = useState(""); const [filterMonth, setFilterMonth] = useState(""); const [filterStatus, setFilterStatus] = useState("");
  const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(25); const [pagination, setPagination] = useState({ count: 0, page: 1, pageSize: 25 });
  const [modal, setModal] = useState(null);
  const [bulkModal, setBulkModal] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const filters = { employee: filterEmployee || undefined, date: filterDate || undefined, year: filterYear || undefined, month: filterMonth || undefined, status: filterStatus || undefined };
      const attendanceRes = pageSize === "all" ? await payrollApi.attendance.all(filters) : await payrollApi.attendance.list({ ...filters, page, page_size: pageSize });
      setItems(listResults(attendanceRes.data)); setPagination(paginationInfo(attendanceRes.data, pageSize === "all" ? 1 : page, pageSize));
    } catch (err) { setError(getApiError(err, "Gagal memuat absensi.")); }
    finally { setLoading(false); }
  }, [page, pageSize, filterEmployee, filterDate, filterYear, filterMonth, filterStatus]);
  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => {
    Promise.all([payrollApi.employees.all({ status: "active" }), payrollApi.periods.all()])
      .then(([employeeRes, periodRes]) => {
        setEmployees(listResults(employeeRes.data));
        setPeriods(listResults(periodRes.data));
      })
      .catch((err) => setError(getApiError(err, "Gagal memuat pilihan karyawan dan periode.")));
  }, []);

  const employeeMap = useMemo(() => Object.fromEntries(employees.map((item) => [item.id, item])), [employees]);

  const openBulkCreate = () => { const start = filterDate || todayLocal(); setBulkModal({ employee: filterEmployee || employees[0]?.id || "", period_id: "", start_date: start, end_date: addDays(start, 6), status: filterStatus || "holiday", note: "", dates: [] }); };
  const save = async (event) => {
    event.preventDefault(); setSaving(true); setError("");
    try {
      if (modal.id) await payrollApi.attendance.update(modal.id, modal.form);
      else await payrollApi.attendance.create(modal.form);
      setSuccess(modal.id ? "Absensi diperbarui." : "Absensi berhasil dicatat."); setModal(null); await loadData();
    } catch (err) { setError(getApiError(err, "Gagal menyimpan absensi.")); }
    finally { setSaving(false); }
  };
  const remove = async (item) => {
    setSaving(true);
    try { await payrollApi.attendance.remove(item.id); setSuccess("Absensi dihapus."); setConfirmDelete(null); await loadData(); }
    catch (err) { setError(getApiError(err, "Gagal menghapus absensi.")); }
    finally { setSaving(false); }
  };
  const saveBulk = async (event) => {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const response = await payrollApi.attendance.bulkUpsert(bulkModal);
      setSuccess(`${response.data.count} tanggal absensi berhasil disimpan.`);
      setBulkModal(null); setPage(1); await loadData();
    } catch (err) { setError(getApiError(err, "Gagal menyimpan absensi periode.")); }
    finally { setSaving(false); }
  };

  return (
    <PayrollShell title="Absensi Payroll" actions={<button onClick={openBulkCreate} disabled={!employees.length} className={primaryButton}>+ Input beberapa tanggal</button>}>
      <ErrorBanner message={error} onRetry={loadData} /><SuccessBanner message={success} onClose={() => setSuccess("")} />
      <div className="bg-white border border-gray-200 p-3 mb-4 grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <Field label="Karyawan"><select className={inputClass} value={filterEmployee} onChange={(e) => { setFilterEmployee(e.target.value); setPage(1); }}><option value="">Semua karyawan</option>{employees.map((item) => <option key={item.id} value={item.id}>{item.employee_code} · {item.name}</option>)}</select></Field>
        <Field label="Status"><select className={inputClass} value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}><option value="">Semua status</option>{attendanceOptions.map((item) => <option key={item} value={item}>{statusLabels[item]}</option>)}</select></Field>
        <Field label="Tahun"><input type="number" min="2020" max="2100" placeholder="Semua" className={inputClass} value={filterYear} onChange={(e) => { setFilterYear(e.target.value); setPage(1); }} /></Field>
        <Field label="Bulan"><select className={inputClass} value={filterMonth} onChange={(e) => { setFilterMonth(e.target.value); setPage(1); }}><option value="">Semua bulan</option>{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{new Date(2026, index, 1).toLocaleDateString("id-ID", { month: "long" })}</option>)}</select></Field>
        <Field label="Tanggal tepat"><input type="date" className={inputClass} value={filterDate} onChange={(e) => { setFilterDate(e.target.value); setPage(1); }} /></Field>
      </div>
      <div className="mb-4 bg-blue-50 border border-blue-200 px-4 py-3 text-xs text-blue-800"><strong>Catatan:</strong> Anda hanya perlu mencatat absensi yang berbeda dari kondisi normal. Tanpa record absensi, hari selain Jumat dianggap hadir dan Jumat dianggap libur. Jika karyawan bekerja pada Jumat atau libur pada hari lain, masukkan koreksinya secara manual.</div>
      {loading ? <LoadingState /> : items.length === 0 ? <EmptyState title="Belum ada pengecualian absensi" description="Hari normal tidak perlu dicatat satu per satu." /> : (<><div className="bg-white border border-gray-200 divide-y divide-gray-100">
          {items.map((item) => <div key={item.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div className="flex items-center gap-3"><div className="w-12 text-center border-r border-gray-200 pr-3"><p className="font-bold text-lg text-gray-800">{new Date(`${item.date}T00:00:00`).getDate()}</p><p className="text-[10px] text-gray-500 uppercase">{new Date(`${item.date}T00:00:00`).toLocaleDateString("id-ID", { month: "short" })}</p></div><div><p className="font-semibold text-sm text-gray-900">{employeeMap[item.employee]?.name || `Karyawan #${item.employee}`}</p><p className="text-xs text-gray-500">{formatDate(item.date)} · Upah {item.wage_fraction} · Transport {item.transport_fraction}</p>{item.note && <p className="text-xs text-gray-600 mt-1">{item.note}</p>}</div></div><div className="flex items-center gap-3"><StatusPill status={item.status} /><button onClick={() => setModal({ id: item.id, form: { employee: item.employee, date: item.date, status: item.status, note: item.note || "" } })} className="text-xs font-semibold text-[#0067b8]">Edit</button><button onClick={() => setConfirmDelete(item)} className="text-xs font-semibold text-red-600">Hapus</button></div></div>)}
        </div><Pagination {...pagination} onPageChange={setPage} onPageSizeChange={(value) => { setPageSize(value); setPage(1); }} /></>)}
      {bulkModal && <Modal title="Input absensi beberapa tanggal" size="max-w-2xl" onClose={() => setBulkModal(null)}><form onSubmit={saveBulk} className="space-y-4"><Field label="Gunakan periode payroll" hint="Pilih periode yang sudah dibuat atau biarkan manual."><select className={inputClass} value={bulkModal.period_id} onChange={(e) => { const period = periods.find((item) => Number(item.id) === Number(e.target.value)); setBulkModal((prev) => period ? ({ ...prev, period_id: e.target.value, start_date: period.start_date, end_date: period.end_date, dates: [] }) : ({ ...prev, period_id: "", dates: [] })); }}><option value="">Rentang tanggal manual</option>{periods.map((period) => <option key={period.id} value={period.id}>{formatDate(period.start_date)} – {formatDate(period.end_date)} · {statusLabels[period.status] || period.status}</option>)}</select></Field><div className="grid sm:grid-cols-2 gap-3"><Field label="Karyawan" required><select required className={inputClass} value={bulkModal.employee} onChange={(e) => setBulkModal((prev) => ({ ...prev, employee: e.target.value }))}>{employees.map((item) => <option key={item.id} value={item.id}>{item.employee_code} · {item.name}</option>)}</select></Field><Field label="Status untuk tanggal terpilih" required><select className={inputClass} value={bulkModal.status} onChange={(e) => setBulkModal((prev) => ({ ...prev, status: e.target.value }))}>{attendanceOptions.map((item) => <option key={item} value={item}>{statusLabels[item]}</option>)}</select></Field><Field label="Mulai periode" required><input type="date" required className={inputClass} value={bulkModal.start_date} onChange={(e) => setBulkModal((prev) => ({ ...prev, period_id: "", start_date: e.target.value, dates: prev.dates.filter((date) => date >= e.target.value && date <= prev.end_date) }))} /></Field><Field label="Selesai periode" required><input type="date" required min={bulkModal.start_date} max={addDays(bulkModal.start_date, 30)} className={inputClass} value={bulkModal.end_date} onChange={(e) => setBulkModal((prev) => ({ ...prev, period_id: "", end_date: e.target.value, dates: prev.dates.filter((date) => date >= prev.start_date && date <= e.target.value) }))} /></Field></div><div className="border border-gray-200"><div className="px-3 py-2 bg-gray-50 border-b flex justify-between gap-3"><strong className="text-xs text-gray-700">Checklist tanggal yang akan disimpan</strong><button type="button" className="text-xs font-semibold text-[#0067b8]" onClick={() => { const allDates = datesInRange(bulkModal.start_date, bulkModal.end_date); setBulkModal((prev) => ({ ...prev, dates: prev.dates.length === allDates.length ? [] : allDates })); }}>{bulkModal.dates.length === datesInRange(bulkModal.start_date, bulkModal.end_date).length ? "Kosongkan" : "Pilih semua"}</button></div><div className="grid sm:grid-cols-2 max-h-72 overflow-y-auto">{datesInRange(bulkModal.start_date, bulkModal.end_date).map((date) => <label key={date} className="flex items-center gap-3 p-3 border-b border-r hover:bg-blue-50"><input type="checkbox" checked={bulkModal.dates.includes(date)} onChange={() => setBulkModal((prev) => ({ ...prev, dates: prev.dates.includes(date) ? prev.dates.filter((item) => item !== date) : [...prev.dates, date] }))} /><span className="text-sm"><strong>{new Date(`${date}T00:00:00`).toLocaleDateString("id-ID", { weekday: "long" })}</strong><span className="text-gray-500"> · {formatDate(date)}</span></span></label>)}</div></div><Field label="Catatan untuk semua tanggal terpilih"><textarea rows="2" maxLength="255" className={inputClass} value={bulkModal.note} onChange={(e) => setBulkModal((prev) => ({ ...prev, note: e.target.value }))} /></Field><div className="flex items-center justify-between gap-3"><p className="text-xs text-gray-500">{bulkModal.dates.length} tanggal dipilih</p><div className="flex gap-2"><button type="button" className={secondaryButton} onClick={() => setBulkModal(null)}>Batal</button><button disabled={saving || !bulkModal.dates.length} className={primaryButton}>{saving ? "Menyimpan..." : "Simpan tanggal terpilih"}</button></div></div></form></Modal>}
      {modal && <Modal title="Edit absensi" onClose={() => setModal(null)}><form onSubmit={save} className="space-y-4"><Field label="Karyawan" required><select required className={inputClass} value={modal.form.employee} onChange={(e) => setModal((prev) => ({ ...prev, form: { ...prev.form, employee: e.target.value } }))}>{employees.map((item) => <option key={item.id} value={item.id}>{item.employee_code} · {item.name}</option>)}</select></Field><Field label="Tanggal" required><input type="date" required className={inputClass} value={modal.form.date} onChange={(e) => setModal((prev) => ({ ...prev, form: { ...prev.form, date: e.target.value } }))} /></Field><Field label="Status" required><select className={inputClass} value={modal.form.status} onChange={(e) => setModal((prev) => ({ ...prev, form: { ...prev.form, status: e.target.value } }))}>{attendanceOptions.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</select></Field><Field label="Catatan"><textarea rows="3" className={inputClass} value={modal.form.note} onChange={(e) => setModal((prev) => ({ ...prev, form: { ...prev.form, note: e.target.value } }))} /></Field><div className="flex justify-end gap-2"><button type="button" className={secondaryButton} onClick={() => setModal(null)}>Batal</button><button disabled={saving} className={primaryButton}>{saving ? "Menyimpan..." : "Simpan"}</button></div></form></Modal>}
      {confirmDelete && <ConfirmDialog title="Hapus absensi" message={`Hapus absensi ${employeeMap[confirmDelete.employee]?.name || "karyawan"} pada ${formatDate(confirmDelete.date)}?`} confirmLabel="Hapus absensi" danger busy={saving} onClose={() => setConfirmDelete(null)} onConfirm={() => remove(confirmDelete)} />}
    </PayrollShell>
  );
}
