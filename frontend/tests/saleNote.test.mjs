import assert from "node:assert/strict";
import test from "node:test";

import { getSaleNote } from "../src/utils/saleNote.js";

test("menggunakan sale_note sebagai catatan utama", () => {
  assert.equal(
    getSaleNote({
      sale_note: "Kirim sore hari",
      additional_notes: "catatan lama",
      staff_note: "catatan staf lama",
    }),
    "Kirim sore hari",
  );
});

test("mendukung field lama untuk transaksi historis", () => {
  assert.equal(
    getSaleNote({
      additional_notes: "Catatan tambahan",
      staff_note: "Catatan staf",
    }),
    "Catatan tambahan | Catatan staf",
  );
});

test("merapikan spasi dan mengembalikan string kosong bila tidak ada catatan", () => {
  assert.equal(getSaleNote({ sale_note: "  Ambil sendiri  " }), "Ambil sendiri");
  assert.equal(getSaleNote({}), "");
});
