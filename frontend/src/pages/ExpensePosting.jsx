import { useEffect, useMemo, useState } from "react";
import api from "../api/axios";
import MobileLayout from "../layouts/MobileLayout";
import ErrorAlert from "../components/ErrorAlert";

/* ===============================
   HELPER
   =============================== */

const rupiah = (n) =>
  Number(n).toLocaleString("id-ID");

const monthLabel = (ym) => {
  const [y, m] = ym.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString("id-ID", {
    month: "long",
    year: "numeric",
  });
};

export default function ExpensePosting() {
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState({});
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);

  // STATE UNTUK CUSTOM POPUP
  const [alertInfo, setAlertInfo] = useState({ show: false, message: "" });
  const [confirmInfo, setConfirmInfo] = useState({ show: false, message: "" });

  /* ===============================
     LOAD DATA
     =============================== */
  const loadData = async () => {
    setLoading(true);
    setError(null);

    try {
      let page = 1;
      let all = [];

      while (true) {
        const res = await api.get("/expenses/", {
          params: { page },
        });

        all = all.concat(res.data.results || []);

        if (!res.data.next) break;
        page++;
      }

      // frontend filter
      const unposted = all.filter(i => i.is_posted === false);

      setItems(unposted);
      setSelected({});
    } catch (err) {
      console.error(err);
      setError("Gagal memuat data expense");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  /* ===============================
     GROUP PER BULAN
     =============================== */
  const grouped = useMemo(() => {
    const map = {};
    items.forEach((i) => {
      const ym = i.date.slice(0, 7); // YYYY-MM
      if (!map[ym]) map[ym] = [];
      map[ym].push(i);
    });
    return Object.entries(map).sort((a, b) =>
      b[0].localeCompare(a[0])
    );
  }, [items]);

  /* ===============================
     SELECT HANDLER
     =============================== */
  const toggle = (id) => {
    setSelected((p) => ({ ...p, [id]: !p[id] }));
  };

  const selectAll = () => {
    const all = {};
    items.forEach((i) => (all[i.id] = true));
    setSelected(all);
  };

  const unselectAll = () => {
    setSelected({});
  };

  const selectedItems = items.filter(
    (i) => selected[i.id]
  );

  /* ===============================
     PREVIEW JURNAL
     =============================== */
  const preview = useMemo(() => {
    const total = selectedItems.reduce(
      (s, i) => s + Number(i.amount),
      0
    );

    return {
      count: selectedItems.length,
      total,
    };
  }, [selectedItems]);

  /* ===============================
     POSTING MASSAL LOGIC
     =============================== */
  // 1. Tombol Posting diklik (Memunculkan Konfirmasi)
  const handlePostClick = () => {
    if (selectedItems.length === 0) {
      setAlertInfo({ show: true, message: "Pilih minimal satu transaksi untuk diposting." });
      return;
    }
    setConfirmInfo({ show: true, message: `Anda yakin ingin memposting ${selectedItems.length} transaksi?` });
  };

  // 2. Eksekusi Posting (Jika user klik "Ya" di popup konfirmasi)
  const executePosting = async () => {
    setConfirmInfo({ show: false, message: "" }); // Tutup konfirmasi
    setPosting(true);
    setProgress(0);
    setError(null);

    try {
      for (let i = 0; i < selectedItems.length; i++) {
        const item = selectedItems[i];

        await api.patch(`/expenses/${item.id}/`, {
          is_posted: true,
        });

        setProgress(
          Math.round(((i + 1) / selectedItems.length) * 100)
        );
      }

      setAlertInfo({ show: true, message: "Posting berhasil diselesaikan." });
      loadData();
    } catch (err) {
      console.error(err);
      setError("Terjadi kesalahan saat posting");
    } finally {
      setPosting(false);
    }
  };

  /* ===============================
     RENDER
     =============================== */
  return (
    <MobileLayout title="Posting Expense">
      <ErrorAlert message={error} onClose={() => setError(null)} />

      {/* POPUP ALERT */}
      {alertInfo.show && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white border border-gray-200 w-full max-w-sm shadow-lg p-5">
            <h3 className="font-semibold text-gray-800 mb-2">Informasi</h3>
            <p className="text-sm text-gray-600 mb-5">{alertInfo.message}</p>
            <div className="flex justify-end">
              <button
                onClick={() => setAlertInfo({ show: false, message: "" })}
                className="bg-[#0067b8] text-white px-6 py-1.5 text-sm font-semibold hover:bg-blue-800 transition-colors"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* POPUP CONFIRMATION */}
      {confirmInfo.show && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white border border-gray-200 w-full max-w-sm shadow-lg p-5">
            <h3 className="font-semibold text-gray-800 mb-2">Konfirmasi Posting</h3>
            <p className="text-sm text-gray-600 mb-5">{confirmInfo.message}</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmInfo({ show: false, message: "" })}
                className="bg-gray-100 text-gray-700 border border-gray-300 px-4 py-1.5 text-sm font-semibold hover:bg-gray-200 transition-colors"
              >
                Batal
              </button>
              <button
                onClick={executePosting}
                className="bg-[#0067b8] text-white px-4 py-1.5 text-sm font-semibold hover:bg-blue-800 transition-colors"
              >
                Ya, Posting
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ACTION BAR */}
      <div className="bg-white p-3 border border-gray-200 mb-4 flex justify-between text-sm">
        <div>
          Dipilih: <strong>{selectedItems.length}</strong>
        </div>
        <div className="flex gap-3">
          <button
            onClick={selectAll}
            className="text-[#0067b8] font-semibold"
          >
            Select All
          </button>
          <button
            onClick={unselectAll}
            className="text-gray-500"
          >
            Clear
          </button>
        </div>
      </div>

      {/* PREVIEW JURNAL */}
      {selectedItems.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 p-4 mb-4">
          <div className="font-semibold text-[#0067b8] text-sm mb-1">
            Preview Jurnal
          </div>
          <div className="text-sm">
            Total transaksi:{" "}
            <strong>{preview.count}</strong>
          </div>
          <div className="text-sm">
            Total nilai:{" "}
            <strong>
              Rp {rupiah(preview.total)}
            </strong>
          </div>
        </div>
      )}

      {/* LOADING */}
      {loading && (
        <div className="text-center text-sm text-gray-500">
          Memuat data...
        </div>
      )}

      {/* LIST PER BULAN */}
      {grouped.map(([ym, rows]) => (
        <div key={ym} className="mb-4 bg-white border border-gray-200">
          <div className="font-semibold text-sm p-3 bg-gray-50 border-b border-gray-200">
            {monthLabel(ym)}
          </div>

          {rows.map((item, index) => (
            <div
              key={item.id}
              className={`p-3 flex gap-3 ${index !== rows.length - 1 ? 'border-b border-gray-100' : ''}`}
            >
              <input
                type="checkbox"
                checked={!!selected[item.id]}
                onChange={() => toggle(item.id)}
                className="mt-1"
              />

              <div className="flex-1">
                <div className="flex justify-between">
                  <div className="font-mono text-sm font-semibold">
                    {item.transaction_code}
                  </div>
                  <div className="font-bold">
                    Rp {rupiah(item.amount)}
                  </div>
                </div>

                <div className="text-xs text-gray-600">
                  {item.date} • {item.category}
                </div>

                {item.detail && (
                  <div className="text-sm text-gray-700 mt-1">
                    {item.detail}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ))}

      {items.length === 0 && !loading && (
        <div className="text-center text-gray-500 text-sm mt-10">
          Tidak ada expense yang belum diposting
        </div>
      )}

      {/* POSTING BAR */}
      {items.length > 0 && (
        <div className="fixed bottom-[72px] lg:bottom-8 left-1/2 lg:left-[calc(50%+8rem)] -translate-x-1/2 w-full max-w-md md:max-w-6xl lg:max-w-[calc(100%-18rem)] px-4 lg:px-8 z-20 pointer-events-none">
          <div className="bg-white border border-gray-200 p-3 space-y-2 pointer-events-auto">
            {posting && (
              <div className="w-full bg-gray-200 h-2">
                <div
                  className="bg-[#0067b8] h-2 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}

            <button
              onClick={handlePostClick}
              disabled={posting}
              className="w-full bg-[#0067b8] text-white py-2 font-semibold disabled:opacity-50 hover:bg-blue-800 transition-colors"
            >
              {posting
                ? `Posting ${progress}%`
                : "POSTING"}
            </button>
          </div>
        </div>
      )}
      
      {/* Spacer agar konten terbawah tidak tertutup posting bar */}
      {items.length > 0 && <div className="h-24"></div>}
    </MobileLayout>
  );
}
