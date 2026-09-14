import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import ConfirmModal from "../../../components/ConfirmModal";
import ErrorAlert from "../../../components/ErrorAlert";
import PosLayout from "../../../layouts/PosLayout";
import { scanProductSku } from "../../../platform/native";
import { syncNow } from "../../offline/syncEngine";
import { getActiveAccount } from "../../../utils/auth";
import { posApi } from "../api/posApi";
import { paymentAliasLabel } from "../paymentAliases";
import {
  applyPosStock,
  flattenPosProducts,
  formatPosCurrency,
  getPosApiError,
  indexPosStock,
  localTransactionDate,
} from "../posUtils";

const emptyForm = () => ({
  location_id: "",
  contact_id: "",
  invoice_no: "",
  transaction_date: localTransactionDate(),
  status: "final",
  discount_type: "fixed",
  discount_amount: 0,
  sale_note: "",
  shipping_charges: 0,
  packing_charge: 0,
  products: [],
  payments: [{ amount: 0, method: "cash", note: "", paid_on: localTransactionDate() }],
});

const asNumber = (value) => Math.max(0, Number(value) || 0);

const parseFormattedNumber = (value) => {
  const normalized = String(value ?? "").replace(/\./g, "").replace(",", ".");
  if (normalized === "") return "";
  return normalized.replace(/[^\d.]/g, "");
};

const formatNumberInput = (value) => {
  if (value === "" || value === null || value === undefined) return "";
  const [integer, decimal] = String(value).replace(",", ".").split(".");
  const grouped = (integer || "0").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return decimal === undefined ? grouped : `${grouped},${decimal}`;
};

const contactLabel = (contact) =>
  contact.name ||
  contact.supplier_business_name ||
  `${contact.first_name || ""} ${contact.last_name || ""}`.trim();

const toDateTimeInput = (value) =>
  String(value || "").replace(" ", "T").slice(0, 16);

const fromDateTimeInput = (value) => {
  if (!value) return "";
  const normalized = value.replace("T", " ");
  return normalized.length === 16 ? `${normalized}:00` : normalized;
};

export default function PosTransactionForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const isEdit = Boolean(id);
  const isSuperuser = localStorage.getItem("is_superuser") === "true";
  const username = getActiveAccount()?.user?.username || localStorage.getItem("username") || "";
  const initialSource = searchParams.get("source") || "";

  const [sourceUser, setSourceUser] = useState(initialSource);
  const [user2InvoiceOwner, setUser2InvoiceOwner] = useState(() =>
    ["dewanfloor", "gantung"].includes(username.toLowerCase())
      ? username.toLowerCase()
      : "dewanfloor",
  );
  const [sources, setSources] = useState([]);
  const [locations, setLocations] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [productOptions, setProductOptions] = useState([]);
  const [stockIndex, setStockIndex] = useState({});
  const [loadingStock, setLoadingStock] = useState(false);
  const [productQuery, setProductQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [searchingProducts, setSearchingProducts] = useState(false);
  const [generatingInvoice, setGeneratingInvoice] = useState(!isEdit);
  const [saving, setSaving] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [error, setError] = useState("");
  const [showMore, setShowMore] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const productSearchSequence = useRef(0);
  const transactionPeriod = form.transaction_date?.slice(0, 7) || "";
  const total = useMemo(() => {
    const subtotal = form.products.reduce((sum, line) => {
      const gross = asNumber(line.quantity) * asNumber(line.unit_price);
      const discount = line.discount_type === "percentage"
        ? gross * asNumber(line.discount_amount) / 100
        : asNumber(line.discount_amount);
      return sum + Math.max(0, gross - discount);
    }, 0);
    const transactionDiscount = form.discount_type === "percentage"
      ? subtotal * asNumber(form.discount_amount) / 100
      : asNumber(form.discount_amount);
    return Math.max(
      0,
      subtotal - transactionDiscount + asNumber(form.shipping_charges) + asNumber(form.packing_charge),
    );
  }, [form]);
  const paymentTotal = useMemo(
    () => form.payments.reduce((sum, payment) => sum + asNumber(payment.amount), 0),
    [form.payments],
  );
  const paymentRemaining = Math.max(0, total - paymentTotal);
  const changeReturn = Math.max(0, paymentTotal - total);

  useEffect(() => {
    if (!form.location_id) {
      setStockIndex({});
      setLoadingStock(false);
      return undefined;
    }

    let active = true;
    setLoadingStock(true);
    posApi.stockReport(form.location_id)
      .then((response) => {
        if (!active) return;
        setStockIndex(indexPosStock(
          response.data?.data || [],
          sourceUser,
          form.location_id,
        ));
      })
      .catch((requestError) => {
        if (active) {
          setStockIndex({});
          setError(getPosApiError(requestError, "Gagal mengambil stok produk terbaru."));
        }
      })
      .finally(() => {
        if (active) setLoadingStock(false);
      });

    return () => { active = false; };
  }, [form.location_id, sourceUser]);

  useEffect(() => {
    setForm((current) => {
      if (current.payments.length !== 1) return current;
      return {
        ...current,
        payments: [{ ...current.payments[0], amount: total }],
      };
    });
  }, [total]);

  useEffect(() => {
    if (isEdit) return undefined;
    const period = transactionPeriod;
    if (!/^\d{4}-\d{2}$/.test(period)) {
      setGeneratingInvoice(false);
      return undefined;
    }

    let active = true;
    setForm((current) => ({
      ...current,
      invoice_no: "",
    }));
    setGeneratingInvoice(true);
    posApi.nextInvoice(form.transaction_date)
      .then((invoiceNumber) => {
        if (!active) return;
        setForm((current) => (
          current.transaction_date?.slice(0, 7) === period
            ? { ...current, invoice_no: invoiceNumber }
            : current
        ));
      })
      .catch((requestError) => {
        if (active) {
          setError(
            requestError instanceof RangeError
              ? requestError.message
              : getPosApiError(
                requestError,
                "Nomor invoice otomatis gagal dibuat. Isi nomor invoice secara manual.",
              ),
          );
        }
      })
      .finally(() => {
        if (active) setGeneratingInvoice(false);
      });

    return () => { active = false; };
  }, [form.transaction_date, isEdit, transactionPeriod]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const bootstrap = await posApi.bootstrap(sourceUser || undefined);
        if (!active) return;
        const data = bootstrap.data?.data || {};
        const selectedSource = data.source_user || sourceUser;
        setSourceUser(selectedSource || "");
        setSources(data.available_sources || []);
        setLocations(data.locations || []);
        setPaymentMethods(data.payment_methods || []);
        setForm((current) => ({
          ...current,
          location_id: current.location_id || String(data.locations?.[0]?.id || ""),
          payments: current.payments.map((payment) => ({
            ...payment,
            method: payment.method || data.payment_methods?.[0]?.name || "cash",
          })),
        }));

        const contactResponse = await posApi.contacts({
          source_user: selectedSource || undefined,
          type: "customer",
          per_page: 100,
        });
        if (active) {
          const customerRows = contactResponse.data?.data || [];
          setContacts(customerRows);
          if (!isEdit) {
            const generalCustomer = customerRows.find(
              (contact) => contactLabel(contact).trim().toLowerCase() === "umum",
            );
            if (generalCustomer) {
              setForm((current) => ({
                ...current,
                contact_id: current.contact_id || String(generalCustomer.id),
              }));
            }
          }
        }

        if (isEdit) {
          const transaction = await posApi.transaction(id, selectedSource || undefined);
          if (!active) return;
          const sale = transaction.data?.data;
          if (!sale) throw new Error("Transaksi tidak ditemukan.");
          setForm({
            ...emptyForm(),
            ...sale,
            location_id: String(sale.location_id || ""),
            contact_id: String(sale.contact_id || ""),
            products: (sale.products || []).map((line) => ({
              ...line,
              quantity: Number(line.quantity),
              original_quantity: Number(line.quantity),
              unit_price: Number(line.unit_price),
              discount_amount: Number(line.discount_amount || 0),
            })),
            payments: (sale.payments || []).map((payment) => ({
              ...payment,
              amount: Number(payment.amount),
            })),
          });
        }
      } catch (requestError) {
        if (active) setError(getPosApiError(requestError, "Gagal memuat data POS."));
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, [id, isEdit, refreshKey, sourceUser]);

  const refreshPos = async () => {
    setRefreshing(true);
    setError("");
    try {
      await syncNow();
      setRefreshKey((value) => value + 1);
    } catch (requestError) {
      setError(getPosApiError(requestError, "Data POS gagal diperbarui."));
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const query = productQuery.trim();
    if (loading || loadingStock || !form.location_id || !query) {
      setProductOptions([]);
      setSearchingProducts(false);
      return undefined;
    }

    const sequence = ++productSearchSequence.current;
    const timer = window.setTimeout(async () => {
      setSearchingProducts(true);
      try {
        const commonParams = {
          source_user: sourceUser || undefined,
          location_id: form.location_id,
          per_page: 50,
        };
        const [nameResponse, skuResponse] = await Promise.all([
          posApi.products({ ...commonParams, name: query }),
          posApi.products({ ...commonParams, sku: query }),
        ]);
        if (sequence === productSearchSequence.current) {
          const merged = [
            ...flattenPosProducts(nameResponse.data?.data || [], form.location_id),
            ...flattenPosProducts(skuResponse.data?.data || [], form.location_id),
          ];
          setProductOptions(
            Array.from(
              new Map(merged.map((product) => [product.variation_id, product])).values(),
            ),
          );
        }
      } catch (requestError) {
        if (sequence === productSearchSequence.current) {
          setError(getPosApiError(requestError, "Gagal mencari produk."));
        }
      } finally {
        if (sequence === productSearchSequence.current) setSearchingProducts(false);
      }
    }, 350);

    return () => window.clearTimeout(timer);
  }, [form.location_id, loading, loadingStock, productQuery, sourceUser]);

  const changeSource = (value) => {
    setSourceUser(value);
    setSearchParams(value ? { source: value } : {});
    setContacts([]);
    setProductOptions([]);
    setProductQuery("");
    setForm(emptyForm());
  };

  const addProduct = (product) => {
    const productWithStock = applyPosStock(product, stockIndex);
    const quantityAlreadyAdded = form.products
      .filter((line) => Number(line.variation_id) === Number(product.variation_id))
      .reduce((sum, line) => sum + asNumber(line.quantity), 0);
    const originalQuantity = form.products
      .filter((line) => Number(line.variation_id) === Number(product.variation_id))
      .reduce((sum, line) => sum + asNumber(line.original_quantity), 0);
    if (
      productWithStock.enable_stock === 1 &&
      quantityAlreadyAdded + 1 > productWithStock.stock + originalQuantity
    ) {
      setError(`Stok ${productWithStock.product_name} tidak mencukupi.`);
      return;
    }
    setForm((current) => ({
      ...current,
      products: [
        ...current.products,
        {
          ...productWithStock,
          quantity: 1,
          discount_amount: 0,
          discount_type: "fixed",
          note: "",
        },
      ],
    }));
  };

  const updateProduct = (index, field, value) => {
    setForm((current) => ({
      ...current,
      products: current.products.map((line, position) =>
        position === index ? { ...line, [field]: value } : line,
      ),
    }));
  };

  const removeProduct = (index) => {
    setForm((current) => ({
      ...current,
      products: current.products.filter((_, position) => position !== index),
    }));
  };

  const updatePayment = (index, field, value) => {
    setForm((current) => ({
      ...current,
      payments: current.payments.map((payment, position) =>
        position === index ? { ...payment, [field]: value } : payment,
      ),
    }));
  };

  const addPayment = () => {
    setForm((current) => {
      const paid = current.payments.reduce((sum, payment) => sum + asNumber(payment.amount), 0);
      return {
        ...current,
        payments: [
          ...current.payments,
          {
            amount: Math.max(0, total - paid),
            method: paymentMethods[0]?.name || paymentMethods[0]?.method || "cash",
            note: "",
            paid_on: localTransactionDate(),
          },
        ],
      };
    });
  };

  const removePayment = (index) => {
    setForm((current) => ({
      ...current,
      payments: current.payments.length > 1
        ? current.payments.filter((_, position) => position !== index)
        : current.payments,
    }));
  };

  const resetPos = () => {
    if (!window.confirm("Reset seluruh data yang sedang diisi pada form POS?")) return;
    const generalCustomer = contacts.find(
      (contact) => contactLabel(contact).trim().toLowerCase() === "umum",
    );
    setForm({
      ...emptyForm(),
      location_id: String(locations[0]?.id || ""),
      contact_id: String(generalCustomer?.id || contacts[0]?.id || ""),
    });
    setProductQuery("");
    setProductOptions([]);
    setPaymentOpen(false);
    setShowMore(false);
    setError("");
  };

  const selectProduct = (product) => {
    addProduct(product);
    setProductQuery("");
    setProductOptions([]);
  };

  const scanSku = async () => {
    try {
      const sku = await scanProductSku();
      if (!sku) return;
      setProductQuery(sku);
      setSearchingProducts(true);
      const response = await posApi.products({
        source_user: sourceUser || undefined,
        location_id: form.location_id || undefined,
        sku,
        per_page: 50,
      });
      const results = flattenPosProducts(response.data?.data || [], form.location_id);
      const exact = results.filter(
        (product) => product.sku.toLowerCase() === sku.toLowerCase(),
      );
      if (exact.length === 1) selectProduct(exact[0]);
      else setProductOptions(exact.length ? exact : results);
    } catch (scanError) {
      setError(getPosApiError(scanError, "QR code produk gagal dipindai."));
    } finally {
      setSearchingProducts(false);
    }
  };

  const validate = () => {
    if (!form.location_id) return "Lokasi wajib dipilih.";
    if (!form.contact_id) return "Customer wajib dipilih.";
    if (!form.invoice_no?.trim()) return "Nomor invoice wajib diisi.";
    if (!form.products.length) return "Tambahkan minimal satu produk.";
    if (form.products.some((line) => asNumber(line.quantity) < 0)) {
      return "Quantity produk tidak boleh kurang dari nol.";
    }
    if (form.payments.some((payment) => !payment.method)) {
      return "Metode pembayaran wajib dipilih.";
    }
    const quantities = new Map();
    const originalQuantities = new Map();
    for (const line of form.products) {
      const key = String(line.variation_id);
      originalQuantities.set(
        key,
        (originalQuantities.get(key) || 0) + asNumber(line.original_quantity),
      );
    }
    for (const line of form.products) {
      const lineWithStock = applyPosStock(line, stockIndex);
      const key = String(line.variation_id);
      quantities.set(key, (quantities.get(key) || 0) + asNumber(line.quantity));
      if (
        lineWithStock.enable_stock === 1 &&
        quantities.get(key) > asNumber(lineWithStock.stock) + (originalQuantities.get(key) || 0)
      ) {
        const available = asNumber(lineWithStock.stock) + (originalQuantities.get(key) || 0);
        return `Quantity ${line.product_name} melebihi stok tersedia ${available}.`;
      }
    }
    return "";
  };

  const requestSubmit = (event) => {
    event.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setConfirmOpen(true);
  };

  const submit = async () => {
    setSaving(true);
    setError("");
    try {
      const products = form.products.map((line) => ({
        ...(line.sell_line_id ? { sell_line_id: Number(line.sell_line_id) } : {}),
        product_id: Number(line.product_id),
        variation_id: Number(line.variation_id),
        quantity: asNumber(line.quantity),
        unit_price: asNumber(line.unit_price),
        tax_rate_id: Number(line.tax_rate_id || 0),
        discount_amount: asNumber(line.discount_amount),
        discount_type: line.discount_type || "fixed",
        note: line.note || null,
      }));
      const payments = form.payments.filter((payment) => (
        asNumber(payment.amount) > 0 || payment.payment_id
      )).map((payment) => ({
        ...(payment.payment_id ? { payment_id: Number(payment.payment_id) } : {}),
        amount: asNumber(payment.amount),
        method: payment.method,
        paid_on: payment.paid_on || form.transaction_date,
        account_id: payment.account_id ? Number(payment.account_id) : null,
        note: payment.note || null,
      }));
      const payload = {
        ...(isEdit ? {} : {
          location_id: Number(form.location_id),
          invoice_no: form.invoice_no.trim().toUpperCase(),
        }),
        contact_id: Number(form.contact_id),
        transaction_date: form.transaction_date,
        status: form.status,
        discount_type: form.discount_type,
        discount_amount: asNumber(form.discount_amount),
        sale_note: form.sale_note || null,
        shipping_charges: asNumber(form.shipping_charges),
        packing_charge: asNumber(form.packing_charge),
        change_return: changeReturn,
        products,
        payments,
      };
      const response = isEdit
        ? await posApi.update(id, payload, sourceUser || undefined)
        : await posApi.create(payload, sourceUser || undefined);
      const savedId = response.data?.data?.id || id;
      if (!isEdit) setForm(emptyForm());
      if (savedId) {
        const invoiceParams = new URLSearchParams({ preview: "1" });
        if (!isEdit && form.status !== "draft") invoiceParams.set("autoprint", "1");
        if (sourceUser) invoiceParams.set("source", sourceUser);
        navigate(`/invoice/${savedId}?${invoiceParams.toString()}`);
      } else {
        navigate("/income");
      }
    } catch (requestError) {
      setError(getPosApiError(requestError, "Transaksi gagal disimpan."));
      setConfirmOpen(false);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <PosLayout title={isEdit ? "Edit Transaksi POS" : "Kasir POS"}>
        <div className="flex min-h-72 items-center justify-center">
          <span className="h-9 w-9 animate-spin rounded-full border-4 border-blue-200 border-t-[#0067b8]" />
        </div>
      </PosLayout>
    );
  }

  return (
    <PosLayout title={isEdit ? `Edit Transaksi #${id}` : "Kasir POS"}>
      <form onSubmit={requestSubmit} className="mx-auto w-full min-w-0 max-w-[1600px] overflow-x-clip pb-28 lg:pb-4">
        {error && <div className="fixed inset-x-0 top-4 z-[140] mx-auto w-[calc(100%-2rem)] max-w-lg shadow-2xl"><ErrorAlert message={error} onClose={() => setError("")} /></div>}

        <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.72fr)] xl:grid-cols-[minmax(0,1.65fr)_400px]">
          <section className="min-w-0 space-y-3">
            <div className="relative z-20 min-w-0 rounded-[22px] border border-white/80 bg-white/80 p-3 shadow-sm backdrop-blur-xl sm:p-4">
              <div className="mb-3 flex min-w-0 items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#0067b8]">Detail penjualan</p>
                  <p className="truncate text-xs text-slate-400">Lokasi, nota, waktu dan customer</p>
                </div>
                {!isEdit && <button type="button" onClick={resetPos} className="shrink-0 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-extrabold text-red-700 transition active:scale-95">Reset Data</button>}
              </div>
              <div className="grid min-w-0 grid-cols-2 gap-2.5">
                {isSuperuser && sources.length > 1 && (
                  <label className="min-w-0 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                    Akun POS
                    <select value={sourceUser} onChange={(event) => changeSource(event.target.value)} className="mt-1 h-10 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-2 text-xs font-semibold">
                      {sources.map((source) => <option key={source} value={source}>{source.toUpperCase()}</option>)}
                    </select>
                  </label>
                )}
                {isSuperuser && sourceUser === "user2" && (
                  <label className="min-w-0 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                    Identitas nota
                    <select
                      value={user2InvoiceOwner}
                      onChange={(event) => setUser2InvoiceOwner(event.target.value)}
                      className="mt-1 h-10 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-2 text-xs font-semibold"
                    >
                      <option value="dewanfloor">Dewan Floor · PCS</option>
                      <option value="gantung">Gantung · PBS</option>
                    </select>
                  </label>
                )}
                <label className="min-w-0 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  Lokasi
                  <select disabled={isEdit} value={form.location_id} onChange={(event) => setForm((current) => ({ ...current, location_id: event.target.value, products: [] }))} className="mt-1 h-10 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-2 text-xs font-semibold disabled:bg-slate-100">
                    <option value="">Pilih lokasi</option>
                    {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
                  </select>
                </label>
                <label className="min-w-0 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  Customer
                  <select value={form.contact_id} onChange={(event) => setForm((current) => ({ ...current, contact_id: event.target.value }))} className="mt-1 h-10 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-2 text-xs font-semibold">
                    <option value="">Pilih customer</option>
                    {contacts.map((contact) => <option key={contact.id} value={contact.id}>{contactLabel(contact)}</option>)}
                  </select>
                </label>
                <label className="col-span-2 min-w-0 text-[10px] font-bold uppercase tracking-wide text-slate-500 sm:col-span-1">
                  Nomor invoice
                  <div className="relative mt-1">
                    <input
                      type="text"
                      value={form.invoice_no || ""}
                      readOnly
                      placeholder={generatingInvoice ? "Memeriksa nomor berikutnya…" : "Contoh: P1020260001"}
                      className="h-10 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-2 pr-8 text-xs font-extrabold uppercase outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100 read-only:bg-slate-100"
                      maxLength={11}
                      required
                    />
                    {generatingInvoice && (
                      <span className="absolute right-2.5 top-3 h-4 w-4 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />
                    )}
                  </div>
                </label>
                <label className="col-span-2 min-w-0 text-[10px] font-bold uppercase tracking-wide text-slate-500 sm:col-span-1">
                  Tanggal & jam
                  <input
                    type="datetime-local"
                    value={toDateTimeInput(form.transaction_date)}
                    onChange={(event) => setForm((current) => ({
                      ...current,
                      transaction_date: fromDateTimeInput(event.target.value),
                    }))}
                    className="mt-1 h-10 w-full min-w-0 max-w-full rounded-xl border border-slate-200 bg-white px-2 text-xs font-semibold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                    required
                  />
                </label>
              </div>
            </div>

            <div className="relative z-40 min-w-0 rounded-[22px] border border-white/80 bg-white/80 p-3 shadow-sm backdrop-blur-xl sm:p-4">
              <div className="flex items-center justify-between gap-3">
                <label className="text-xs font-bold text-slate-600" htmlFor="pos-product-search">Cari produk atau SKU</label>
                <button type="button" onClick={refreshPos} disabled={refreshing} className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] font-extrabold text-blue-700 disabled:opacity-50">{refreshing ? "Memperbarui…" : "↻ Refresh"}</button>
              </div>
              <div className="relative mt-1">
                <div className="flex min-w-0 gap-2">
                  <div className="relative min-w-0 flex-1">
                    <input
                      id="pos-product-search"
                      type="search"
                      autoComplete="off"
                      value={productQuery}
                      disabled={!form.location_id || loadingStock}
                      onChange={(event) => setProductQuery(event.target.value)}
                      placeholder={loadingStock ? "Memuat stok terbaru…" : "Ketik nama produk atau SKU…"}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 pr-10 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-100"
                    />
                    {searchingProducts && (
                      <span className="absolute right-4 top-3.5 h-4 w-4 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={!form.location_id || loadingStock}
                    onClick={scanSku}
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-lg transition active:scale-95 disabled:bg-slate-300"
                    aria-label="Pindai QR code SKU"
                  >
                    <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm11 0h2v2h-2v-2Zm3 0h2v3h-2v-3Zm-3 4h3v2h-3v-2Z" />
                    </svg>
                  </button>
                </div>

                {productQuery.trim() && !searchingProducts && (
                  <div className="absolute inset-x-0 top-full z-40 mt-2 max-h-72 overflow-y-auto rounded-2xl border border-white/80 bg-white/95 p-1.5 shadow-[0_18px_45px_rgba(15,23,42,0.22)] backdrop-blur-2xl">
                    {productOptions.length ? productOptions.map((product) => (
                      <button
                        key={product.variation_id}
                        type="button"
                        onClick={() => selectProduct(applyPosStock(product, stockIndex))}
                        className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-blue-50 active:bg-blue-100"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-bold text-slate-800">
                            {product.product_name}{product.variation_name ? ` · ${product.variation_name}` : ""}
                          </span>
                          <span className="block truncate text-[11px] text-slate-500">
                            SKU: {product.sku || "-"}{applyPosStock(product, stockIndex).enable_stock === 1 ? ` · Stok ${applyPosStock(product, stockIndex).stock}` : " · Tanpa batas stok"}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs font-extrabold text-[#0067b8]">
                          {formatPosCurrency(product.unit_price)}
                        </span>
                      </button>
                    )) : (
                      <p className="px-3 py-6 text-center text-xs text-slate-500">
                        Produk tidak ditemukan.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </section>

          <aside className="relative z-10 h-fit min-w-0 rounded-[24px] border border-white/80 bg-white/80 p-3 shadow-[0_18px_50px_rgba(15,23,42,0.10)] backdrop-blur-2xl sm:p-4 lg:sticky lg:top-0">
            <div className="flex items-center justify-between">
              <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Keranjang</p><h2 className="text-lg font-extrabold text-slate-900">{form.products.length} produk</h2></div>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-[#0067b8]">{sourceUser || "POS"}</span>
            </div>

            <div className="mt-4 max-h-[42dvh] space-y-3 overflow-y-auto pr-1 lg:max-h-[48dvh]">
              {form.products.map((line, index) => (
                <article key={`${line.variation_id}-${index}`} className="rounded-2xl border border-slate-200 bg-white p-3">
                  <div className="flex justify-between gap-2"><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-800">{line.product_name}</p><p className="text-[10px] text-slate-400">{line.sku || line.product_sku}{applyPosStock(line, stockIndex).enable_stock === 1 ? ` · Stok ${asNumber(applyPosStock(line, stockIndex).stock)}` : " · Tanpa batas stok"}</p></div><button type="button" onClick={() => removeProduct(index)} className="h-7 w-7 rounded-full bg-red-50 text-red-600">×</button></div>
                  <div className="mt-3 flex min-w-0 items-center justify-between gap-2">
                    <div className="flex shrink-0 items-center rounded-xl bg-slate-100 p-1"><button type="button" onClick={() => updateProduct(index, "quantity", Math.max(0, asNumber(line.quantity) - 1))} className="h-8 w-8 rounded-lg bg-white font-bold shadow-sm">−</button><input type="number" min="0" step="0.001" value={line.quantity} onFocus={(event) => event.target.select()} onChange={(event) => updateProduct(index, "quantity", event.target.value)} className="w-12 min-w-0 bg-transparent text-center text-sm font-bold outline-none" /><button type="button" onClick={() => updateProduct(index, "quantity", asNumber(line.quantity) + 1)} className="h-8 w-8 rounded-lg bg-white font-bold shadow-sm">+</button></div>
                    <input type="text" inputMode="decimal" value={formatNumberInput(line.unit_price)} onFocus={(event) => event.target.select()} onChange={(event) => updateProduct(index, "unit_price", parseFormattedNumber(event.target.value))} className="min-w-0 flex-1 rounded-xl border border-slate-200 px-2 py-2 text-right text-xs font-bold" aria-label={`Harga ${line.product_name}`} />
                  </div>
                  <input
                    type="text"
                    value={line.note || ""}
                    onChange={(event) => updateProduct(index, "note", event.target.value)}
                    placeholder="Catatan produk (sell_line_note)"
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none focus:border-blue-300 focus:bg-white"
                  />
                  <p className="mt-2 text-right text-sm font-extrabold text-slate-800">{formatPosCurrency(asNumber(line.quantity) * asNumber(line.unit_price))}</p>
                </article>
              ))}
              {!form.products.length && <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-400">Pilih produk untuk mulai transaksi.</div>}
            </div>

            <button type="button" onClick={() => setShowMore((value) => !value)} className="mt-4 w-full rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600">{showMore ? "Sembunyikan opsi" : "Diskon & catatan"}</button>
            {showMore && <div className="mt-3 grid grid-cols-2 gap-2 rounded-2xl bg-slate-50 p-3"><select value={form.discount_type} onChange={(event) => setForm((current) => ({ ...current, discount_type: event.target.value }))} className="min-w-0 rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs"><option value="fixed">Diskon nominal</option><option value="percentage">Diskon persen</option></select><input type="text" inputMode="decimal" value={formatNumberInput(form.discount_amount)} onFocus={(event) => event.target.select()} onChange={(event) => setForm((current) => ({ ...current, discount_amount: parseFormattedNumber(event.target.value) }))} className="min-w-0 rounded-xl border border-slate-200 px-2 py-2 text-xs" placeholder="Diskon" /><textarea value={form.sale_note || ""} onChange={(event) => setForm((current) => ({ ...current, sale_note: event.target.value }))} className="col-span-2 rounded-xl border border-slate-200 px-3 py-2 text-xs" rows="2" placeholder="Catatan transaksi" /></div>}

            <div className="mt-4 min-w-0 rounded-2xl bg-slate-950 p-3 text-white shadow-xl sm:p-4">
              <div className="flex min-w-0 items-end justify-between gap-2"><span className="shrink-0 text-xs text-slate-300">Total</span><strong className="min-w-0 truncate text-xl sm:text-2xl">{formatPosCurrency(total)}</strong></div>

              <button type="button" onClick={() => setPaymentOpen(true)} className="mt-3 flex w-full min-w-0 items-center justify-between gap-2 rounded-xl border border-white/15 bg-white/10 px-3 py-3 text-left transition hover:bg-white/15">
                <span className="min-w-0"><span className="block text-[10px] font-extrabold uppercase tracking-[0.14em] text-blue-200">Edit / Tambah Pembayaran</span><span className="block truncate text-xs text-slate-300">{form.payments.length} metode · ketuk untuk mengatur</span></span>
                <span className="shrink-0 text-lg text-white">›</span>
              </button>
              <div className="mt-2 grid grid-cols-2 gap-2 rounded-xl bg-white/[0.06] p-2 text-[10px]">
                <div><span className="block text-slate-400">Terbayar</span><strong className="text-xs text-white">{formatPosCurrency(paymentTotal)}</strong></div>
                <div className="text-right"><span className="block text-slate-400">{changeReturn > 0 ? "Kembalian" : "Sisa"}</span><strong className={changeReturn > 0 ? "text-xs text-emerald-300" : paymentRemaining > 0 ? "text-xs text-amber-300" : "text-xs text-emerald-300"}>{formatPosCurrency(changeReturn || paymentRemaining)}</strong></div>
              </div>

              <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))} className="mt-2 h-10 w-full min-w-0 rounded-xl border border-white/15 bg-white/10 px-3 text-xs font-bold text-white"><option className="text-slate-900" value="final">Transaksi final</option><option className="text-slate-900" value="draft">Simpan draft</option></select>
              <button type="submit" disabled={saving || generatingInvoice || !form.products.length || !form.invoice_no?.trim()} className="mt-3 w-full rounded-2xl bg-gradient-to-b from-[#2699ee] to-[#0067b8] px-4 py-3.5 text-sm font-extrabold shadow-[0_10px_25px_rgba(0,103,184,0.35),inset_0_1px_1px_rgba(255,255,255,0.45)] transition active:scale-[0.98] disabled:opacity-50">{generatingInvoice ? "Memeriksa Nomor Invoice…" : form.status === "draft" ? (isEdit ? "Simpan Perubahan Draft" : "Simpan Draft") : isEdit ? "Simpan Perubahan" : "Bayar & Simpan"}</button>
            </div>
          </aside>
        </div>
      </form>

      {paymentOpen && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setPaymentOpen(false); }}>
          <section className="flex max-h-[88dvh] w-full min-w-0 flex-col overflow-hidden rounded-t-[28px] bg-white shadow-2xl sm:max-w-lg sm:rounded-[28px]">
            <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div><p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#0067b8]">Pembayaran</p><h2 className="text-lg font-black text-slate-900">{formatPosCurrency(total)}</h2></div>
              <button type="button" onClick={() => setPaymentOpen(false)} className="h-9 w-9 rounded-full bg-slate-100 text-xl font-bold text-slate-500">×</button>
            </header>

            <div className="min-w-0 flex-1 space-y-3 overflow-y-auto p-4">
              {form.payments.map((payment, index) => (
                <div key={payment.payment_id || index} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-2 flex items-center justify-between"><span className="text-[10px] font-extrabold uppercase tracking-wide text-slate-400">Pembayaran {index + 1}</span><button type="button" onClick={() => removePayment(index)} disabled={form.payments.length === 1} className="rounded-lg bg-red-50 px-2 py-1 text-[10px] font-bold text-red-600 disabled:opacity-30">Hapus</button></div>
                  <div className="grid min-w-0 grid-cols-2 gap-2">
                    <label className="min-w-0 text-[10px] font-bold text-slate-500">Metode
                      <select value={payment.method || "cash"} onChange={(event) => updatePayment(index, "method", event.target.value)} className="mt-1 h-11 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-2 text-xs font-bold text-slate-800">
                        <option value="cash">{paymentAliasLabel(sourceUser, "cash", "Cash")}</option>
                        {paymentMethods.filter((method) => (method.name || method.method) !== "cash").map((method) => { const name = method.name || method.method; return <option key={name} value={name}>{paymentAliasLabel(sourceUser, name, method.label || name)}</option>; })}
                      </select>
                    </label>
                    <label className="min-w-0 text-[10px] font-bold text-slate-500">Jumlah
                      <input type="text" inputMode="decimal" value={formatNumberInput(payment.amount)} onFocus={(event) => event.target.select()} onChange={(event) => updatePayment(index, "amount", parseFormattedNumber(event.target.value))} className="mt-1 h-11 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-2 text-right text-xs font-extrabold text-slate-900 outline-none focus:border-blue-400" />
                    </label>
                    <label className="col-span-2 min-w-0 text-[10px] font-bold text-slate-500">Tanggal & waktu pembayaran
                      <input type="datetime-local" value={toDateTimeInput(payment.paid_on || form.transaction_date)} onChange={(event) => updatePayment(index, "paid_on", fromDateTimeInput(event.target.value))} className="mt-1 h-11 w-full min-w-0 max-w-full rounded-xl border border-slate-200 bg-white px-2 text-xs font-bold text-slate-800 outline-none focus:border-blue-400" />
                    </label>
                  </div>
                </div>
              ))}

              <div className="grid min-w-0 grid-cols-2 gap-2">
                <button type="button" onClick={addPayment} className="min-w-0 rounded-2xl border border-blue-200 bg-blue-50 px-3 py-3 text-xs font-extrabold text-blue-700">+ Metode lain</button>
                <button type="button" disabled title="QRIS sementara belum tersedia" className="min-w-0 cursor-not-allowed rounded-2xl bg-slate-300 px-3 py-3 text-xs font-extrabold text-slate-500">Bayar QRIS · Segera hadir</button>
              </div>
            </div>

            <footer className="border-t border-slate-200 bg-white p-4">
              <div className="mb-3 grid grid-cols-3 gap-2 rounded-2xl bg-slate-950 p-3 text-[10px] text-white">
                <div><span className="block text-slate-400">Total</span><strong>{formatPosCurrency(total)}</strong></div>
                <div className="text-center"><span className="block text-slate-400">Terbayar</span><strong>{formatPosCurrency(paymentTotal)}</strong></div>
                <div className="text-right"><span className="block text-slate-400">{changeReturn > 0 ? "Kembalian" : "Sisa"}</span><strong className={paymentRemaining > 0 ? "text-amber-300" : "text-emerald-300"}>{formatPosCurrency(changeReturn || paymentRemaining)}</strong></div>
              </div>
              <button type="button" onClick={() => setPaymentOpen(false)} className="w-full rounded-2xl bg-[#0067b8] px-4 py-3 text-sm font-extrabold text-white">Selesai</button>
            </footer>
          </section>
        </div>
      )}

      <ConfirmModal open={confirmOpen} onClose={() => !saving && setConfirmOpen(false)} onConfirm={submit} busy={saving} title={form.status === "draft" ? "Simpan sebagai draft?" : isEdit ? "Simpan perubahan transaksi?" : "Buat transaksi POS?"} message={form.status === "draft" ? `${form.products.length} produk dengan total ${formatPosCurrency(total)} akan disimpan sebagai transaksi sementara dan belum final.` : `${form.products.length} produk dengan total ${formatPosCurrency(total)} akan ${isEdit ? "diperbarui" : "disimpan dan masuk antrean sinkronisasi"}.`} warning={!isEdit && form.status !== "draft" ? "HARAP PASTIKAN NOTA BENAR!" : ""} confirmLabel={form.status === "draft" ? "Simpan Draft" : isEdit ? "Simpan" : "Buat Transaksi"} confirmClassName="bg-[#0067b8] text-white" />
    </PosLayout>
  );
}
