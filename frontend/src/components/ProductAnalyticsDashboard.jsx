import { useEffect, useMemo, useRef, useState } from "react";
import * as echarts from "echarts/core";
import { BarChart, LineChart, PieChart, TreemapChart } from "echarts/charts";
import {
  AriaComponent,
  GridComponent,
  LegendComponent,
  ToolboxComponent,
  TooltipComponent,
} from "echarts/components";
import { SVGRenderer } from "echarts/renderers";

echarts.use([
  AriaComponent,
  BarChart,
  GridComponent,
  LegendComponent,
  LineChart,
  PieChart,
  ToolboxComponent,
  TooltipComponent,
  TreemapChart,
  SVGRenderer,
]);

const numberFormatter = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });
const compactFormatter = new Intl.NumberFormat("id-ID", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const METRICS = {
  quantity: {
    label: "Quantity terjual",
    axisLabel: "Qty",
    color: "#0067b8",
    getValue: (product) => Number(product.total_qty) || 0,
    format: (value) => `${numberFormatter.format(value)} item`,
    compact: (value) => compactFormatter.format(value),
  },
  revenue: {
    label: "Estimasi pendapatan",
    axisLabel: "Pendapatan",
    color: "#0f766e",
    getValue: (product) => Number(product.total_revenue) || 0,
    format: (value) => `Rp ${numberFormatter.format(value)}`,
    compact: (value) => `Rp ${compactFormatter.format(value)}`,
  },
  average: {
    label: "Harga rata-rata",
    axisLabel: "Harga rata-rata",
    color: "#7c3aed",
    getValue: (product) => {
      const quantity = Number(product.total_qty) || 0;
      return quantity > 0 ? (Number(product.total_revenue) || 0) / quantity : 0;
    },
    format: (value) => `Rp ${numberFormatter.format(value)}`,
    compact: (value) => `Rp ${compactFormatter.format(value)}`,
  },
};

const CHART_TYPES = [
  { value: "horizontal_bar", label: "Batang horizontal" },
  { value: "vertical_bar", label: "Batang vertikal" },
  { value: "line", label: "Garis" },
  { value: "donut", label: "Donat" },
  { value: "treemap", label: "Treemap" },
];

const truncate = (value, length = 24) => {
  const text = String(value || "-");
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
};

function ProductChart({ data, metricKey, type, showLabels, onSelect }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const metric = METRICS[metricKey];

  const option = useMemo(() => {
    const names = data.map((product) => product.name);
    const values = data.map((product) => metric.getValue(product));
    const shared = {
      animationDuration: 450,
      animationDurationUpdate: 300,
      color: [metric.color, "#38bdf8", "#14b8a6", "#8b5cf6", "#f59e0b", "#ef4444"],
      aria: { enabled: true, decal: { show: true } },
      toolbox: {
        right: 4,
        top: 0,
        feature: {
          restore: { title: "Atur ulang" },
          saveAsImage: { title: "Unduh grafik", name: `top-products-${metricKey}`, pixelRatio: 2 },
        },
        iconStyle: { borderColor: "#64748b" },
      },
      tooltip: {
        trigger: "item",
        confine: true,
        backgroundColor: "rgba(15, 23, 42, 0.96)",
        borderWidth: 0,
        textStyle: { color: "#fff", fontSize: 12 },
        formatter: (params) => {
          const product = data[params.dataIndex];
          if (!product) return "";
          return [
            `<strong>${product.name}</strong>`,
            `<span style="color:#94a3b8">SKU ${product.sku}</span>`,
            `${metric.label}: <strong>${metric.format(metric.getValue(product))}</strong>`,
            `Qty: ${numberFormatter.format(product.total_qty)}`,
            `Pendapatan: Rp ${numberFormatter.format(product.total_revenue)}`,
          ].join("<br/>");
        },
      },
    };

    if (type === "donut") {
      return {
        ...shared,
        legend: { type: "scroll", bottom: 0, textStyle: { color: "#475569", fontSize: 11 } },
        series: [{
          name: metric.label,
          type: "pie",
          radius: ["42%", "70%"],
          center: ["50%", "45%"],
          avoidLabelOverlap: true,
          itemStyle: { borderColor: "#fff", borderWidth: 3, borderRadius: 5 },
          label: { show: showLabels, formatter: ({ name, value }) => `${truncate(name, 18)}\n${metric.compact(value)}`, fontSize: 10 },
          emphasis: { scaleSize: 8, label: { show: true, fontWeight: 700 } },
          data: data.map((product) => ({ name: product.name, value: metric.getValue(product) })),
        }],
      };
    }

    if (type === "treemap") {
      return {
        ...shared,
        series: [{
          type: "treemap",
          roam: false,
          nodeClick: false,
          breadcrumb: { show: false },
          top: 35,
          bottom: 5,
          label: {
            show: showLabels,
            formatter: ({ name, value }) => `${truncate(name, 20)}\n${metric.compact(value)}`,
            color: "#fff",
            fontWeight: 700,
            lineHeight: 17,
          },
          upperLabel: { show: false },
          itemStyle: { borderColor: "#fff", borderWidth: 3, gapWidth: 2 },
          levels: [{ colorSaturation: [0.35, 0.8], itemStyle: { borderWidth: 0, gapWidth: 3 } }],
          data: data.map((product) => ({ name: product.name, value: metric.getValue(product) })),
        }],
      };
    }

    const horizontal = type === "horizontal_bar";
    const chartData = horizontal ? [...data].reverse() : data;
    const categoryData = horizontal ? [...names].reverse() : names;
    const valueData = horizontal ? [...values].reverse() : values;
    const seriesType = type === "line" ? "line" : "bar";
    const categoryAxis = {
      type: "category",
      data: categoryData,
      axisLine: { lineStyle: { color: "#cbd5e1" } },
      axisTick: { show: false },
      axisLabel: {
        color: "#475569",
        fontSize: 10,
        formatter: (value) => truncate(value, horizontal ? 25 : 16),
        ...(horizontal ? {} : { rotate: categoryData.length > 8 ? 30 : 0 }),
      },
    };
    const valueAxis = {
      type: "value",
      name: metric.axisLabel,
      nameTextStyle: { color: "#64748b", fontSize: 10 },
      splitLine: { lineStyle: { color: "#e2e8f0", type: "dashed" } },
      axisLabel: { color: "#64748b", fontSize: 10, formatter: metric.compact },
    };

    return {
      ...shared,
      grid: {
        top: 48,
        right: horizontal && showLabels ? 78 : 28,
        bottom: horizontal ? 20 : categoryData.length > 8 ? 75 : 45,
        left: horizontal ? 150 : 60,
        containLabel: false,
      },
      xAxis: horizontal ? valueAxis : categoryAxis,
      yAxis: horizontal ? categoryAxis : valueAxis,
      series: [{
        name: metric.label,
        type: seriesType,
        data: valueData,
        smooth: type === "line" ? 0.28 : false,
        symbolSize: type === "line" ? 8 : undefined,
        lineStyle: type === "line" ? { width: 3, color: metric.color } : undefined,
        areaStyle: type === "line" ? { opacity: 0.08, color: metric.color } : undefined,
        itemStyle: { color: metric.color, borderRadius: type === "line" ? 10 : horizontal ? [0, 6, 6, 0] : [6, 6, 0, 0] },
        label: {
          show: showLabels,
          position: horizontal ? "right" : "top",
          color: "#334155",
          fontSize: 10,
          fontWeight: 700,
          formatter: ({ value }) => metric.compact(value),
        },
      }],
      __chartData: chartData,
    };
  }, [data, metric, metricKey, showLabels, type]);

  useEffect(() => {
    if (!containerRef.current) return undefined;
    const chart = echarts.init(containerRef.current, null, { renderer: "svg" });
    chartRef.current = chart;
    const resizeObserver = new ResizeObserver(() => chart.resize());
    resizeObserver.observe(containerRef.current);
    return () => {
      resizeObserver.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const { __chartData, ...echartsOption } = option;
    chart.setOption(echartsOption, { notMerge: true });
    chart.off("click");
    chart.on("click", (params) => {
      const source = __chartData || data;
      const product = source[params.dataIndex];
      if (product) onSelect(product);
    });
  }, [data, onSelect, option]);

  const height = type === "horizontal_bar" ? Math.min(900, Math.max(420, data.length * 38 + 90)) : 470;
  return <div ref={containerRef} style={{ height }} className="w-full" role="img" aria-label={`Grafik ${metric.label}`} />;
}

function KpiCard({ label, value, detail, accent }) {
  return (
    <article className="relative min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <span className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: accent }} />
      <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <p className="mt-2 truncate text-xl font-black tracking-tight text-slate-900 sm:text-2xl">{value}</p>
      <p className="mt-1 truncate text-xs text-slate-500">{detail}</p>
    </article>
  );
}

export default function ProductAnalyticsDashboard({ products, totalItemsSold, totalRevenue, loading, dateRange }) {
  const [chartType, setChartType] = useState("horizontal_bar");
  const [metricKey, setMetricKey] = useState("quantity");
  const [limit, setLimit] = useState(10);
  const [direction, setDirection] = useState("desc");
  const [showLabels, setShowLabels] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const metric = METRICS[metricKey];

  const chartData = useMemo(() => {
    const sorted = [...products].sort((a, b) => {
      const difference = metric.getValue(b) - metric.getValue(a);
      return direction === "desc" ? difference : -difference;
    });
    return limit === "all" ? sorted.slice(0, 50) : sorted.slice(0, Number(limit));
  }, [direction, limit, metric, products]);

  const activeSelectedProduct = selectedProduct && products.some((item) => item.sku === selectedProduct.sku)
    ? selectedProduct
    : null;
  const averagePrice = totalItemsSold > 0 ? totalRevenue / totalItemsSold : 0;
  const periodLabel = dateRange?.start_date && dateRange?.end_date
    ? `${new Date(`${dateRange.start_date}T00:00:00`).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })} – ${new Date(`${dateRange.end_date}T00:00:00`).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}`
    : "Semua periode";

  return (
    <section className="mb-5 space-y-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiCard label="Quantity terjual" value={numberFormatter.format(totalItemsSold)} detail="Akumulasi unit" accent="#0067b8" />
        <KpiCard label="Estimasi pendapatan" value={`Rp ${compactFormatter.format(totalRevenue)}`} detail={`Rp ${numberFormatter.format(totalRevenue)}`} accent="#0f766e" />
        <KpiCard label="Produk unik" value={numberFormatter.format(products.length)} detail="Berdasarkan SKU" accent="#7c3aed" />
        <KpiCard label="Harga rata-rata" value={`Rp ${compactFormatter.format(averagePrice)}`} detail="Pendapatan per unit" accent="#d97706" />
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_16px_45px_rgba(15,23,42,0.08)]">
        <header className="border-b border-slate-100 bg-gradient-to-r from-slate-950 via-slate-900 to-[#003f70] px-4 py-4 text-white sm:px-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-sky-300">Visual Analytics</p>
              <h2 className="mt-1 text-lg font-black">Performa Produk</h2>
              <p className="mt-1 text-xs text-slate-300">{periodLabel} · {products.length} SKU ditemukan</p>
            </div>
            <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[10px] font-bold text-sky-100 backdrop-blur">INTERAKTIF</span>
          </div>
        </header>

        <div className="grid gap-3 border-b border-slate-100 bg-slate-50/80 p-4 sm:grid-cols-2 xl:grid-cols-5">
          <label className="block xl:col-span-2">
            <span className="mb-1 block text-[10px] font-extrabold uppercase tracking-wide text-slate-500">Jenis grafik</span>
            <select value={chartType} onChange={(event) => setChartType(event.target.value)} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-none focus:border-blue-400">
              {CHART_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] font-extrabold uppercase tracking-wide text-slate-500">Metrik</span>
            <select value={metricKey} onChange={(event) => setMetricKey(event.target.value)} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-none focus:border-blue-400">
              {Object.entries(METRICS).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] font-extrabold uppercase tracking-wide text-slate-500">Jumlah produk</span>
            <select value={limit} onChange={(event) => setLimit(event.target.value === "all" ? "all" : Number(event.target.value))} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-none focus:border-blue-400">
              <option value={5}>Top 5</option><option value={10}>Top 10</option><option value={20}>Top 20</option><option value={30}>Top 30</option><option value="all">Semua (maks. 50)</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] font-extrabold uppercase tracking-wide text-slate-500">Urutan</span>
            <select value={direction} onChange={(event) => setDirection(event.target.value)} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-none focus:border-blue-400">
              <option value="desc">Tertinggi dahulu</option><option value="asc">Terendah dahulu</option>
            </select>
          </label>
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 sm:col-span-2 xl:col-span-5 xl:w-fit">
            <input type="checkbox" checked={showLabels} onChange={(event) => setShowLabels(event.target.checked)} className="h-4 w-4 accent-blue-600" />
            <span className="text-xs font-bold text-slate-600">Tampilkan label nilai</span>
          </label>
        </div>

        <div className="relative min-h-[420px] p-2 sm:p-4">
          {loading ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 backdrop-blur-sm"><div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-100 border-t-[#0067b8]" /></div>
          ) : chartData.length ? (
            <ProductChart data={chartData} metricKey={metricKey} type={chartType} showLabels={showLabels} onSelect={setSelectedProduct} />
          ) : (
            <div className="flex h-[420px] items-center justify-center text-sm font-semibold text-slate-400">Tidak ada data untuk divisualisasikan.</div>
          )}
        </div>

        {activeSelectedProduct && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-blue-100 bg-blue-50/70 px-4 py-3 text-xs sm:px-5">
            <div className="min-w-0"><strong className="block truncate text-sm text-slate-900">{activeSelectedProduct.name}</strong><span className="font-mono text-[#0067b8]">{activeSelectedProduct.sku}</span></div>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-slate-600"><span>Qty <strong className="text-slate-900">{numberFormatter.format(activeSelectedProduct.total_qty)}</strong></span><span>Pendapatan <strong className="text-slate-900">Rp {numberFormatter.format(activeSelectedProduct.total_revenue)}</strong></span></div>
            <button type="button" onClick={() => setSelectedProduct(null)} className="font-bold text-blue-700">Tutup</button>
          </div>
        )}
      </div>
    </section>
  );
}
