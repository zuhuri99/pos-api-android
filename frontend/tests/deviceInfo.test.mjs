import test from "node:test";
import assert from "node:assert/strict";
import { parseBrowserDevice } from "../src/platform/deviceInfo.js";

test("identifies Chrome and Windows from a browser user agent", () => {
  const info = parseBrowserDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36");
  assert.equal(info.device_type, "web");
  assert.equal(info.platform, "Windows");
  assert.equal(info.os_version, "10.0");
  assert.equal(info.browser, "Google Chrome 140.0.0.0");
});

test("identifies Safari and iOS from a browser user agent", () => {
  const info = parseBrowserDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Version/18.6 Mobile/15E148 Safari/604.1");
  assert.equal(info.platform, "iOS");
  assert.equal(info.os_version, "18.6");
  assert.equal(info.browser, "Safari 18.6");
});
