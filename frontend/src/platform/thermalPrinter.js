import { FinanceNative, isNative } from "./native";

export const DEFAULT_THERMAL_SETTINGS = {
  mode: "lan",
  lanHost: "192.168.2.124",
  lanPort: 9100,
  paperWidth: 80,
  bluetoothAddress: "",
  bluetoothName: "",
  autoPrint: false,
  autoOpenDrawer: false,
  drawerPin: 0,
  feedLines: 6,
  feedLinesWithoutQr: 3,
  cutPaper: true,
};

const requireNative = () => {
  if (!isNative) throw new Error("Printer thermal langsung hanya tersedia di APK Android.");
};

export async function getThermalPrinterSettings() {
  if (!isNative) return DEFAULT_THERMAL_SETTINGS;
  return {
    ...DEFAULT_THERMAL_SETTINGS,
    ...await FinanceNative.getPrinterSettings(),
  };
}

export async function saveThermalPrinterSettings(settings) {
  requireNative();
  return FinanceNative.savePrinterSettings(settings);
}

export async function listPairedBluetoothPrinters() {
  requireNative();
  const result = await FinanceNative.listBluetoothPrinters();
  return result.devices || [];
}

export async function testThermalPrinter() {
  requireNative();
  return FinanceNative.testThermalPrinter();
}

export async function printThermalCanvas(canvas) {
  requireNative();
  if (!canvas) throw new Error("Tampilan nota belum siap dicetak.");
  return FinanceNative.printThermal({ data: canvas.toDataURL("image/png") });
}

export async function printThermalReceipt(receipt) {
  requireNative();
  if (!receipt) throw new Error("Data nota belum siap dicetak.");
  return FinanceNative.printThermalReceipt({ receipt });
}

export async function openCashDrawer() {
  requireNative();
  return FinanceNative.openCashDrawer();
}
