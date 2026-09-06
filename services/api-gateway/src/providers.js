import { randomUUID } from "node:crypto";

export class MockPaymentProvider {
  constructor() { this.name = "mock"; }
  async createPaymentIntent(input) {
    return { provider: this.name, providerPaymentId: `mock_pi_${randomUUID()}`, status: "requires_payment_method", amount: input.amount, currency: input.currency };
  }

  async getAccounts() { return []; }
}

const balanceFixtures = {
  stripe: [{ nickname: "Online sales", identifier: "Primary", currencies: [{ code: "USD", amount: 4219600 }, { code: "GBP", amount: 782000 }] }],
  "bank-of-america": [{ nickname: "Operating", identifier: "···· 4821", currencies: [{ code: "USD", amount: 21840242 }] }, { nickname: "Europe reserve", identifier: "···· 9204", currencies: [{ code: "EUR", amount: 1845000 }, { code: "USD", amount: 412000 }] }],
  venmo: [{ nickname: "Business wallet", identifier: "@acme", currencies: [{ code: "USD", amount: 2363400 }] }],
};

export class BalanceProvider {
  constructor(name) { this.name = name; }
  async getAccounts() { return balanceFixtures[this.name] || []; }
  async createPaymentIntent(input) { return { provider: this.name, providerPaymentId: `${this.name}_pi_${randomUUID()}`, status: "requires_payment_method", amount: input.amount, currency: input.currency }; }
}

export function createProviderRegistry() {
  const providers = [new MockPaymentProvider(), new BalanceProvider("stripe"), new BalanceProvider("bank-of-america"), new BalanceProvider("venmo")];
  return new Map(providers.map((provider) => [provider.name, provider]));
}
