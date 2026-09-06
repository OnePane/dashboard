import test from "node:test";
import assert from "node:assert/strict";
import { financialAccountTypes, isCurrency } from "../../../packages/contracts/src/index.js";

test("account contract accepts supported account types and ISO currency", () => {
  assert.equal(financialAccountTypes.has("cash"), true);
  assert.equal(isCurrency("USD"), true);
  assert.equal(isCurrency("usd"), false);
});
