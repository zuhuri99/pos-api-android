import test from "node:test";
import assert from "node:assert/strict";

import { nextPosInvoiceNumber, posInvoicePrefix } from "../src/features/pos/posUtils.js";

test("prefix invoice POS mandiri selalu P", () => {
  assert.equal(posInvoicePrefix("user-apapun"), "P");
});

test("invoice pertama Oktober 2026 adalah P1020260001", () => {
  assert.equal(nextPosInvoiceNumber([], "P", 2026, 10), "P1020260001");
});

test("urutan invoice dipisahkan per bulan", () => {
  const rows = [
    { invoice_no: "P1020260007" },
    { invoice_no: "P0920260099" },
    { invoice_no: "P1020250042" },
  ];
  assert.equal(nextPosInvoiceNumber(rows, "P", 2026, 10), "P1020260008");
});

test("urutan bulanan berhenti pada 9999", () => {
  assert.throws(() => nextPosInvoiceNumber([{ invoice_no: "P1020269999" }], "P", 2026, 10), /sudah habis/);
});

