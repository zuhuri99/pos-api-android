import { isNative, MOBILE_AUTH_CALLBACK } from "./native";
import { readServerProfile } from "../config/serverProfile";

export async function initializeNativeLinks() {
  if (!isNative) return;
  const { App } = await import("@capacitor/app");
  const handleUrl = async ({ url }) => {
    if (!readServerProfile()?.ssoEnabled) return;
    const parsed = new URL(url);
    const expected = new URL(MOBILE_AUTH_CALLBACK);
    if (
      parsed.protocol !== expected.protocol ||
      parsed.host !== expected.host ||
      parsed.pathname !== expected.pathname
    ) return;
    const code = parsed.searchParams.get("sso_code");
    const error = parsed.searchParams.get("sso_error");
    if (!code && !error) return;
    const callbackKey = `finance.sso.callback:${readServerProfile().serverUrl}`;
    if (sessionStorage.getItem(callbackKey) === parsed.href) return;
    sessionStorage.setItem(callbackKey, parsed.href);
    const { Browser } = await import("@capacitor/browser");
    await Browser.close().catch(() => {});
    const params = new URLSearchParams();
    if (code) params.set("sso_code", code);
    else params.set("sso_error", error);
    window.location.replace(`/login?${params}`);
  };
  await App.addListener("appUrlOpen", handleUrl);
  const launch = await App.getLaunchUrl();
  if (launch) await handleUrl(launch);
}
