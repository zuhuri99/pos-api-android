import { isNative } from "./native.js";

const BROWSER_DEVICE_ID_KEY = "pos.device.installation.v1";
const firstMatch = (value, pattern) => value.match(pattern)?.[1]?.replaceAll("_", ".") || "";

const browserInstallationId = () => {
  let identifier = localStorage.getItem(BROWSER_DEVICE_ID_KEY);
  if (identifier) return identifier;
  identifier = globalThis.crypto?.randomUUID?.()
    || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  localStorage.setItem(BROWSER_DEVICE_ID_KEY, identifier);
  return identifier;
};

export function parseBrowserDevice(userAgent = "", platformHint = "") {
  const ua = String(userAgent);
  let browser = "Browser tidak dikenal";
  if (/EdgA?\//.test(ua)) browser = `Microsoft Edge ${firstMatch(ua, /EdgA?\/([\d.]+)/)}`;
  else if (/SamsungBrowser\//.test(ua)) browser = `Samsung Internet ${firstMatch(ua, /SamsungBrowser\/([\d.]+)/)}`;
  else if (/CriOS\//.test(ua)) browser = `Google Chrome ${firstMatch(ua, /CriOS\/([\d.]+)/)}`;
  else if (/Chrome\//.test(ua)) browser = `Google Chrome ${firstMatch(ua, /Chrome\/([\d.]+)/)}`;
  else if (/FxiOS\//.test(ua)) browser = `Mozilla Firefox ${firstMatch(ua, /FxiOS\/([\d.]+)/)}`;
  else if (/Firefox\//.test(ua)) browser = `Mozilla Firefox ${firstMatch(ua, /Firefox\/([\d.]+)/)}`;
  else if (/Version\//.test(ua) && /Safari\//.test(ua)) browser = `Safari ${firstMatch(ua, /Version\/([\d.]+)/)}`;

  let platform = platformHint || "Sistem operasi tidak dikenal";
  let osVersion = "";
  if (/Android\s/i.test(ua)) {
    platform = "Android";
    osVersion = firstMatch(ua, /Android\s([\d.]+)/i);
  } else if (/(iPhone|iPad|iPod)/.test(ua)) {
    platform = /iPad/.test(ua) ? "iPadOS" : "iOS";
    osVersion = firstMatch(ua, /OS\s([\d_]+)/);
  } else if (/Windows NT/.test(ua)) {
    platform = "Windows";
    osVersion = firstMatch(ua, /Windows NT\s([\d.]+)/);
  } else if (/Mac OS X/.test(ua)) {
    platform = "macOS";
    osVersion = firstMatch(ua, /Mac OS X\s([\d_]+)/);
  } else if (/CrOS/.test(ua)) {
    platform = "ChromeOS";
    osVersion = firstMatch(ua, /CrOS\s\S+\s([\d.]+)/);
  } else if (/Linux/.test(ua)) {
    platform = "Linux";
  }

  return {
    device_type: "web",
    device_name: `${browser} · ${platform}`,
    platform,
    os_version: osVersion,
    browser: browser.trim(),
  };
}

export async function getLoginDeviceInfo() {
  if (!isNative) {
    return {
      ...parseBrowserDevice(navigator.userAgent, navigator.userAgentData?.platform || navigator.platform),
      device_id: browserInstallationId(),
    };
  }

  try {
    const [{ Device }, { App }] = await Promise.all([
      import("@capacitor/device"),
      import("@capacitor/app"),
    ]);
    const [device, identifier, application] = await Promise.all([
      Device.getInfo(),
      Device.getId(),
      App.getInfo(),
    ]);
    const manufacturer = device.manufacturer && device.manufacturer !== "unknown" ? device.manufacturer : "";
    const model = device.model && device.model !== "unknown" ? device.model : "Perangkat Android";

    return {
      device_type: "android",
      device_name: [manufacturer, model].filter(Boolean).join(" "),
      device_id: identifier.identifier,
      platform: "Android",
      os_version: device.osVersion || "",
      browser: "POS Android",
      app_version: application.version || "",
    };
  } catch {
    return {
      device_type: "android",
      device_name: "Perangkat Android",
      platform: "Android",
      os_version: "",
      browser: "POS Android",
      app_version: "",
    };
  }
}
