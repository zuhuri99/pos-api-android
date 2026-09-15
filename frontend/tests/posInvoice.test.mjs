import test from "node:test";
import assert from "node:assert/strict";

import { nextPosInvoiceNumber, posInvoicePrefix } from "../src/features/pos/posUtils.js";

test("prefix invoice POS mandiri selalu P", () => {
  assert.equal(posInvoicePrefix("user-apapun"), "P");
});

test("invoice pertama Oktober 2026 memuat kode user", () => {
  assert.equal(nextPosInvoiceNumber([], 1, 2026, 10), "P1020261001");
  assert.equal(nextPosInvoiceNumber([], 2, 2026, 10), "P1020262001");
});

test("urutan invoice dipisahkan per bulan", () => {
  const rows = [
    { invoice_no: "P1020261007" },
    { invoice_no: "P0920261099" },
    { invoice_no: "P1020251042" },
    { invoice_no: "P1020262099" },
  ];
  assert.equal(nextPosInvoiceNumber(rows, 1, 2026, 10), "P1020261008");
});

test("urutan bulanan per user berhenti pada 999", () => {
  assert.throws(() => nextPosInvoiceNumber([{ invoice_no: "P1020261999" }], 1, 2026, 10), /sudah habis/);
});
