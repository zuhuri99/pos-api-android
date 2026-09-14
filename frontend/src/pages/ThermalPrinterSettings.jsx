import { useEffect, useState } from "react";

import PosLayout from "../layouts/PosLayout";
import { isNative } from "../platform/native";
import {
  DEFAULT_THERMAL_SETTINGS,
  getThermalPrinterSettings,
  listPairedBluetoothPrinters,
  saveThermalPrinterSettings,
  testThermalPrinter,
} from "../platform/thermalPrinter";

const inputClass = "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-100";

export default function ThermalPrinterSettings() {
  const [form, setForm] = useState(DEFAULT_THERMAL_SETTINGS);
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(isNative);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    getThermalPrinterSettings()
      .then((settings) => { if (active) setForm(settings); })
      .catch((requestError) => { if (active) setError(requestError.message || "Pengaturan printer gagal dimuat."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const change = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const loadBluetooth = async () => {
    setBusy("bluetooth"); setError(""); setMessage("");
    try {
      const rows = await listPairedBluetoothPrinters();
      setDevices(rows);
      if (!rows.length) setMessage("Belum ada perangkat Bluetooth yang dipasangkan melalui pengaturan Android.");
    } catch (requestError) { setError(requestError.message || "Perangkat Bluetooth gagal dibaca."); }
    finally { setBusy(""); }
  };

  const save = async () => {
    setBusy("save"); setError(""); setMessage("");
    try {
      const saved = await saveThermalPrinterSettings({
        ...form,
        lanPort: Number(form.lanPort),
        paperWidth: Number(form.paperWidth),
        feedLines: Number(form.feedLines),
        feedLinesWithoutQr: Number(form.feedLinesWithoutQr),
      });
      setForm((current) => ({ ...current, ...saved }));
      setMessage("Pengaturan printer berhasil disimpan.");
    } catch (requestError) { setError(requestError.message || "Pengaturan printer gagal disimpan."); }
    finally { setBusy(""); }
  };

  const test = async () => {
    setBusy("test"); setError(""); setMessage("");
    try {
      await saveThermalPrinterSettings({
        ...form,
        lanPort: Number(form.lanPort),
        paperWidth: Number(form.paperWidth),
        feedLines: Number(form.feedLines),
        feedLinesWithoutQr: Number(form.feedLinesWithoutQr),
      });
      await testThermalPrinter();
      setMessage("Tes cetak berhasil dikirim ke printer.");
    } catch (requestError) { setError(requestError.message || "Tes cetak gagal."); }
    finally { setBusy(""); }
  };

  return (
    <PosLayout title="Printer Thermal">
      <div className="mx-auto max-w-2xl space-y-4 pb-24">
        {!isNative && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Pengaturan printer langsung hanya aktif di APK Android.</div>}
        {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
        {message && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{message}</div>}

        <section className="rounded-[26px] border border-white/80 bg-white/80 p-5 shadow-sm backdrop-blur-xl">
          <h2 className="text-lg font-extrabold text-slate-900">Koneksi printer</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">Printer harus mendukung perintah ESC/POS. Bluetooth menggunakan perangkat Classic/SPP yang sudah dipasangkan.</p>

          <fieldset disabled={!isNative || loading || Boolean(busy)} className="mt-5 space-y-4">
            <label className="block text-xs font-bold text-slate-600">Jenis koneksi
              <select value={form.mode} onChange={(event) => change("mode", event.target.value)} className={inputClass}>
                <option value="lan">LAN / Wi-Fi TCP</option>
                <option value="bluetooth">Bluetooth Classic</option>
              </select>
            </label>

            {form.mode === "lan" ? (
              <div className="grid grid-cols-[1fr_110px] gap-3">
                <label className="text-xs font-bold text-slate-600">Alamat IP
                  <input value={form.lanHost} onChange={(event) => change("lanHost", event.target.value)} className={inputClass} inputMode="decimal" placeholder="192.168.2.124" />
                </label>
                <label className="text-xs font-bold text-slate-600">Port
                  <input type="number" min="1" max="65535" value={form.lanPort} onChange={(event) => change("lanPort", event.target.value)} className={inputClass} />
                </label>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-bold text-slate-600">Printer terpasang
                  <select value={form.bluetoothAddress} onChange={(event) => {
                    const selected = devices.find((device) => device.address === event.target.value);
                    setForm((current) => ({ ...current, bluetoothAddress: event.target.value, bluetoothName: selected?.name || "" }));
                  }} className={inputClass}>
                    <option value={form.bluetoothAddress || ""}>{form.bluetoothAddress ? `${form.bluetoothName || "Printer"} · ${form.bluetoothAddress}` : "Pilih printer Bluetooth"}</option>
                    {devices.map((device) => <option key={device.address} value={device.address}>{device.name} · {device.address}</option>)}
                  </select>
                </label>
                <button type="button" onClick={loadBluetooth} className="mt-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700">{busy === "bluetooth" ? "Memuat…" : "Muat perangkat terpasang"}</button>
              </div>
            )}

            <label className="block text-xs font-bold text-slate-600">Lebar kertas
              <select value={form.paperWidth} onChange={(event) => change("paperWidth", Number(event.target.value))} className={inputClass}>
                <option value={80}>80 mm</option>
                <option value={58}>58 mm</option>
              </select>
            </label>

            <label className="flex items-center justify-between gap-4 rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-700">
              Cetak otomatis setelah transaksi
              <input type="checkbox" checked={form.autoPrint} onChange={(event) => change("autoPrint", event.target.checked)} className="h-5 w-5 accent-blue-600" />
            </label>
            <label className="flex items-center justify-between gap-4 rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-700">
              Buka laci otomatis setelah transaksi
              <input type="checkbox" checked={form.autoOpenDrawer} onChange={(event) => change("autoOpenDrawer", event.target.checked)} className="h-5 w-5 shrink-0 accent-blue-600" />
            </label>
            <label className="block text-xs font-bold text-slate-600">Konektor laci
              <select value={form.drawerPin} onChange={(event) => change("drawerPin", Number(event.target.value))} className={inputClass}>
                <option value={0}>Pin 2 (umum)</option>
                <option value={1}>Pin 5</option>
              </select>
              <span className="mt-1 block font-normal leading-5 text-slate-400">Laci harus terhubung ke port DK printer thermal.</span>
            </label>
            <label className="block text-xs font-bold text-slate-600">Feed kertas setelah nota
              <input type="number" min="0" max="20" step="1" value={form.feedLines} onChange={(event) => change("feedLines", Number(event.target.value))} className={inputClass} />
              <span className="mt-1 block font-normal leading-5 text-slate-400">Digunakan untuk nota dengan QR Code. Gunakan 6–8 jika hasil Bluetooth masih terpotong.</span>
            </label>
            <label className="block text-xs font-bold text-slate-600">Feed kertas untuk nota tanpa QR
              <input type="number" min="0" max="20" step="1" value={form.feedLinesWithoutQr} onChange={(event) => change("feedLinesWithoutQr", Number(event.target.value))} className={inputClass} />
              <span className="mt-1 block font-normal leading-5 text-slate-400">Berlaku untuk LAN dengan atau tanpa auto-cutter serta Bluetooth. Nilai awal 3 agar lebih hemat kertas.</span>
            </label>
            <label className="flex items-center justify-between gap-4 rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-700">
              Potong kertas otomatis
              <input type="checkbox" checked={form.cutPaper} onChange={(event) => change("cutPaper", event.target.checked)} className="h-5 w-5 accent-blue-600" />
            </label>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button type="button" onClick={test} className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-extrabold text-blue-700">{busy === "test" ? "Mencetak…" : "Tes Cetak"}</button>
              <button type="button" onClick={save} className="rounded-2xl bg-gradient-to-b from-[#2699ee] to-[#0067b8] px-4 py-3 text-sm font-extrabold text-white shadow-lg">{busy === "save" ? "Menyimpan…" : "Simpan"}</button>
            </div>
          </fieldset>
        </section>
      </div>
    </PosLayout>
  );
}
