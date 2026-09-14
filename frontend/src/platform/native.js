import { Capacitor, registerPlugin } from "@capacitor/core";
export const isNative = Capacitor.isNativePlatform();
export const serverSetupEnabled = isNative || import.meta.env?.VITE_REQUIRE_SERVER_SETUP === "true";
export const FinanceNative = registerPlugin("FinanceNative");
export const MOBILE_AUTH_CALLBACK = "id.pos.mobile://auth/callback";

export function buildSsoLoginUrl(apiBase, native = isNative) {
  const url = new URL(`${String(apiBase).replace(/\/+$/, "")}/auth/sso/login/`);
  if (native) url.searchParams.set("app_redirect_uri", MOBILE_AUTH_CALLBACK);
  return url.href;
}

export async function takeReceiptPhoto() {
  const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
  const photo = await Camera.getPhoto({ quality: 90, width: 2400, height: 2400, resultType: CameraResultType.Uri, source: CameraSource.Camera, correctOrientation: true });
  const blob = await (await fetch(photo.webPath)).blob();
  return new File([blob], `nota-${Date.now()}.${photo.format || "jpeg"}`, { type: blob.type || "image/jpeg" });
}

export async function scanPayrollCode() {
  const { CapacitorBarcodeScanner, CapacitorBarcodeScannerTypeHint } = await import("@capacitor/barcode-scanner");
  const result = await CapacitorBarcodeScanner.scanBarcode({ hint: CapacitorBarcodeScannerTypeHint.QR_CODE, scanInstructions: "Arahkan kamera ke QR slip payroll", scanText: "Pindai", android: { scanningLibrary: "zxing" } });
  return result.ScanResult;
}

export async function scanProductSku() {
  const { CapacitorBarcodeScanner, CapacitorBarcodeScannerTypeHint } = await import("@capacitor/barcode-scanner");
  const result = await CapacitorBarcodeScanner.scanBarcode({
    hint: CapacitorBarcodeScannerTypeHint.QR_CODE,
    scanInstructions: "Arahkan kamera ke QR code SKU produk",
    scanText: "Pindai SKU",
    android: { scanningLibrary: "zxing" },
    web: { showCameraSelection: true, scannerFPS: 15 },
  });
  return String(result.ScanResult || "").trim();
}

export async function scanDeviceLoginCode() {
  const { CapacitorBarcodeScanner, CapacitorBarcodeScannerTypeHint } = await import("@capacitor/barcode-scanner");
  const result = await CapacitorBarcodeScanner.scanBarcode({
    hint: CapacitorBarcodeScannerTypeHint.QR_CODE,
    scanInstructions: "Pindai QR login pada perangkat baru",
    scanText: "Pindai Login",
    android: { scanningLibrary: "zxing" },
    web: { showCameraSelection: true, scannerFPS: 15 },
  });
  return String(result.ScanResult || "").trim();
}

export async function scanLoginOfferCode() {
  const { CapacitorBarcodeScanner, CapacitorBarcodeScannerTypeHint } = await import("@capacitor/barcode-scanner");
  const result = await CapacitorBarcodeScanner.scanBarcode({
    hint: CapacitorBarcodeScannerTypeHint.QR_CODE,
    scanInstructions: "Pindai QR dari perangkat yang sudah login",
    scanText: "Pindai Login",
    android: { scanningLibrary: "zxing" },
    web: { showCameraSelection: true, scannerFPS: 15 },
  });
  return String(result.ScanResult || "").trim();
}

export async function openExternal(url) {
  const parsed = new URL(url);
  if (!["https:", "http:"].includes(parsed.protocol)) throw new Error("Alamat tidak didukung.");
  if (isNative) {
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url: parsed.href });
  } else window.location.assign(parsed.href);
}
