import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

test("Android menggunakan identitas aplikasi POS mandiri", () => {
  const capacitor = JSON.parse(readFileSync(resolve(root, "capacitor.config.json"), "utf8"));
  const gradle = readFileSync(resolve(root, "android/app/build.gradle"), "utf8");
  assert.equal(capacitor.appId, "id.pos.mobile");
  assert.equal(capacitor.appName, "ASAS POS");
  assert.match(gradle, /applicationId "id\.pos\.mobile"/);
});
