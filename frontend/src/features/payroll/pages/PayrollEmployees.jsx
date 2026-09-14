import { useCallback, useEffect, useState } from "react";
import { payrollApi, getApiError, listResults, paginationInfo } from "../../../api/payrollApi";
import PayrollShell from "../components/PayrollShell";
import { ConfirmDialog, EmptyState, ErrorBanner, Field, inputClass, LoadingState, Modal, Pagination, primaryButton, secondaryButton, StatusPill, SuccessBanner } from "../components/PayrollUI";
import { formatCurrency, formatDate, todayLocal } from "../payrollUtils";

const emptyEmployee = { employee_code: "", name: "", nik: "", birth_place: "", birth_date: "", address: "", employment_status: "active", joined_at: "", left_at: "" };
const emptyRate = { daily_wage: "", daily_transport: "7000", effective_from: todayLocal(), effective_until: "" };

export default function PayrollEmployees() {
  const [employees, setEmployees] = useState([]);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState(""); const [status, setStatus] = useState(""); const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(25); const [pagination, setPagination] = useState({ count: 0, page: 1, pageSize: 25 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [employeeModal, setEmployeeModal] = useState(null);
  const [rateModal, setRateModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirmEmployee, setConfirmEmployee] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const filters = { search: query || undefined, status: status || undefined };
      const employeeRes = pageSize === "all" ? await payrollApi.employees.all(filters) : await payrollApi.employees.list({ ...filters, page, page_size: pageSize });
      setEmployees(listResults(employeeRes.data)); setPagination(paginationInfo(employeeRes.data, pageSize === "all" ? 1 : page, pageSize));
    } catch (err) { setError(getApiError(err, "Gagal memuat data karyawan.")); }
    finally { setLoading(false); }
  }, [page, pageSize, query, status]);
  useEffect(() => { loadData(); }, [loadData]);

  const saveEmployee = async (event) => {
    event.preventDefault(); setSaving(true); setError("");
    const payload = Object.fromEntries(Object.entries(employeeModal.form).map(([key, value]) => [key, value === "" && ["birth_date", "joined_at", "left_at"].includes(key) ? null : value]));
    try {
      if (employeeModal.id) await payrollApi.employees.update(employeeModal.id, payload);
      else await payrollApi.employees.create(payload);
      setSuccess(employeeModal.id ? "Data karyawan diperbarui." : "Karyawan berhasil ditambahkan.");
      setEmployeeModal(null); await loadData();
    } catch (err) { setError(getApiError(err, "Gagal menyimpan karyawan.")); }
    finally { setSaving(false); }
  };

  const saveRate = async (event) => {
    event.preventDefault(); setSaving(true); setError("");
    try {
      await payrollApi.payRates.create({ ...rateModal.form, employee: rateModal.employee.id, effective_until: rateModal.form.effective_until || null });
      setSuccess(`Tarif ${rateModal.employee.name} berhasil ditambahkan.`); setRateModal(null); await loadData();
    } catch (err) { setError(getApiError(err, "Gagal menyimpan tarif.")); }
    finally { setSaving(false); }
  };

  const removeEmployee = async (employee) => {
    setSaving(true);
    try { await payrollApi.employees.remove(employee.id); setSuccess("Karyawan dihapus."); setConfirmEmployee(null); await loadData(); }
    catch (err) { setError(getApiError(err, "Karyawan yang sudah memiliki slip tidak dapat dihapus.")); }
    finally { setSaving(false); }
  };

  return (
    <PayrollShell title="Karyawan Payroll" actions={<button onClick={() => setEmployeeModal({ form: { ...emptyEmployee } })} className={primaryButton}>+ Tambah karyawan</button>}>
      <ErrorBanner message={error} onRetry={loadData} /><SuccessBanner message={success} onClose={() => setSuccess("")} />
      <form onSubmit={(event) => { event.preventDefault(); setPage(1); setQuery(search.trim()); }} className="mb-4 bg-white border border-gray-200 p-3 grid sm:grid-cols-[1fr_180px_auto] gap-3"><input className={inputClass} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nama, kode, atau NIK lengkap..." /><select className={inputClass} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">Semua status</option><option value="active">Aktif</option><option value="inactive">Tidak aktif</option><option value="resigned">Keluar</option></select><button className={primaryButton}>Cari</button></form>
      {loading ? <LoadingState /> : employees.length === 0 ? <EmptyState title="Karyawan tidak ditemukan" description="Tambahkan karyawan untuk memulai payroll." /> : (<>
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          {employees.map((employee) => {
            const rate = employee.current_pay_rate;
            return (
              <article key={employee.id} className="bg-white border border-gray-200 p-4">
                <div className="flex justify-between gap-3"><div className="min-w-0"><p className="text-xs text-gray-500">ID {employee.employee_code}</p><h3 className="font-semibold text-gray-900 truncate">{employee.name}</h3></div><StatusPill status={employee.employment_status} /></div>
                <dl className="mt-4 space-y-2 text-sm"><div className="flex justify-between gap-2"><dt className="text-gray-500">NIK</dt><dd className="font-medium truncate">{employee.nik || "-"}</dd></div><div className="flex justify-between gap-2"><dt className="text-gray-500">Mulai kerja</dt><dd>{formatDate(employee.joined_at)}</dd></div><div className="border-t pt-2 flex justify-between gap-2"><dt className="text-gray-500">Upah aktif</dt><dd className="font-bold text-[#0067b8]">{rate ? formatCurrency(rate.daily_wage) : "Belum ada"}</dd></div>{rate && <div className="flex justify-between"><dt className="text-gray-500">Transport</dt><dd>{formatCurrency(rate.daily_transport)}</dd></div>}</dl>
                <div className="mt-4 pt-3 border-t flex flex-wrap gap-3 text-xs font-semibold"><button onClick={() => setEmployeeModal({ id: employee.id, form: { ...emptyEmployee, ...employee } })} className="text-[#0067b8]">Edit</button><button onClick={() => setRateModal({ employee, form: { ...emptyRate } })} className="text-purple-700">Tarif baru</button><button onClick={() => setConfirmEmployee(employee)} className="text-red-600 ml-auto">Hapus</button></div>
              </article>
            );
          })}
        </div><Pagination {...pagination} onPageChange={setPage} onPageSizeChange={(value) => { setPageSize(value); setPage(1); }} /></>)}

      {employeeModal && <Modal title={employeeModal.id ? "Edit karyawan" : "Tambah karyawan"} onClose={() => setEmployeeModal(null)}><form onSubmit={saveEmployee} className="grid sm:grid-cols-2 gap-4">
        {[['employee_code','Kode karyawan','text',true],['name','Nama lengkap','text',true],['nik','NIK','text'],['birth_place','Tempat lahir','text'],['birth_date','Tanggal lahir','date'],['joined_at','Tanggal masuk','date'],['left_at','Tanggal keluar','date']].map(([name,label,type,required]) => <Field key={name} label={label} required={required}><input type={type} required={required} maxLength={name === 'nik' ? 32 : undefined} className={inputClass} value={employeeModal.form[name] || ""} onChange={(e) => setEmployeeModal((prev) => ({ ...prev, form: { ...prev.form, [name]: e.target.value } }))} /></Field>)}
        <Field label="Status"><select className={inputClass} value={employeeModal.form.employment_status} onChange={(e) => setEmployeeModal((prev) => ({ ...prev, form: { ...prev.form, employment_status: e.target.value } }))}><option value="active">Aktif</option><option value="inactive">Tidak aktif</option><option value="resigned">Keluar</option></select></Field>
        <div className="sm:col-span-2"><Field label="Alamat"><textarea rows="3" className={inputClass} value={employeeModal.form.address || ""} onChange={(e) => setEmployeeModal((prev) => ({ ...prev, form: { ...prev.form, address: e.target.value } }))} /></Field></div>
        <div className="sm:col-span-2 flex justify-end gap-2 pt-2"><button type="button" onClick={() => setEmployeeModal(null)} className={secondaryButton}>Batal</button><button disabled={saving} className={primaryButton}>{saving ? "Menyimpan..." : "Simpan"}</button></div>
      </form></Modal>}

      {rateModal && <Modal title={`Tarif baru · ${rateModal.employee.name}`} onClose={() => setRateModal(null)}><form onSubmit={saveRate} className="space-y-4">
        <Field label="Upah harian" required><input type="number" min="1" required className={inputClass} value={rateModal.form.daily_wage} onChange={(e) => setRateModal((prev) => ({ ...prev, form: { ...prev.form, daily_wage: e.target.value } }))} /></Field>
        <Field label="Transport harian" required><input type="number" min="0" required className={inputClass} value={rateModal.form.daily_transport} onChange={(e) => setRateModal((prev) => ({ ...prev, form: { ...prev.form, daily_transport: e.target.value } }))} /></Field>
        <div className="grid grid-cols-2 gap-3"><Field label="Berlaku mulai" required><input type="date" required className={inputClass} value={rateModal.form.effective_from} onChange={(e) => setRateModal((prev) => ({ ...prev, form: { ...prev.form, effective_from: e.target.value } }))} /></Field><Field label="Sampai"><input type="date" className={inputClass} value={rateModal.form.effective_until} onChange={(e) => setRateModal((prev) => ({ ...prev, form: { ...prev.form, effective_until: e.target.value } }))} /></Field></div>
        <div className="flex justify-end gap-2"><button type="button" onClick={() => setRateModal(null)} className={secondaryButton}>Batal</button><button disabled={saving} className={primaryButton}>Simpan tarif</button></div>
      </form></Modal>}
      {confirmEmployee && <ConfirmDialog title="Hapus karyawan" message={`Hapus ${confirmEmployee.name}? Karyawan yang sudah mempunyai slip tidak dapat dihapus.`} confirmLabel="Hapus karyawan" danger busy={saving} onClose={() => setConfirmEmployee(null)} onConfirm={() => removeEmployee(confirmEmployee)} />}
    </PayrollShell>
  );
}
