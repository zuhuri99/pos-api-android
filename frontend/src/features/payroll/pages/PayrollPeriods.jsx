import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { payrollApi, getApiError, listResults, paginationInfo } from "../../../api/payrollApi";
import PayrollShell from "../components/PayrollShell";
import { ConfirmDialog, EmptyState, ErrorBanner, Field, inputClass, LoadingState, Modal, Pagination, primaryButton, secondaryButton, StatusPill, SuccessBanner } from "../components/PayrollUI";
import { formatDate, todayLocal } from "../payrollUtils";

const addDays = (value, days) => {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + days);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

const getRecentMonthFilters = () => Array.from({ length: 3 }, (_, index) => {
  const date = new Date();
  date.setDate(1);
  date.setMonth(date.getMonth() - index);
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
});

const getSynchronizationFilters = (year, month) => {
  if (year || month) return [{ year: year || undefined, month: month || undefined }];
  return getRecentMonthFilters();
};

const getPeriodMonthFilters = (period) => {
  const filters = new Map();
  [period.start_date, period.end_date].filter(Boolean).forEach((value) => {
    const [year, month] = String(value).slice(0, 7).split("-").map(Number);
    if (year && month) filters.set(`${year}-${month}`, { year, month });
  });
  return [...filters.values()];
};

const isPeriodInSynchronizationScope = (period, filters) => {
  const [periodMonth] = getPeriodMonthFilters({ start_date: period.start_date });
  if (!periodMonth) return false;
  return filters.some((filter) =>
    (!filter.year || Number(filter.year) === periodMonth.year)
    && (!filter.month || Number(filter.month) === periodMonth.month));
};

const uniqueById = (items) => [...new Map(items.map((item) => [item.id, item])).values()];

const slipTimestamp = (slip) => {
  const value = slip.updated_at || slip.created_at || slip.paid_at || slip.issued_at;
  return value ? new Date(value).getTime() || 0 : 0;
};

const isNewerSlip = (candidate, current) => {
  const timestampDifference = slipTimestamp(candidate) - slipTimestamp(current);
  if (timestampDifference) return timestampDifference > 0;
  return Number(candidate.id) > Number(current.id);
};

const getSlipEmployeeKey = (slip) => {
  const employee = slip.employee;
  if (employee && typeof employee === "object") return employee.id;
  return employee ?? slip.employee_id ?? slip.employee_code ?? slip.id;
};

const getPeriodSlips = (period, slips) => slips.filter((slip) => {
  const relation = slip.payroll_period ?? slip.period;
  const relationId = relation && typeof relation === "object" ? relation.id : relation;
  const explicitPeriodId = slip.payroll_period_id ?? slip.period_id ?? relationId;

  if (explicitPeriodId !== undefined && explicitPeriodId !== null) {
    return Number(explicitPeriodId) === Number(period.id);
  }

  return slip.period_start === period.start_date && slip.period_end === period.end_date;
});

const getCurrentPeriodSlips = (period, slips) => {
  const latestByEmployee = new Map();
  getPeriodSlips(period, slips).forEach((slip) => {
    const employeeKey = getSlipEmployeeKey(slip);
    const current = latestByEmployee.get(employeeKey);
    if (!current || isNewerSlip(slip, current)) latestByEmployee.set(employeeKey, slip);
  });
  return [...latestByEmployee.values()];
};

const getPeriodStatusFromSlips = (currentSlips) => {
  if (!currentSlips.length) return null;
  if (currentSlips.every((slip) => slip.status === "cancelled")) return "cancelled";
  const activeSlips = currentSlips.filter((slip) => slip.status !== "cancelled");
  if (activeSlips.some((slip) => ["draft", "replaced"].includes(slip.status))) return "calculated";
  if (activeSlips.every((slip) => slip.status === "paid")) return "paid";
  if (activeSlips.every((slip) => ["published", "paid"].includes(slip.status))) return "published";
  return null;
};

const getSlipEmployeeId = (slip) => {
  if (slip.employee && typeof slip.employee === "object") return slip.employee.id;
  return slip.employee ?? slip.employee_id;
};

const getPeriodSlipSummary = (currentSlips) => {
  const activeSlips = currentSlips.filter((slip) => !["cancelled", "replaced"].includes(slip.status));
  const slipEmployeeIds = [...new Set(currentSlips
    .map(getSlipEmployeeId)
    .filter((id) => id !== undefined && id !== null))];
  const draftEmployeeIds = [...new Set(currentSlips
    .filter((slip) => slip.status === "draft")
    .map(getSlipEmployeeId)
    .filter((id) => id !== undefined && id !== null))];
  return {
    hasSlips: currentSlips.length > 0,
    activeCount: activeSlips.length,
    draftCount: activeSlips.filter((slip) => slip.status === "draft").length,
    publishedCount: activeSlips.filter((slip) => slip.status === "published").length,
    hasFinalizedSlip: activeSlips.some((slip) => ["published", "paid"].includes(slip.status)),
    slipEmployeeIds,
    draftEmployeeIds,
  };
};

const getEligibleEmployeeIds = (employees, summary) => {
  const slipEmployeeIds = new Set((summary?.slipEmployeeIds || []).map(Number));
  const draftEmployeeIds = new Set((summary?.draftEmployeeIds || []).map(Number));
  return employees
    .filter((employee) => !slipEmployeeIds.has(Number(employee.id)) || draftEmployeeIds.has(Number(employee.id)))
    .map((employee) => employee.id);
};

const getPeriodNotice = (summary) => {
  if (!summary) return "";
  if (!summary.hasSlips) return "Slip belum dihitung.";
  if (summary.draftCount) return `${summary.draftCount} dari ${summary.activeCount} slip belum diterbitkan.`;
  if (summary.publishedCount) return `${summary.publishedCount} dari ${summary.activeCount} slip belum dibayar.`;
  return "";
};

export default function PayrollPeriods() {
  const navigate = useNavigate();
  const [periods, setPeriods] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [modal, setModal] = useState(null);
  const [calculateModal, setCalculateModal] = useState(null);
  const [selectedEmployees, setSelectedEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [year, setYear] = useState(""); const [month, setMonth] = useState(""); const [status, setStatus] = useState("");
  const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(25); const [pagination, setPagination] = useState({ count: 0, page: 1, pageSize: 25 });
  const [confirmPeriod, setConfirmPeriod] = useState(null);
  const [periodSlipSummaries, setPeriodSlipSummaries] = useState(new Map());
  const [checkingPeriodId, setCheckingPeriodId] = useState(null);
  const slipCacheRef = useRef(new Map());
  const employeeCacheRef = useRef(null);

  const loadSlipsForFilters = useCallback(async (filters, refresh = false) => {
    const key = JSON.stringify(filters);
    if (!refresh && slipCacheRef.current.has(key)) return slipCacheRef.current.get(key);
    const response = await payrollApi.slips.all({ slip_type: "weekly", ...filters });
    const items = listResults(response.data);
    slipCacheRef.current.set(key, items);
    return items;
  }, []);

  const loadActiveEmployees = useCallback(async () => {
    if (employeeCacheRef.current) return employeeCacheRef.current;
    const response = await payrollApi.employees.all({ status: "active" });
    const items = listResults(response.data).filter((item) => item.employment_status === "active");
    employeeCacheRef.current = items;
    return items;
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const filters = { year: year || undefined, month: month || undefined, status: status || undefined };
      const periodRequest = pageSize === "all" ? payrollApi.periods.all(filters) : payrollApi.periods.list({ ...filters, page, page_size: pageSize });
      const synchronizationFilters = getSynchronizationFilters(year, month);
      const synchronizationPeriodRequest = status
        ? Promise.all(synchronizationFilters.map((item) => payrollApi.periods.all(item)))
        : Promise.resolve(null);
      let [periodRes, synchronizationPeriodResponses, employeeItems, slipGroups] = await Promise.all([
        periodRequest,
        synchronizationPeriodRequest,
        loadActiveEmployees(),
        Promise.all(synchronizationFilters.map((item) => loadSlipsForFilters(item))),
      ]);
      const periodItemsBeforeSynchronization = listResults(periodRes.data);
      const synchronizationPeriodItems = synchronizationPeriodResponses
        ? uniqueById(synchronizationPeriodResponses.flatMap((response) => listResults(response.data)))
        : periodItemsBeforeSynchronization.filter((period) => isPeriodInSynchronizationScope(period, synchronizationFilters));
      const slipItems = uniqueById(slipGroups.flat());
      const slipSummaries = new Map();
      const synchronizedPeriods = synchronizationPeriodItems.map((period) => {
        const currentSlips = getCurrentPeriodSlips(period, slipItems);
        slipSummaries.set(period.id, getPeriodSlipSummary(currentSlips));
        return { period, synchronizedStatus: getPeriodStatusFromSlips(currentSlips) };
      });
      const updates = synchronizedPeriods
        .filter(({ period, synchronizedStatus }) => synchronizedStatus && synchronizedStatus !== period.status)
        .map(({ period, synchronizedStatus }) => payrollApi.periods.update(period.id, { status: synchronizedStatus }));
      const updateResults = await Promise.allSettled(updates);
      const failedUpdates = updateResults.filter((result) => result.status === "rejected").length;
      const synchronizedStatusById = new Map(synchronizedPeriods.map(({ period, synchronizedStatus }) => [period.id, synchronizedStatus]));
      if (status && updates.length) {
        periodRes = pageSize === "all"
          ? await payrollApi.periods.all(filters)
          : await payrollApi.periods.list({ ...filters, page, page_size: pageSize });
      }
      const periodItems = listResults(periodRes.data);

      setPeriods(periodItems.map((period) => {
        const synchronizedStatus = synchronizedStatusById.get(period.id);
        return synchronizedStatus ? { ...period, status: synchronizedStatus } : period;
      }));
      setPeriodSlipSummaries((previous) => new Map([...previous, ...slipSummaries]));
      setPagination(paginationInfo(periodRes.data, pageSize === "all" ? 1 : page, pageSize));
      setEmployees(employeeItems);
      if (failedUpdates) setError(`${failedUpdates} status periode gagal disinkronkan dengan status slip terbaru.`);
    }
    catch (err) { setError(getApiError(err, "Gagal memuat periode.")); } finally { setLoading(false); }
  }, [loadActiveEmployees, loadSlipsForFilters, page, pageSize, year, month, status]);
  useEffect(() => { loadData(); }, [loadData]);

  const openCreate = () => { const start = todayLocal(); setModal({ start_date: start, end_date: addDays(start, 6), payment_date: addDays(start, 7), status: "draft" }); };
  const openEdit = (period) => setModal({ id: period.id, start_date: period.start_date || "", end_date: period.end_date || "", payment_date: period.payment_date || "", paymentOnly: ["published", "paid"].includes(period.status) || periodSlipSummaries.get(period.id)?.hasFinalizedSlip });
  const showCalculateModal = (period, summary) => {
    const eligibleEmployeeIds = getEligibleEmployeeIds(employees, summary);
    if (!eligibleEmployeeIds.length) {
      setError("Periode ini tidak memiliki karyawan tanpa slip atau slip draft yang dapat dihitung.");
      return;
    }
    setCalculateModal({ ...period, eligibleEmployeeIds });
    setSelectedEmployees(eligibleEmployeeIds);
  };
  const openCalculate = async (period) => {
    const knownSummary = periodSlipSummaries.get(period.id);
    if (knownSummary) {
      showCalculateModal(period, knownSummary);
      return;
    }

    setCheckingPeriodId(period.id); setError("");
    try {
      const slipGroups = await Promise.all(getPeriodMonthFilters(period).map((filters) => loadSlipsForFilters(filters)));
      const currentSlips = getCurrentPeriodSlips(period, uniqueById(slipGroups.flat()));
      const summary = getPeriodSlipSummary(currentSlips);
      const synchronizedStatus = getPeriodStatusFromSlips(currentSlips);
      let synchronizedPeriod = period;
      if (synchronizedStatus && synchronizedStatus !== period.status) {
        await payrollApi.periods.update(period.id, { status: synchronizedStatus });
        synchronizedPeriod = { ...period, status: synchronizedStatus };
        setPeriods((previous) => previous.map((item) => item.id === period.id ? synchronizedPeriod : item));
      }
      setPeriodSlipSummaries((previous) => new Map(previous).set(period.id, summary));
      showCalculateModal(synchronizedPeriod, summary);
    } catch (err) {
      setError(getApiError(err, "Gagal memeriksa status slip periode."));
    } finally {
      setCheckingPeriodId(null);
    }
  };
  const save = async (event) => {
    event.preventDefault();
    if (!modal.paymentOnly) {
      const duration = (new Date(`${modal.end_date}T00:00:00`) - new Date(`${modal.start_date}T00:00:00`)) / 86400000;
      if (duration < 0 || duration > 6) { setError("Periode harus 1 sampai 7 hari."); return; }
    }
    setSaving(true); setError("");
    try { const payload = modal.paymentOnly ? { payment_date: modal.payment_date || null } : { start_date: modal.start_date, end_date: modal.end_date, payment_date: modal.payment_date || null }; if (modal.id) { await payrollApi.periods.update(modal.id, payload); setSuccess(modal.paymentOnly ? "Tanggal pembayaran berhasil diperbarui." : "Periode payroll berhasil diperbarui."); } else { await payrollApi.periods.create({ ...payload, status: "draft" }); setSuccess("Periode payroll berhasil dibuat."); } setModal(null); await loadData(); }
    catch (err) { setError(getApiError(err, modal.id ? "Gagal memperbarui periode." : "Gagal membuat periode.")); } finally { setSaving(false); }
  };
  const calculate = async () => {
    if (!selectedEmployees.length) {
      setError("Pilih minimal satu karyawan untuk dihitung.");
      return;
    }
    setSaving(true); setError("");
    try { const res = await payrollApi.periods.calculate(calculateModal.id, selectedEmployees); const count = res.data?.data?.length || 0; slipCacheRef.current.clear(); setSuccess(`${count} slip berhasil dihitung.`); setCalculateModal(null); setSelectedEmployees([]); await loadData(); navigate("/payroll/slips?status=draft"); }
    catch (err) { setError(getApiError(err, "Kalkulasi gagal. Pastikan tarif karyawan sudah tersedia.")); } finally { setSaving(false); }
  };
  const remove = async (period) => { setSaving(true); setError(""); try { await payrollApi.periods.remove(period.id); setSuccess("Periode dihapus."); setConfirmPeriod(null); await loadData(); } catch (err) { setError(getApiError(err, "Periode yang sudah memiliki slip tidak dapat dihapus.")); } finally { setSaving(false); } };

  return (
    <PayrollShell title="Periode Payroll" actions={<button onClick={openCreate} className={primaryButton}>+ Buat periode</button>}>
      <ErrorBanner message={error} onRetry={loadData} /><SuccessBanner message={success} onClose={() => setSuccess("")} />
      <div className="mb-4 bg-white border border-gray-200 p-3 grid sm:grid-cols-3 gap-3"><Field label="Tahun"><input type="number" min="2020" max="2100" placeholder="Semua" className={inputClass} value={year} onChange={(e) => { setYear(e.target.value); setPage(1); }} /></Field><Field label="Bulan"><select className={inputClass} value={month} onChange={(e) => { setMonth(e.target.value); setPage(1); }}><option value="">Semua bulan</option>{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{new Date(2026, index, 1).toLocaleDateString("id-ID", { month: "long" })}</option>)}</select></Field><Field label="Status"><select className={inputClass} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">Semua status</option><option value="draft">Draft</option><option value="calculated">Dihitung</option><option value="published">Terbit</option><option value="paid">Dibayar</option><option value="cancelled">Dibatalkan</option></select></Field></div>
      <div className="mb-4 bg-white border border-gray-200 p-4"><h2 className="font-semibold text-gray-900">Alur periode</h2><p className="text-xs text-gray-500 mt-1">Periode boleh dimulai pada hari apa pun dan maksimal tujuh hari. Pada batas bulan, potong periode sesuai tanggal kalender.</p></div>
      {loading ? <LoadingState label="Memuat data payroll..." description="Sinkronisasi otomatis memeriksa maksimal tiga bulan terakhir. Pilih tahun/bulan untuk memeriksa periode lama; tombol Hitung akan mengecek slip periode lama terlebih dahulu." /> : periods.length === 0 ? <EmptyState title="Belum ada periode payroll" description="Buat periode setelah absensi siap." /> : (
        <><div className="grid md:grid-cols-2 gap-3">{periods.map((period) => { const slipSummary = periodSlipSummaries.get(period.id); const notice = getPeriodNotice(slipSummary); const canCalculate = getEligibleEmployeeIds(employees, slipSummary).length > 0; const isLocked = ["published", "paid"].includes(period.status) || slipSummary?.hasFinalizedSlip; const isChecking = Number(checkingPeriodId) === Number(period.id); return <article key={period.id} className="bg-white border border-gray-200 p-4"><div className="flex justify-between gap-3"><div><p className="text-xs text-gray-500">Periode #{period.id}</p><h3 className="font-semibold text-gray-900 mt-1">{formatDate(period.start_date)} – {formatDate(period.end_date)}</h3><p className="text-xs text-gray-500 mt-1">Tanggal pembayaran: {period.payment_date ? <span className="font-semibold text-gray-700">{formatDate(period.payment_date)}</span> : <span className="inline-block bg-amber-50 border border-amber-200 text-amber-700 font-semibold px-2 py-0.5">Belum diisi</span>}</p>{notice && <p className="mt-2 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1.5">{notice}</p>}</div><StatusPill status={period.status} /></div><div className="mt-4 pt-3 border-t flex gap-3 text-xs font-semibold">{canCalculate && <button disabled={isChecking} onClick={() => openCalculate(period)} className="text-[#0067b8] disabled:text-gray-400">{isChecking ? "Memeriksa slip..." : "Hitung slip"}</button>}<button onClick={() => openEdit(period)} className="text-gray-700 ml-auto">Edit</button>{!isLocked && <button onClick={() => setConfirmPeriod(period)} className="text-red-600">Hapus</button>}</div></article>; })}</div><Pagination {...pagination} onPageChange={setPage} onPageSizeChange={(value) => { setPageSize(value); setPage(1); }} /></>
      )}
      {modal && <Modal title={modal.paymentOnly ? "Edit tanggal pembayaran" : modal.id ? "Edit periode payroll" : "Buat periode payroll"} onClose={() => setModal(null)}><form onSubmit={save} className="space-y-4">{!modal.paymentOnly && <div className="grid grid-cols-2 gap-3"><Field label="Tanggal mulai" required><input type="date" required className={inputClass} value={modal.start_date} onChange={(e) => setModal((prev) => ({ ...prev, start_date: e.target.value, end_date: addDays(e.target.value, 6) }))} /></Field><Field label="Tanggal selesai" required><input type="date" required className={inputClass} value={modal.end_date} onChange={(e) => setModal((prev) => ({ ...prev, end_date: e.target.value }))} /></Field></div>}<Field label="Tanggal pembayaran"><input type="date" className={inputClass} value={modal.payment_date} onChange={(e) => setModal((prev) => ({ ...prev, payment_date: e.target.value }))} /></Field><div className="flex justify-end gap-2"><button type="button" className={secondaryButton} onClick={() => setModal(null)}>Batal</button><button disabled={saving} className={primaryButton}>{modal.paymentOnly ? "Simpan tanggal pembayaran" : modal.id ? "Simpan perubahan" : "Simpan periode"}</button></div></form></Modal>}
      {calculateModal && <Modal title="Hitung slip mingguan" onClose={() => setCalculateModal(null)}><p className="text-sm text-gray-600 mb-4">Karyawan tanpa slip dan karyawan dengan slip draft dapat dihitung. Slip terbit atau dibayar tidak akan diproses.</p><div className="border border-gray-200 max-h-64 overflow-y-auto divide-y">{employees.filter((employee) => calculateModal.eligibleEmployeeIds.some((id) => Number(id) === Number(employee.id))).map((employee) => <label key={employee.id} className="flex items-center gap-3 p-3 hover:bg-gray-50"><input type="checkbox" checked={selectedEmployees.some((id) => Number(id) === Number(employee.id))} onChange={() => setSelectedEmployees((prev) => prev.some((id) => Number(id) === Number(employee.id)) ? prev.filter((id) => Number(id) !== Number(employee.id)) : [...prev, employee.id])} /><span className="text-sm"><strong>{employee.name}</strong><span className="text-gray-500"> · {employee.employee_code}</span></span></label>)}</div><div className="mt-5 flex justify-end gap-2"><button onClick={() => setCalculateModal(null)} className={secondaryButton}>Batal</button><button onClick={calculate} disabled={saving || !selectedEmployees.length} className={primaryButton}>{saving ? "Menghitung..." : `Hitung ${selectedEmployees.length} karyawan`}</button></div></Modal>}
      {confirmPeriod && <ConfirmDialog title="Hapus periode" message={`Hapus periode ${formatDate(confirmPeriod.start_date)} sampai ${formatDate(confirmPeriod.end_date)}? Periode yang sudah memiliki slip tidak dapat dihapus.`} confirmLabel="Hapus periode" danger busy={saving} onClose={() => setConfirmPeriod(null)} onConfirm={() => remove(confirmPeriod)} />}
    </PayrollShell>
  );
}
