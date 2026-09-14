import test from "node:test";
import assert from "node:assert/strict";

import { readLoginOffer } from "../src/utils/deviceLogin.js";

test("parses a valid reverse device-login QR without accepting unrelated QR data", () => {
  const approval = "a".repeat(43);
  const exchange = "b".repeat(43);
  const challenge = "123e4567-e89b-12d3-a456-426614174000";
  const parsed = readLoginOffer(`finance-login-offer:v1:${approval}:${challenge}:${exchange}:123456`);

  assert.deepEqual(parsed, {
    approval_token: approval,
    challenge_id: challenge,
    exchange_token: exchange,
    display_code: "123456",
  });
  assert.equal(readLoginOffer("https://example.com/unrelated"), null);
});
