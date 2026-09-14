import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { payrollApi, getApiError, listResults } from "../../../api/payrollApi";
import PayrollShell from "../components/PayrollShell";
import { ErrorBanner, LoadingState, StatusPill } from "../components/PayrollUI";
import { formatCurrency, formatDate } from "../payrollUtils";

export default function PayrollDashboard() {
  const [data, setData] = useState({ employees: [], slips: [], receivables: [], periods: [] });
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const [employees, slips, receivables, periods] = await Promise.all([
        payrollApi.employees.list({ status: "active" }), payrollApi.slips.list(), payrollApi.receivables.list(), payrollApi.periods.list(),
      ]);
      setData({
        employees: listResults(employees.data), slips: listResults(slips.data),
        receivables: listResults(receivables.data), periods: listResults(periods.data),
      });
      setCounts({
        employees: employees.data?.count ?? listResults(employees.data).length,
        slips: slips.data?.count ?? listResults(slips.data).length,
        receivables: receivables.data?.count ?? listResults(receivables.data).length,
        periods: periods.data?.count ?? listResults(periods.data).length,
      });
    } catch (err) {
      setError(getApiError(err, "Gagal memuat ringkasan payroll."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const activeDebt = data.receivables.filter((item) => item.status === "active");
  const debtBalance = activeDebt.reduce((sum, item) => sum + Number(item.current_balance || 0), 0);
  const draftSlips = data.slips.filter((item) => item.status === "draft");
  const recentSlips = data.slips.slice(0, 5);

  return (
    <PayrollShell title="Payroll">
      <ErrorBanner message={error} onRetry={loadData} />
      {loading ? <LoadingState /> : (
        <>
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            {[
              ["Karyawan", counts.employees || 0, "/payroll/employees", "text-[#0067b8]"],
              ["Periode", counts.periods || 0, "/payroll/periods", "text-purple-700"],
              ["Slip draft", draftSlips.length, "/payroll/slips?status=draft", "text-amber-700"],
              ["Saldo utang aktif", formatCurrency(debtBalance), "/payroll/utang", "text-red-700"],
            ].map(([label, value, path, color]) => (
              <Link key={label} to={path} className="bg-white border border-gray-200 p-4 hover:border-[#0067b8] transition-colors">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
                <p className={`text-xl font-bold mt-2 ${color}`}>{value}</p>
              </Link>
            ))}
          </section>

          <section className="grid lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 bg-white border border-gray-200">
              <div className="p-4 border-b border-gray-200 flex justify-between items-center">
                <div><h2 className="font-semibold text-gray-900">Slip terbaru</h2><p className="text-xs text-gray-500 mt-0.5">Snapshot mingguan dan bulanan</p></div>
                <Link to="/payroll/slips" className="text-sm font-semibold text-[#0067b8]">Lihat semua</Link>
              </div>
              {recentSlips.length ? recentSlips.map((slip) => (
                <Link to={`/payroll/slips/${slip.id}`} key={slip.id} className="flex items-center justify-between gap-3 p-4 border-b last:border-b-0 border-gray-100 hover:bg-gray-50">
                  <div className="min-w-0"><p className="font-semibold text-sm text-gray-800 truncate">{slip.employee_name}</p><p className="text-xs text-gray-500">{formatDate(slip.period_start)} – {formatDate(slip.period_end)}</p></div>
                  <div className="text-right shrink-0"><p className="font-bold text-sm text-gray-900">{formatCurrency(slip.net_pay)}</p><StatusPill status={slip.status} /></div>
                </Link>
              )) : <p className="p-6 text-sm text-gray-500 text-center">Belum ada slip payroll.</p>}
            </div>

            <div className="bg-[#0f3154] text-white p-5">
              <p className="text-xs font-semibold text-blue-200 uppercase tracking-wide">Mulai proses</p>
              <h2 className="text-xl font-semibold mt-2">Payroll periode baru</h2>
              <p className="text-sm text-blue-100 mt-2 leading-relaxed">Catat pengecualian absensi, buat periode maksimal tujuh hari, lalu kalkulasi slip.</p>
              <div className="mt-5 space-y-2">
                <Link to="/payroll/attendance" className="block bg-white/10 hover:bg-white/20 px-3 py-2.5 text-sm font-semibold">1. Kelola absensi</Link>
                <Link to="/payroll/periods" className="block bg-white text-[#0f3154] px-3 py-2.5 text-sm font-semibold">2. Buat periode</Link>
                <Link to="/payroll/slips" className="block bg-white/10 hover:bg-white/20 px-3 py-2.5 text-sm font-semibold">3. Periksa dan terbitkan</Link>
              </div>
            </div>
          </section>
        </>
      )}
    </PayrollShell>
  );
}
