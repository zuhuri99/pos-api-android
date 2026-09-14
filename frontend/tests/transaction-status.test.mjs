import assert from "node:assert/strict";
import test from "node:test";

import {
  isDraftTransaction,
  normalizedTransactionStatus,
  transactionStatusLabel,
} from "../src/features/pos/transactionStatus.js";

test("normalizes missing transaction status as final", () => {
  assert.equal(normalizedTransactionStatus(undefined), "final");
  assert.equal(transactionStatusLabel(undefined), "FINAL");
});

test("detects draft independently from payment status", () => {
  assert.equal(isDraftTransaction({ status: "DRAFT", payment_status: "paid" }), true);
  assert.equal(isDraftTransaction({ status: "final", payment_status: "due" }), false);
  assert.equal(transactionStatusLabel("draft"), "DRAFT");
});
