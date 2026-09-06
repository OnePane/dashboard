import test from "node:test";
import assert from "node:assert/strict";
import { createProviderRegistry } from "../src/providers.js";

test("mock provider creates a provider payment identifier", async () => {
  const provider = createProviderRegistry().get("mock");
  const payment = await provider.createPaymentIntent({ amount: 2500, currency: "USD" });

  assert.equal(payment.provider, "mock");
  assert.equal(payment.amount, 2500);
  assert.match(payment.providerPaymentId, /^mock_pi_/);
});
