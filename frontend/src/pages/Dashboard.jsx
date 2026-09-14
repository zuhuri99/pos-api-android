import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";
import incomeApi from "../api/incomeAxios";
import { payrollApi, listResults } from "../api/payrollApi";
import MobileLayout from "../layouts/MobileLayout";

const PERIODS = [
  ["last_year", "Tahun lalu"],
  ["this_year", "Tahun ini"],
  ["last_month", "Bulan lalu"],
  ["this_month", "Bulan ini"],
];

const formatDateValue = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getPeriod = (preset) => {
  const now = new Date();
  let start;
  let end;
  if (preset === "last_year") {
    start = new Date(now.getFullYear() - 1, 0, 1);
    end = new Date(now.getFullYear() - 1, 11, 31);
  } else if (preset === "this_year") {
    start = new Date(now.getFullYear(), 0, 1);
    end = new Date(now.getFullYear(), 11, 31);
  } else if (preset === "last_month") {
    start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    end = new Date(now.getFullYear(), now.getMonth(), 0);
  } else {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  }
  return {
    start: formatDateValue(start),
    end: formatDateValue(end),
    label: `${start.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })} – ${end.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}`,
  };
};

const currency = (value) => new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
}).format(Number(value) || 0);

const inRange = (value, range) => value && value.slice(0, 10) >= range.start && value.slice(0, 10) <= range.end;
const flattenIncome = (payload) => Object.values(payload?.data || {}).flatMap((items) => Array.isArray(items) ? items : []);

const fetchAllExpenses = async () => {
  const items = [];
  let page = 1;
  let next = true;
  while (next) {
    const response = await api.get("/expenses/", { params: { page } });
    items.push(...listResults(response.data));
    next = Boolean(response.data?.next);
    page += 1;
  }
  return items;
};

function PanelError({ message, onRetry }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
      <p>{message}</p>
      <button type="button" onClick={onRetry} className="mt-3 font-bold text-red-800 underline">Coba lagi</button>
    </div>
  );
}

function Metric({ label, value, tone = "text-slate-900" }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className={`mt-1 truncate text-lg font-bold ${tone}`}>{value}</p>
    </div>
  );
}

function Section({ title, description, href, loading, error, onRetry, children }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
        <div><h2 className="font-bold text-slate-900">{title}</h2><p className="mt-1 text-xs text-slate-500">{description}</p></div>
        <Link to={href} className="shrink-0 text-sm font-bold text-[#0067b8]">Lihat detail</Link>
      </div>
      <div className="p-5">
        {loading ? <div className="h-24 animate-pulse rounded-xl bg-slate-100" role="status" aria-label={`Memuat ${title}`} /> : error ? <PanelError message={error} onRetry={onRetry} /> : children}
      </div>
    </section>
  );
}

export default function Dashboard() {
  const [preset, setPreset] = useState("this_month");
  const range = useMemo(() => getPeriod(preset), [preset]);
  const requestId = useRef(0);
  const [expense, setExpense] = useState({ loading: true, error: "", items: [] });
  const [income, setIncome] = useState({ loading: true, error: "", items: [] });
  const [payroll, setPayroll] = useState({ loading: true, error: "", employees: 0, slips: [], receivables: [] });

  const loadExpense = useCallback(async (id = requestId.current) => {
    setExpense((value) => ({ ...value, loading: true, error: "" }));
    try {
      const all = await fetchAllExpenses();
      if (id === requestId.current) setExpense({ loading: false, error: "", items: all.filter((item) => inRange(item.date, range)) });
    } catch {
      if (id === requestId.current) setExpense({ loading: false, error: "Gagal memuat ringkasan expense.", items: [] });
    }
  }, [range]);

  const loadIncome = useCallback(async (id = requestId.current) => {
    setIncome((value) => ({ ...value, loading: true, error: "" }));
    try {
      const response = await incomeApi.get("/income/lite", { params: { start_date: range.start, end_date: range.end } });
      if (id === requestId.current) setIncome({ loading: false, error: "", items: flattenIncome(response.data) });
    } catch {
      if (id === requestId.current) setIncome({ loading: false, error: "Gagal memuat ringkasan income.", items: [] });
    }
  }, [range]);

  const loadPayroll = useCallback(async (id = requestId.current) => {
    setPayroll((value) => ({ ...value, loading: true, error: "" }));
    try {
      const [employees, slips, receivables] = await Promise.all([
        payrollApi.employees.list({ status: "active" }),
        payrollApi.slips.all(),
        payrollApi.receivables.all(),
      ]);
      if (id !== requestId.current) return;
      setPayroll({
        loading: false,
        error: "",
        employees: Number(employees.data?.count ?? listResults(employees.data).length),
        slips: listResults(slips.data).filter((item) => inRange(item.period_start, range)),
        receivables: listResults(receivables.data).filter((item) => inRange(item.disbursed_at, range)),
      });
    } catch {
      if (id === requestId.current) setPayroll({ loading: false, error: "Gagal memuat ringkasan payroll.", employees: 0, slips: [], receivables: [] });
    }
  }, [range]);

  useEffect(() => {
    requestId.current += 1;
    const id = requestId.current;
    loadExpense(id);
    loadIncome(id);
    loadPayroll(id);
  }, [loadExpense, loadIncome, loadPayroll]);

  const expenseTotal = expense.items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const incomeTotal = income.items.reduce((sum, item) => sum + Number(item.final_total || 0), 0);
  const countedPayrollSlips = payroll.slips.filter((item) =>
    item.slip_type === "weekly" && ["published", "paid"].includes(item.status),
  );
  const payrollTotal = countedPayrollSlips.reduce((sum, item) => sum + Number(item.total_before_adjustments || 0), 0);
  const activeReceivables = payroll.receivables.filter((item) => item.status === "active");
  const receivableTotal = activeReceivables.reduce((sum, item) => sum + Number(item.current_balance || 0), 0);
  const cashFlowReady = !expense.loading && !income.loading && !expense.error && !income.error;

  return (
    <MobileLayout title="Dashboard">
      <div className="mx-auto max-w-7xl space-y-5 pb-10">
        <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-[#063b64] to-[#0078d4] p-5 text-white shadow-lg sm:p-7">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
            <div>
              <p className="text-sm font-semibold text-cyan-200">Ringkasan keuangan</p>
              <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Selamat datang, {localStorage.getItem("username") || "Pengguna"}</h1>
              <p className="mt-2 text-sm text-blue-100">Periode {range.label}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Pilih periode dashboard">
              {PERIODS.map(([value, label]) => (
                <button key={value} type="button" onClick={() => setPreset(value)} aria-pressed={preset === value} className={`rounded-xl px-3 py-2.5 text-xs font-bold transition ${preset === value ? "bg-white text-[#0067b8] shadow" : "bg-white/10 text-white hover:bg-white/20"}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Total income" value={income.loading ? "Memuat…" : income.error ? "Tidak tersedia" : currency(incomeTotal)} tone="text-emerald-700" />
          <Metric label="Total expense" value={expense.loading ? "Memuat…" : expense.error ? "Tidak tersedia" : currency(expenseTotal)} tone="text-red-700" />
          <Metric label="Arus kas bersih" value={cashFlowReady ? currency(incomeTotal - expenseTotal) : "Tidak tersedia"} tone={incomeTotal - expenseTotal >= 0 ? "text-[#0067b8]" : "text-red-700"} />
          <Metric label="Total payroll" value={payroll.loading ? "Memuat…" : payroll.error ? "Tidak tersedia" : currency(payrollTotal)} tone="text-violet-700" />
        </section>

        <div className="grid gap-5 xl:grid-cols-3">
          <Section title="Expense" description="Pengeluaran dalam periode terpilih" href="/expense" loading={expense.loading} error={expense.error} onRetry={() => loadExpense()}>
            <div className="grid grid-cols-2 gap-3">
              <Metric label="Total" value={currency(expenseTotal)} tone="text-red-700" />
              <Metric label="Transaksi" value={expense.items.length} />
              <Metric label="Belum diposting" value={expense.items.filter((item) => !item.is_posted).length} tone="text-amber-700" />
              <Metric label="Sudah diposting" value={expense.items.filter((item) => item.is_posted).length} tone="text-emerald-700" />
            </div>
          </Section>

          <Section title="Income" description="Pendapatan dalam periode terpilih" href="/income" loading={income.loading} error={income.error} onRetry={() => loadIncome()}>
            <div className="grid grid-cols-2 gap-3">
              <Metric label="Total" value={currency(incomeTotal)} tone="text-emerald-700" />
              <Metric label="Invoice" value={income.items.length} />
              <Metric label="Lunas" value={income.items.filter((item) => item.payment_status?.toLowerCase() === "paid").length} tone="text-emerald-700" />
              <Metric label="Belum lunas" value={income.items.filter((item) => ["due", "partial"].includes(item.payment_status?.toLowerCase())).length} tone="text-amber-700" />
            </div>
          </Section>

          <Section title="Payroll" description="Payroll dan piutang pada periode terpilih" href="/payroll" loading={payroll.loading} error={payroll.error} onRetry={() => loadPayroll()}>
            <div className="grid grid-cols-2 gap-3">
              <Metric label="Karyawan aktif" value={payroll.employees} tone="text-[#0067b8]" />
              <Metric label="Slip mingguan terbit/dibayar" value={countedPayrollSlips.length} />
              <Metric label="Total sebelum potongan" value={currency(payrollTotal)} tone="text-violet-700" />
              <Metric label="Piutang aktif" value={`${activeReceivables.length} · ${currency(receivableTotal)}`} tone="text-red-700" />
            </div>
          </Section>
        </div>
      </div>
    </MobileLayout>
  );
}
