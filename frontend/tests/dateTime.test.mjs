import test from "node:test";
import assert from "node:assert/strict";

import { formatWibDateTime, parseWibDateTime, wibYearMonth } from "../src/utils/dateTime.js";

test("timestamp UTC dan waktu tanpa zona ditampilkan konsisten dalam WIB", () => {
  const fromUtc = formatWibDateTime("2026-09-15T03:30:00Z");
  const assumedWib = formatWibDateTime("2026-09-15 10:30:00");

  assert.match(fromUtc, /15 Sep 2026/);
  assert.match(fromUtc, /10[.:]30/);
  assert.match(fromUtc, /WIB|GMT\+7/);
  assert.equal(assumedWib, fromUtc);
  assert.equal(parseWibDateTime("2026-09-15 10:30:00").toISOString(), "2026-09-15T03:30:00.000Z");
  assert.deepEqual(wibYearMonth("2026-09-30T17:30:00Z"), { year: 2026, month: 10 });
});
