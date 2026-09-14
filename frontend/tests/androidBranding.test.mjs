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

test("penyimpanan offline memakai kontrak SQLiteConnection v8", () => {
  const localStore = readFileSync(resolve(root, "src/features/offline/localStore.js"), "utf8");
  assert.doesNotMatch(localStore, /db\.(?:execute|run|query)\(\s*\{/);
  assert.match(localStore, /db\.execute\(`\s*CREATE TABLE IF NOT EXISTS meta/);
  assert.match(localStore, /sqlite\.checkConnectionsConsistency\(\)/);
  assert.match(localStore, /db\.isDBOpen\(\)/);
  assert.match(localStore, /db\.run\("INSERT OR REPLACE INTO meta\(key,value\) VALUES \(\?,\?\)", \[key, String\(value\)\]\)/);
  assert.match(localStore, /db\.query\("SELECT value FROM meta WHERE key=\?", \[key\]\)/);
  assert.match(localStore, /db\.run\("UPDATE invoice_numbers SET used=1[^\n]+\[invoice\], false\)/);
});
