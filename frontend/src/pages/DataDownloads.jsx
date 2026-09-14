import { downloadUrl as triggerDownload, saveBlob } from "../platform/files";
import { useEffect, useMemo, useState } from "react";
import MobileLayout from "../layouts/MobileLayout";
import api from "../api/axios";

function filenameFromDisposition(value, fallback) {
  if (!value) return fallback;
  const utf8Match = value.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return fallback;
    }
  }
  const basicMatch = value.match(/filename="?([^";]+)"?/i);
  return basicMatch?.[1] || fallback;
}

async function errorMessage(error, fallback) {
  const payload = error.response?.data;
  if (payload instanceof Blob) {
    try {
      const parsed = JSON.parse(await payload.text());
      return parsed.detail || parsed.message || fallback;
    } catch {
      return fallback;
    }
  }
  return payload?.detail || payload?.message || fallback;
}

function DownloadIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" />
    </svg>
  );
}

export default function DataDownloads() {
  const [overview, setOverview] = useState(null);
  const [selectedBackup, setSelectedBackup] = useState("");
  const [selectedUser, setSelectedUser] = useState("");
  const [selectedYear, setSelectedYear] = useState("all");
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;

    const loadOverview = async () => {
      try {
        const response = await api.get("/downloads/");
        if (!active) return;
        const data = response.data;
        setOverview(data);
        setSelectedBackup(data.database_backups?.[0]?.name || "");
        setSelectedUser(
          data.is_superuser ? "all" : String(data.receipt_users?.[0]?.id || ""),
        );
      } catch (requestError) {
        if (active) setError(await errorMessage(requestError, "Daftar unduhan gagal dimuat."));
      } finally {
        if (active) setLoading(false);
      }
    };

    loadOverview();
    return () => {
      active = false;
    };
  }, []);

  const selectedReceiptUser = useMemo(
    () => overview?.receipt_users?.find((user) => String(user.id) === selectedUser),
    [overview, selectedUser],
  );
  const availableReceiptYears = useMemo(
    () => selectedUser === "all"
      ? overview?.receipt_years || []
      : selectedReceiptUser?.years || [],
    [overview, selectedReceiptUser, selectedUser],
  );

  const downloadDatabase = async () => {
    if (!selectedBackup || downloading) return;
    setError("");
    setNotice("");
    setDownloading("database");
    try {
      const response = await api.post("/downloads/database/", { name: selectedBackup });
      await triggerDownload(response.data.url, response.data.name);
      setNotice(`Unduhan ${response.data.name} dimulai. Tautan hanya berlaku sementara.`);
    } catch (requestError) {
      setError(await errorMessage(requestError, "Backup database gagal diunduh."));
    } finally {
      setDownloading("");
    }
  };

  const downloadReceipts = async () => {
    if (!selectedUser || downloading) return;
    setError("");
    setNotice("");
    setDownloading("receipts");
    try {
      const response = await api.get("/downloads/receipts/", {
        params: {
          user_id: selectedUser,
          ...(selectedYear !== "all" ? { year: selectedYear } : {}),
        },
        responseType: "blob",
        timeout: 0,
      });
      const fallback = `bukti-transaksi-${selectedReceiptUser?.username || "semua-user"}-${selectedYear === "all" ? "semua-tahun" : selectedYear}.zip`;
      const filename = filenameFromDisposition(
        response.headers["content-disposition"],
        fallback,
      );

      await saveBlob(response.data, filename);
      setNotice(`Arsip ${filename} berhasil dibuat dan mulai diunduh.`);
    } catch (requestError) {
      setError(await errorMessage(requestError, "Arsip bukti transaksi gagal dibuat."));
    } finally {
      setDownloading("");
    }
  };

  return (
    <MobileLayout title="Unduh Data">
      <div className="mx-auto max-w-4xl space-y-5">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h1 className="text-xl font-bold text-gray-900">Backup & Arsip Data</h1>
          <p className="mt-1 text-sm leading-6 text-gray-600">
            Unduhan dibuat saat diminta dan tidak disimpan di perangkat sampai Anda menyetujuinya.
          </p>
        </div>

        {error && (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
        {notice && (
          <div role="status" className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            {notice}
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
            Memuat daftar data...
          </div>
        ) : (
          <>
            {overview?.is_superuser && (
              <section className="rounded-2xl border border-amber-200 bg-white p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6c0-1.1 3.58-2 8-2s8 .9 8 2-3.58 2-8 2-8-.9-8-2Zm0 0v6c0 1.1 3.58 2 8 2s8-.9 8-2V6M4 12v6c0 1.1 3.58 2 8 2s8-.9 8-2v-6" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="font-bold text-gray-900">Backup database</h2>
                    <p className="mt-1 text-sm leading-5 text-gray-600">
                      Khusus superuser. File berasal dari backup private yang sudah tersimpan di object storage.
                    </p>
                  </div>
                </div>

                {overview.database_backups?.length ? (
                  <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                    <select
                      value={selectedBackup}
                      onChange={(event) => setSelectedBackup(event.target.value)}
                      className="min-w-0 flex-1 rounded-xl border border-gray-300 bg-white px-3 py-3 text-sm text-gray-800 outline-none focus:border-[#0067b8] focus:ring-2 focus:ring-blue-100"
                    >
                      {overview.database_backups.map((backup) => (
                        <option key={backup.name} value={backup.name}>{backup.name}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={downloadDatabase}
                      disabled={Boolean(downloading)}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <DownloadIcon />
                      {downloading === "database" ? "Menyiapkan..." : "Unduh Database"}
                    </button>
                  </div>
                ) : (
                  <p className={`mt-5 rounded-xl px-4 py-3 text-sm ${overview.database_backup_error ? "border border-red-200 bg-red-50 text-red-700" : "bg-gray-50 text-gray-600"}`}>
                    {overview.database_backup_error || "Belum ada backup database di object storage."}
                  </p>
                )}
              </section>
            )}

            <section className="rounded-2xl border border-blue-200 bg-white p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-[#0067b8]">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 5h16v14H4V5Zm3 10 3-3 2 2 3-4 3 5M8 9h.01" />
                  </svg>
                </div>
                <div>
                  <h2 className="font-bold text-gray-900">Foto bukti transaksi</h2>
                  <p className="mt-1 text-sm leading-5 text-gray-600">
                    {overview?.is_superuser
                      ? "Pilih satu user atau semua user. File akan dikelompokkan per user dalam ZIP."
                      : "Anda hanya dapat mengunduh foto yang terkait dengan transaksi milik akun ini."}
                  </p>
                </div>
              </div>

              {overview?.receipt_users?.some((user) => user.receipt_count > 0) ? (
                <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                  {overview.is_superuser ? (
                    <select
                      value={selectedUser}
                      onChange={(event) => {
                        setSelectedUser(event.target.value);
                        setSelectedYear("all");
                      }}
                      className="min-w-0 flex-1 rounded-xl border border-gray-300 bg-white px-3 py-3 text-sm text-gray-800 outline-none focus:border-[#0067b8] focus:ring-2 focus:ring-blue-100"
                    >
                      <option value="all">Semua user</option>
                      {overview.receipt_users.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.username} ({user.receipt_count} foto)
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
                      {overview.receipt_users[0]?.username} ({overview.receipt_users[0]?.receipt_count || 0} foto)
                    </div>
                  )}
                  <select
                    value={selectedYear}
                    onChange={(event) => setSelectedYear(event.target.value)}
                    className="min-w-0 flex-1 rounded-xl border border-gray-300 bg-white px-3 py-3 text-sm text-gray-800 outline-none focus:border-[#0067b8] focus:ring-2 focus:ring-blue-100 sm:max-w-52"
                  >
                    <option value="all">Semua tahun</option>
                    {availableReceiptYears.map((item) => (
                      <option key={item.year} value={item.year}>
                        {item.year} ({item.receipt_count} foto)
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={downloadReceipts}
                    disabled={Boolean(downloading)}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0067b8] px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-[#005a9e] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <DownloadIcon />
                    {downloading === "receipts" ? "Membuat ZIP..." : "Unduh Foto"}
                  </button>
                </div>
              ) : (
                <p className="mt-5 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">
                  Belum ada foto bukti transaksi yang dapat diunduh.
                </p>
              )}
            </section>

            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-xs leading-5 text-gray-500">
              ZIP menyertakan <code>manifest.csv</code> berisi hubungan file dengan user, tanggal, dan transaksi. Jangan membagikan backup kepada pihak yang tidak berwenang.
            </div>
          </>
        )}
      </div>
    </MobileLayout>
  );
}
