import test from "node:test";
import assert from "node:assert/strict";

import { getPaymentStatusText } from "../src/utils/paymentStatus.js";

test("status nota membedakan belum dibayar dan pembayaran sebagian", () => {
  assert.equal(getPaymentStatusText("paid", []), "LUNAS");
  assert.equal(getPaymentStatusText("due", [{ amount: 1000 }]), "BELUM DIBAYAR");
  assert.equal(getPaymentStatusText("partial", []), "BELUM LUNAS");
  assert.equal(getPaymentStatusText(null, []), "BELUM DIBAYAR");
  assert.equal(getPaymentStatusText(null, [{ amount: "25000" }]), "BELUM LUNAS");
  assert.equal(getPaymentStatusText(null, [{ amount: 0 }]), "BELUM DIBAYAR");
});
