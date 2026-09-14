import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  payrollApi,
  getApiError,
  listResults,
  paginationInfo,
} from "../../../api/payrollApi";
import PayrollShell from "../components/PayrollShell";
import {
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  Field,
  inputClass,
  LoadingState,
  Modal,
  Pagination,
  primaryButton,
  secondaryButton,
  StatusPill,
  SuccessBanner,
} from "../components/PayrollUI";
import { formatCurrency, formatDate, todayLocal } from "../payrollUtils";

export default function PayrollSlips() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [slips, setSlips] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [type, setType] = useState(searchParams.get("slip_type") || "");
  const [status, setStatus] = useState(searchParams.get("status") || "");
  const [employee, setEmployee] = useState(searchParams.get("employee") || "");
  const [year, setYear] = useState("");
  const [month, setMonth] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [pagination, setPagination] = useState({
    count: 0,
    page: 1,
    pageSize: 25,
  });
  const [monthlyModal, setMonthlyModal] = useState(null);
  const [monthlyProgress, setMonthlyProgress] = useState(null);
  const [bulkAction, setBulkAction] = useState(null);
  const [bulkProgress, setBulkProgress] = useState(null);
  const [adjustmentModal, setAdjustmentModal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [confirmPublish, setConfirmPublish] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const filters = {};
      if (type) filters.slip_type = type;
      if (status) filters.status = status;
      if (employee) filters.employee = employee;
      if (year) filters.year = year;
      if (month) filters.month = month;
      const slipRequest =
        pageSize === "all"
          ? payrollApi.slips.all(filters)
          : payrollApi.slips.list({ ...filters, page, page_size: pageSize });
      const [slipRes, employeeRes] = await Promise.all([
        slipRequest,
        payrollApi.employees.all(),
      ]);
      setSlips(listResults(slipRes.data));
      setPagination(
        paginationInfo(slipRes.data, pageSize === "all" ? 1 : page, pageSize),
      );
      setEmployees(listResults(employeeRes.data));
    } catch (err) {
      setError(getApiError(err, "Gagal memuat slip."));
    } finally {
      setLoading(false);
    }
  }, [type, status, employee, year, month, page, pageSize]);
  useEffect(() => {
    loadData();
  }, [loadData]);

  const summary = useMemo(
    () =>
      slips.reduce(
        (acc, slip) => ({
          gross: acc.gross + Number(slip.total_before_adjustments || 0),
          deductions: acc.deductions + Number(slip.deductions_total || 0),
          net: acc.net + Number(slip.net_pay || 0),
        }),
        { gross: 0, deductions: 0, net: 0 },
      ),
    [slips],
  );

  const calculateMonthly = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    const employeeIds = monthlyModal.employee_ids;
    const failures = [];
    let completed = 0;
    setMonthlyProgress({ completed: 0, total: employeeIds.length });
    for (const employeeId of employeeIds) {
      try {
        await payrollApi.slips.calculateMonthly({
          employee_id: employeeId,
          year: Number(monthlyModal.year),
          month: Number(monthlyModal.month),
        });
      } catch (err) {
        const employeeName =
          employees.find((item) => item.id === employeeId)?.name ||
          `Karyawan #${employeeId}`;
        failures.push(`${employeeName}: ${getApiError(err, "gagal dihitung")}`);
      } finally {
        completed += 1;
        setMonthlyProgress({ completed, total: employeeIds.length });
      }
    }
    const succeeded = employeeIds.length - failures.length;
    const failureMessage = failures.length
      ? `${failures.length} rekap gagal dihitung. ${failures.join(" · ")}`
      : "";
    setMonthlyModal(null);
    setMonthlyProgress(null);
    setSaving(false);
    await loadData();
    if (succeeded)
      setSuccess(
        `${succeeded} rekap bulanan berhasil dihitung dan siap diperiksa.`,
      );
    if (failureMessage) setError(failureMessage);
  };
  const publish = async (slip) => {
    setSaving(true);
    try {
      await payrollApi.slips.publish(slip.id);
      setSuccess("Slip berhasil diterbitkan.");
      setConfirmPublish(null);
      await loadData();
    } catch (err) {
      setError(getApiError(err, "Gagal menerbitkan slip."));
    } finally {
      setSaving(false);
    }
  };
  const openBulkAction = (action) => {
    const requiredStatus = action === "publish" ? "draft" : "published";
    const eligibleSlips = slips.filter(
      (slip) => slip.status === requiredStatus,
    );
    setBulkAction({
      action,
      date: todayLocal(),
      slip_ids: eligibleSlips.map((slip) => slip.id),
    });
  };
  const executeBulkAction = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    const selectedSlips = slips.filter((slip) =>
      bulkAction.slip_ids.includes(slip.id),
    );
    const failures = [];
    let completed = 0;
    setBulkProgress({ completed: 0, total: selectedSlips.length });
    for (const slip of selectedSlips) {
      try {
        if (bulkAction.action === "publish")
          await payrollApi.slips.publish(slip.id, {
            issued_at: bulkAction.date,
          });
        else
          await payrollApi.slips.markPaid(slip.id, {
            paid_at: bulkAction.date,
          });
      } catch (err) {
        failures.push(
          `${slip.employee_name}: ${getApiError(err, "gagal diproses")}`,
        );
      } finally {
        completed += 1;
        setBulkProgress({ completed, total: selectedSlips.length });
      }
    }
    const succeeded = selectedSlips.length - failures.length;
    const actionLabel =
      bulkAction.action === "publish" ? "diterbitkan" : "ditandai dibayar";
    const failureMessage = failures.length
      ? `${failures.length} slip gagal diproses. ${failures.join(" · ")}`
      : "";
    setBulkAction(null);
    setBulkProgress(null);
    setSaving(false);
    await loadData();
    if (succeeded) setSuccess(`${succeeded} slip berhasil ${actionLabel}.`);
    if (failureMessage) setError(failureMessage);
  };
  const saveAdjustment = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await payrollApi.adjustments.create(adjustmentModal.form);
      setSuccess("Penyesuaian ditambahkan. Kalkulasi slip telah diperbarui.");
      setAdjustmentModal(null);
      await loadData();
    } catch (err) {
      setError(getApiError(err, "Gagal menambahkan penyesuaian."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <PayrollShell
      title="Slip Payroll"
      actions={
        <>
          <button
            onClick={() => openBulkAction("publish")}
            disabled={!slips.some((slip) => slip.status === "draft")}
            className={secondaryButton}
          >
            Terbitkan massal
          </button>
          <button
            onClick={() => openBulkAction("paid")}
            disabled={!slips.some((slip) => slip.status === "published")}
            className="bg-green-700 hover:bg-green-800 disabled:bg-gray-300 text-white px-4 py-2.5 text-sm font-semibold"
          >
            Bayar massal
          </button>
          <button
            onClick={() => {
              const now = new Date();
              setMonthlyModal({
                employee_ids: employees
                  .filter((item) => item.employment_status === "active")
                  .map((item) => item.id),
                year: now.getFullYear(),
                month: now.getMonth() + 1,
              });
            }}
            disabled={!employees.length}
            className={primaryButton}
          >
            + Rekap bulanan massal
          </button>
        </>
      }
    >
      <ErrorBanner message={error} onRetry={loadData} />
      <SuccessBanner message={success} onClose={() => setSuccess("")} />
      <div className="bg-white border border-gray-200 p-3 mb-4 grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <Field label="Jenis">
          <select
            className={inputClass}
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Semua jenis</option>
            <option value="weekly">Mingguan</option>
            <option value="monthly">Bulanan</option>
          </select>
        </Field>
        <Field label="Status">
          <select
            className={inputClass}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Semua status</option>
            <option value="draft">Draft</option>
            <option value="published">Terbit</option>
            <option value="paid">Dibayar</option>
            <option value="cancelled">Dibatalkan</option>
            <option value="replaced">Diganti</option>
          </select>
        </Field>
        <Field label="Karyawan">
          <select
            className={inputClass}
            value={employee}
            onChange={(e) => {
              setEmployee(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Semua karyawan</option>
            {employees.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Tahun">
          <input
            type="number"
            min="2020"
            max="2100"
            placeholder="Semua"
            className={inputClass}
            value={year}
            onChange={(e) => {
              setYear(e.target.value);
              setPage(1);
            }}
          />
        </Field>
        <Field label="Bulan">
          <select
            className={inputClass}
            value={month}
            onChange={(e) => {
              setMonth(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Semua bulan</option>
            {Array.from({ length: 12 }, (_, index) => (
              <option key={index + 1} value={index + 1}>
                {new Date(2026, index, 1).toLocaleDateString("id-ID", {
                  month: "long",
                })}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {!loading && slips.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="bg-white border p-3">
            <p className="text-[10px] text-gray-500 uppercase">
              Total upah · halaman ini
            </p>
            <p className="font-bold text-sm sm:text-lg text-gray-900 mt-1">
              {formatCurrency(summary.gross)}
            </p>
          </div>
          <div className="bg-white border p-3">
            <p className="text-[10px] text-gray-500 uppercase">
              Potongan · halaman ini
            </p>
            <p className="font-bold text-sm sm:text-lg text-red-700 mt-1">
              {formatCurrency(summary.deductions)}
            </p>
          </div>
          <div className="bg-white border p-3">
            <p className="text-[10px] text-gray-500 uppercase">
              Sisa upah · halaman ini
            </p>
            <p className="font-bold text-sm sm:text-lg text-[#0067b8] mt-1">
              {formatCurrency(summary.net)}
            </p>
          </div>
        </div>
      )}
      {loading ? (
        <LoadingState />
      ) : slips.length === 0 ? (
        <EmptyState
          title="Tidak ada slip"
          description="Buat periode mingguan atau hitung rekap bulanan."
        />
      ) : (
        <>
          <div className="space-y-3">
            {slips.map((slip) => (
              <article
                key={slip.id}
                className="bg-white border border-gray-200 p-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase bg-gray-100 px-2 py-1">
                        {slip.slip_type === "monthly" ? "Bulanan" : "Mingguan"}
                      </span>
                      <StatusPill status={slip.status} />
                    </div>
                    <h3 className="font-semibold text-gray-900 mt-2">
                      {slip.employee_name}
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {slip.document_reference}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatDate(slip.period_start)} –{" "}
                      {formatDate(slip.period_end)}
                    </p>
                  </div>
                  <div className="sm:text-right">
                    <p className="text-xs text-gray-500">Sisa upah</p>
                    <p className="text-xl font-bold text-[#0067b8]">
                      {formatCurrency(slip.net_pay)}
                    </p>
                    <p className="text-xs text-gray-500">
                      Potongan {formatCurrency(slip.deductions_total)}
                    </p>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t flex flex-wrap items-center gap-4 text-xs font-semibold">
                  <button
                    onClick={() => navigate(`/payroll/slips/${slip.id}`)}
                    className="text-[#0067b8]"
                  >
                    Detail & cetak
                  </button>
                  {slip.status === "draft" && (
                    <>
                      <button
                        onClick={() =>
                          setAdjustmentModal({
                            slip,
                            form: {
                              slip: slip.id,
                              adjustment_date: slip.period_end,
                              adjustment_type: "addition",
                              category: "bonus",
                              amount: "",
                              description: "",
                            },
                          })
                        }
                        className="text-purple-700"
                      >
                        Tambah/kurangi
                      </button>
                      <button
                        onClick={() => setConfirmPublish(slip)}
                        className="ml-auto bg-green-700 text-white px-3 py-2"
                      >
                        Terbitkan
                      </button>
                    </>
                  )}
                </div>
              </article>
            ))}
          </div>
          <Pagination
            {...pagination}
            onPageChange={setPage}
            onPageSizeChange={(value) => {
              setPageSize(value);
              setPage(1);
            }}
          />
        </>
      )}
      {monthlyModal && (
        <Modal
          title="Hitung rekap bulanan massal"
          size="max-w-2xl"
          onClose={() => !saving && setMonthlyModal(null)}
        >
          <form onSubmit={calculateMonthly} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Bulan" required>
                <select
                  disabled={saving}
                  className={inputClass}
                  value={monthlyModal.month}
                  onChange={(e) =>
                    setMonthlyModal((prev) => ({
                      ...prev,
                      month: e.target.value,
                    }))
                  }
                >
                  {Array.from({ length: 12 }, (_, index) => (
                    <option key={index + 1} value={index + 1}>
                      {new Date(2026, index, 1).toLocaleDateString("id-ID", {
                        month: "long",
                      })}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Tahun" required>
                <input
                  disabled={saving}
                  type="number"
                  min="2020"
                  max="2100"
                  className={inputClass}
                  value={monthlyModal.year}
                  onChange={(e) =>
                    setMonthlyModal((prev) => ({
                      ...prev,
                      year: e.target.value,
                    }))
                  }
                />
              </Field>
            </div>
            <div className="border border-gray-200">
              <div className="px-3 py-2 bg-gray-50 border-b flex items-center justify-between gap-3">
                <strong className="text-xs text-gray-700">
                  Pilih karyawan
                </strong>
                <button
                  type="button"
                  disabled={saving}
                  className="text-xs font-semibold text-[#0067b8] disabled:text-gray-400"
                  onClick={() =>
                    setMonthlyModal((prev) => ({
                      ...prev,
                      employee_ids:
                        prev.employee_ids.length === employees.length
                          ? []
                          : employees.map((item) => item.id),
                    }))
                  }
                >
                  {monthlyModal.employee_ids.length === employees.length
                    ? "Kosongkan"
                    : "Pilih semua"}
                </button>
              </div>
              <div className="grid sm:grid-cols-2 max-h-64 overflow-y-auto divide-y sm:divide-y-0">
                {employees.map((item) => (
                  <label
                    key={item.id}
                    className="flex items-center gap-3 p-3 border-b sm:border-r hover:bg-blue-50"
                  >
                    <input
                      disabled={saving}
                      type="checkbox"
                      checked={monthlyModal.employee_ids.includes(item.id)}
                      onChange={() =>
                        setMonthlyModal((prev) => ({
                          ...prev,
                          employee_ids: prev.employee_ids.includes(item.id)
                            ? prev.employee_ids.filter((id) => id !== item.id)
                            : [...prev.employee_ids, item.id],
                        }))
                      }
                    />
                    <span className="text-sm">
                      <strong>{item.name}</strong>
                      <span className="text-gray-500">
                        {" "}
                        · {item.employee_code}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <p className="text-xs text-gray-500">
              Rekap diambil dari slip mingguan yang sudah diterbitkan atau
              dibayar. Setiap karyawan diproses bergiliran agar server tetap
              stabil.
            </p>
            {monthlyProgress && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-gray-600">
                  <span>Sedang menghitung rekap...</span>
                  <strong>
                    {monthlyProgress.completed}/{monthlyProgress.total}
                  </strong>
                </div>
                <div className="h-2 bg-gray-200 overflow-hidden">
                  <div
                    className="h-full bg-[#0067b8] transition-all"
                    style={{
                      width: `${(monthlyProgress.completed / monthlyProgress.total) * 100}%`,
                    }}
                  />
                </div>
              </div>
            )}
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-gray-500">
                {monthlyModal.employee_ids.length} karyawan dipilih
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setMonthlyModal(null)}
                  className={secondaryButton}
                >
                  Batal
                </button>
                <button
                  disabled={saving || !monthlyModal.employee_ids.length}
                  className={primaryButton}
                >
                  {saving
                    ? `Menghitung ${monthlyProgress?.completed || 0}/${monthlyProgress?.total || monthlyModal.employee_ids.length}...`
                    : `Hitung ${monthlyModal.employee_ids.length} rekap`}
                </button>
              </div>
            </div>
          </form>
        </Modal>
      )}
      {bulkAction && (
        <BulkSlipActionModal
          action={bulkAction}
          slips={slips}
          progress={bulkProgress}
          saving={saving}
          onChange={setBulkAction}
          onClose={() => setBulkAction(null)}
          onSubmit={executeBulkAction}
        />
      )}
      {adjustmentModal && (
        <Modal
          title={`Penyesuaian · ${adjustmentModal.slip.employee_name}`}
          onClose={() => setAdjustmentModal(null)}
        >
          <form onSubmit={saveAdjustment} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Jenis">
                <select
                  className={inputClass}
                  value={adjustmentModal.form.adjustment_type}
                  onChange={(e) =>
                    setAdjustmentModal((prev) => ({
                      ...prev,
                      form: { ...prev.form, adjustment_type: e.target.value },
                    }))
                  }
                >
                  <option value="addition">Tambahan</option>
                  <option value="deduction">Potongan</option>
                </select>
              </Field>
              <Field label="Tanggal" required>
                <input
                  type="date"
                  required
                  min={adjustmentModal.slip.period_start}
                  max={adjustmentModal.slip.period_end}
                  className={inputClass}
                  value={adjustmentModal.form.adjustment_date}
                  onChange={(e) =>
                    setAdjustmentModal((prev) => ({
                      ...prev,
                      form: { ...prev.form, adjustment_date: e.target.value },
                    }))
                  }
                />
              </Field>
            </div>
            <Field label="Kategori" required>
              <input
                required
                className={inputClass}
                placeholder="bonus, thr, koreksi..."
                value={adjustmentModal.form.category}
                onChange={(e) =>
                  setAdjustmentModal((prev) => ({
                    ...prev,
                    form: { ...prev.form, category: e.target.value },
                  }))
                }
              />
            </Field>
            <Field label="Nominal" required>
              <input
                type="number"
                min="1"
                required
                className={inputClass}
                value={adjustmentModal.form.amount}
                onChange={(e) =>
                  setAdjustmentModal((prev) => ({
                    ...prev,
                    form: { ...prev.form, amount: e.target.value },
                  }))
                }
              />
            </Field>
            <Field label="Keterangan">
              <textarea
                className={inputClass}
                rows="2"
                value={adjustmentModal.form.description}
                onChange={(e) =>
                  setAdjustmentModal((prev) => ({
                    ...prev,
                    form: { ...prev.form, description: e.target.value },
                  }))
                }
              />
            </Field>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className={secondaryButton}
                onClick={() => setAdjustmentModal(null)}
              >
                Batal
              </button>
              <button disabled={saving} className={primaryButton}>
                Simpan
              </button>
            </div>
          </form>
        </Modal>
      )}
      {confirmPublish && (
        <ConfirmDialog
          title="Terbitkan slip"
          message={`Terbitkan ${confirmPublish.document_reference}? Setelah diterbitkan, slip menjadi dokumen resmi dan perubahan harus melalui revisi.`}
          confirmLabel="Terbitkan slip"
          busy={saving}
          onClose={() => setConfirmPublish(null)}
          onConfirm={() => publish(confirmPublish)}
        />
      )}
    </PayrollShell>
  );
}

function BulkSlipActionModal({
  action,
  slips,
  progress,
  saving,
  onChange,
  onClose,
  onSubmit,
}) {
  const publishing = action.action === "publish";
  const eligibleSlips = slips.filter(
    (slip) => slip.status === (publishing ? "draft" : "published"),
  );
  const allSelected = action.slip_ids.length === eligibleSlips.length;
  return (
    <Modal
      title={
        publishing
          ? "Terbitkan slip secara massal"
          : "Tandai dibayar secara massal"
      }
      size="max-w-2xl"
      onClose={saving ? undefined : onClose}
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label={publishing ? "Tanggal terbit" : "Tanggal bayar"} required>
          <input
            type="date"
            required
            disabled={saving}
            className={inputClass}
            value={action.date}
            onChange={(event) =>
              onChange((prev) => ({ ...prev, date: event.target.value }))
            }
          />
        </Field>
        <div className="border border-gray-200">
          <div className="px-3 py-2 bg-gray-50 border-b flex items-center justify-between gap-3">
            <strong className="text-xs text-gray-700">
              Pilih slip pada halaman ini
            </strong>
            <button
              type="button"
              disabled={saving}
              className="text-xs font-semibold text-[#0067b8] disabled:text-gray-400"
              onClick={() =>
                onChange((prev) => ({
                  ...prev,
                  slip_ids: allSelected
                    ? []
                    : eligibleSlips.map((slip) => slip.id),
                }))
              }
            >
              {allSelected ? "Kosongkan" : "Pilih semua"}
            </button>
          </div>
          <div className="max-h-72 overflow-y-auto divide-y">
            {eligibleSlips.map((slip) => (
              <label
                key={slip.id}
                className="flex items-center gap-3 p-3 hover:bg-blue-50"
              >
                <input
                  type="checkbox"
                  disabled={saving}
                  checked={action.slip_ids.includes(slip.id)}
                  onChange={() =>
                    onChange((prev) => ({
                      ...prev,
                      slip_ids: prev.slip_ids.includes(slip.id)
                        ? prev.slip_ids.filter((id) => id !== slip.id)
                        : [...prev.slip_ids, slip.id],
                    }))
                  }
                />
                <span className="min-w-0 text-sm">
                  <strong>{slip.employee_name}</strong>
                  <span className="block text-xs text-gray-500 truncate">
                    {slip.document_reference} · {formatCurrency(slip.net_pay)}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </div>
        <p className="text-xs text-gray-500">
          Aksi diterapkan pada slip yang dipilih dari halaman saat ini. Gunakan
          filter dan opsi “Tampilkan Semua” untuk memproses seluruh hasil.
        </p>
        {progress && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-gray-600">
              <span>Sedang memproses...</span>
              <strong>
                {progress.completed}/{progress.total}
              </strong>
            </div>
            <div className="h-2 bg-gray-200 overflow-hidden">
              <div
                className="h-full bg-green-700 transition-all"
                style={{
                  width: `${(progress.completed / progress.total) * 100}%`,
                }}
              />
            </div>
          </div>
        )}
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-gray-500">
            {action.slip_ids.length} slip dipilih
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={saving}
              className={secondaryButton}
              onClick={onClose}
            >
              Batal
            </button>
            <button
              disabled={saving || !action.slip_ids.length || !action.date}
              className={
                publishing
                  ? primaryButton
                  : "bg-green-700 hover:bg-green-800 disabled:bg-gray-300 text-white px-4 py-2.5 text-sm font-semibold"
              }
            >
              {saving
                ? `Memproses ${progress?.completed || 0}/${progress?.total || action.slip_ids.length}...`
                : publishing
                  ? `Terbitkan ${action.slip_ids.length} slip`
                  : `Bayarkan ${action.slip_ids.length} slip`}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
