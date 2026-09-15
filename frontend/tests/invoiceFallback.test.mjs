import assert from "node:assert/strict";
import test from "node:test";

import { resolveNextInvoiceNumber } from "../src/features/pos/invoiceNumber.js";

test("API mati saat Android online tetap menggunakan nomor invoice lokal", async () => {
  let localCalls = 0;
  const result = await resolveNextInvoiceNumber({
    transactionDate: "2026-10-14 10:00:00",
    userCode: 1,
    online: true,
    refreshRemote: async () => { throw new Error("API offline"); },
    peekLocal: async (date, userCode) => {
      localCalls += 1;
      assert.equal(date, "2026-10-14 10:00:00");
      assert.equal(userCode, 1);
      return "P1020261008";
    },
  });

  assert.equal(result, "P1020261008");
  assert.equal(localCalls, 1);
});

test("Android offline tidak mencoba menghubungi API", async () => {
  let remoteCalls = 0;
  const result = await resolveNextInvoiceNumber({
    transactionDate: "2026-10-14 10:00:00",
    userCode: 2,
    online: false,
    refreshRemote: async () => { remoteCalls += 1; },
    peekLocal: async () => "P1020262003",
  });

  assert.equal(result, "P1020262003");
  assert.equal(remoteCalls, 0);
});

test("counter server disegarkan lebih dahulu ketika API tersedia", async () => {
  const order = [];
  const result = await resolveNextInvoiceNumber({
    transactionDate: "2026-10-14 10:00:00",
    userCode: 1,
    online: true,
    refreshRemote: async () => { order.push("remote"); },
    peekLocal: async () => { order.push("local"); return "P1020261012"; },
  });

  assert.equal(result, "P1020261012");
  assert.deepEqual(order, ["remote", "local"]);
});
