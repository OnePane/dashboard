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
  async getAccounts(apiKey) {
    if (this.name !== "stripe") return balanceFixtures[this.name] || [];
    const response = await fetch("https://api.stripe.com/v2/money_management/financial_accounts?limit=100", { headers: { Authorization: `Bearer ${apiKey}`, "Stripe-Version": "2026-02-25.preview" } });
    if (!response.ok) throw new Error(`Stripe Financial Accounts v2 request failed with ${response.status}`);
    const payload = await response.json();
    return (payload.data || []).map((financialAccount) => ({
      nickname: financialAccount.display_name || financialAccount.description || financialAccount.id,
      identifier: financialAccount.id,
      currencies: Object.entries(financialAccount.balance?.available || {}).map(([currency, value]) => ({
        code: String(value?.currency || currency).toUpperCase(),
        amount: Number(value?.value || 0),
      })),
    }));
  }
  async getRecipients(apiKey) {
    if (this.name !== "stripe") return [];
    const response = await fetch("https://api.stripe.com/v1/customers?limit=100", { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!response.ok) throw new Error(`Stripe customers request failed with ${response.status}`);
    const payload = await response.json();
    return (payload.data || []).map((customer) => ({
      id: `stripe_${customer.id}`,
      name: customer.name || customer.email || customer.id,
      destination: customer.email || customer.id,
      method: "stripe",
    }));
  }
  async createPaymentIntent(input) { return { provider: this.name, providerPaymentId: `${this.name}_pi_${randomUUID()}`, status: "requires_payment_method", amount: input.amount, currency: input.currency }; }
}

export function createProviderRegistry() {
  const providers = [new MockPaymentProvider(), new BalanceProvider("stripe"), new BalanceProvider("bank-of-america"), new BalanceProvider("venmo")];
  return new Map(providers.map((provider) => [provider.name, provider]));
}
