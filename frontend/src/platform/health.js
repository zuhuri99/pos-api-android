import { Capacitor, CapacitorHttp } from "@capacitor/core";

export const healthTransport = {
  isNative: () => Capacitor.isNativePlatform(),
  get: (options) => CapacitorHttp.get(options),
};

export async function probeHealth(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    let status, data;
    if (healthTransport.isNative()) {
      const response = await healthTransport.get({ url, headers: { Accept: "application/json" }, connectTimeout: 8000, readTimeout: 8000, responseType: "text" });
      status = response.status;
      data = response.data;
    } else {
      const response = await fetch(url, { cache: "no-store", credentials: "omit", signal: controller.signal, headers: { Accept: "application/json" } });
      status = response.status;
      data = await response.text();
    }
    if (typeof data === "string") {
      try { data = JSON.parse(data); } catch { data = null; }
    }
    if (status < 200 || status >= 300) {
      const reason = data?.cloudflare_error ? "Akses diblokir Cloudflare. Administrator perlu mengizinkan akses aplikasi." : "Periksa akses endpoint pada server.";
      return { ok: false, url, status, message: `HTTP ${status}. ${reason}` };
    }
    if (data?.status !== "ok") return { ok: false, url, status, message: "Respons health check tidak sesuai (diharapkan status: ok). Periksa jalur endpoint." };
    return { ok: true, url, status, message: "Terhubung" };
  } catch (error) {
    const detail = String(error?.message || "");
    const message = /resolve|unknownhost|name.*not.*resolved|dns/i.test(detail) ? "Nama domain tidak ditemukan oleh DNS." :
      /ssl|certificate|certpath|handshake/i.test(detail) ? "Sertifikat HTTPS tidak dapat diverifikasi." :
      error?.name === "AbortError" || /timeout|timed out/i.test(detail) ? "Koneksi melewati batas waktu." :
      "Tidak dapat menghubungi server. Periksa DNS, jaringan, sertifikat HTTPS, atau izin CORS jika memakai browser.";
    return { ok: false, url, message };
  } finally { clearTimeout(timer); }
}

export async function selectHealthyEndpoint(endpoints, probe = probeHealth) {
  const checks = [];
  for (const endpoint of endpoints) {
    const result = await probe(endpoint.healthUrl);
    checks.push(result);
    if (result.ok) return { endpoint, checks };
  }
  return { endpoint: null, checks };
}
