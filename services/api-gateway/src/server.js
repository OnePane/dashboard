import http from "node:http";
import { isCurrency, isPositiveMinorAmount } from "../../../packages/contracts/src/index.js";
import { createProviderRegistry } from "./providers.js";

const port = Number(process.env.PORT || 3000);
const accountsUrl = process.env.ACCOUNTS_SERVICE_URL || "http://localhost:3001";
const defaultProvider = process.env.PAYMENT_PROVIDER || "mock";
const providers = createProviderRegistry();
const platformConnections = new Map();
const providerDetails = { stripe: { name: "Stripe", mark: "S", tone: "stripe" }, "bank-of-america": { name: "Bank of America", mark: "BofA", tone: "boa" }, venmo: { name: "Venmo", mark: "V", tone: "venmo" } };
platformConnections.set("cus_demo", ["stripe", "bank-of-america", "venmo"].map((provider, index) => ({ id: `pc_demo_${index}`, provider, apiKey: `demo_${provider}_key`, keyLast4: "_key", connectedAt: new Date().toISOString() })));

function send(response, status, body) { response.writeHead(status, { "content-type": "application/json" }); response.end(JSON.stringify(body)); }
async function readJson(request) { let raw = ""; for await (const chunk of request) raw += chunk; try { return JSON.parse(raw || "{}"); } catch { throw new Error("Request body must be valid JSON"); } }

async function proxyAccounts(request, response, pathname) {
  const upstream = await fetch(`${accountsUrl}${pathname}`, { method: request.method, headers: { "content-type": request.headers["content-type"] || "application/json" }, body: ["POST", "PATCH", "PUT"].includes(request.method) ? request : undefined, duplex: "half" });
  response.writeHead(upstream.status, { "content-type": upstream.headers.get("content-type") || "application/json" });
  response.end(await upstream.text());
}

function groupAccounts(accounts) {
  const providers = new Map();
  for (const account of accounts) {
    const providerName = account.provider || "manual";
    const provider = providers.get(providerName) || { id: providerName, name: providerName, accounts: [] };
    provider.accounts.push({
      id: account.id,
      nickname: account.nickname || account.id,
      type: account.type,
      status: account.status,
      balances: account.balances || [{ currency: account.currency, amount: 0 }],
    });
    providers.set(providerName, provider);
  }
  return [...providers.values()];
}

async function getDashboard(userId) {
  const connections = platformConnections.get(userId) || [];
  const data = [];
  for (const connection of connections) {
    const provider = providers.get(connection.provider);
    if (!provider || !provider.getAccounts) continue;
    data.push(...(await provider.getAccounts(connection.apiKey)).map((account) => ({ ...account, provider: connection.provider })));
  }
  return {
    userId,
    baseCurrency: "USD",
    providers: groupAccounts(data),
    syncedAt: new Date().toISOString(),
  };
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  if (request.method === "GET" && url.pathname === "/health") return send(response, 200, { status: "ok", services: { accounts: accountsUrl } });
  if (request.method === "GET" && url.pathname === "/v1/dashboard") {
    const userId = url.searchParams.get("userId");
    if (!userId) return send(response, 400, { error: "userId is required" });
    try { return send(response, 200, { data: await getDashboard(userId) }); }
    catch { return send(response, 503, { error: "Accounts service is unavailable" }); }
  }
  if (request.method === "POST" && url.pathname === "/v1/platform-connections") {
    try {
      const input = await readJson(request);
      const userId = request.headers["x-user-id"] || input.userId;
      if (!userId || typeof userId !== "string") return send(response, 400, { error: "x-user-id is required" });
      if (!providerDetails[input.provider] || typeof input.apiKey !== "string" || input.apiKey.length < 8) return send(response, 400, { error: "A supported provider and API key (8+ characters) are required" });
      const connection = { id: `pc_${Date.now()}`, provider: input.provider, label: providerDetails[input.provider].name, keyLast4: input.apiKey.slice(-4), connectedAt: new Date().toISOString(), apiKey: input.apiKey };
      const current = platformConnections.get(userId) || [];
      platformConnections.set(userId, [...current.filter((item) => item.provider !== input.provider), connection]);
      return send(response, 201, { data: { ...connection, apiKey: undefined } });
    } catch (error) { return send(response, 400, { error: error.message }); }
  }
  if (request.method === "GET" && url.pathname === "/v1/platform-connections") {
    const userId = url.searchParams.get("userId");
    if (!userId) return send(response, 400, { error: "userId is required" });
    return send(response, 200, { data: (platformConnections.get(userId) || []).map(({ apiKey, ...connection }) => connection) });
  }
  if (request.method === "GET" && url.pathname === "/v1/recipients") {
    const userId = url.searchParams.get("userId");
    const providerName = url.searchParams.get("provider") || "stripe";
    if (!userId) return send(response, 400, { error: "userId is required" });
    const connection = (platformConnections.get(userId) || []).find((item) => item.provider === providerName);
    const provider = providers.get(providerName);
    if (!connection || !provider?.getRecipients) return send(response, 200, { data: [] });
    try { return send(response, 200, { data: await provider.getRecipients(connection.apiKey) }); }
    catch (error) { return send(response, 502, { error: error.message }); }
  }
  if (url.pathname.startsWith("/v1/financial-accounts")) {
    try { return await proxyAccounts(request, response, url.pathname); } catch { return send(response, 503, { error: "Accounts service is unavailable" }); }
  }
  if (request.method === "POST" && url.pathname === "/v1/payment-intents") {
    try {
      const input = await readJson(request);
      if (!isPositiveMinorAmount(input.amount)) return send(response, 400, { error: "amount must be a positive integer in minor units" });
      if (!isCurrency(input.currency)) return send(response, 400, { error: "currency must be a three-letter uppercase ISO code" });
      if (typeof input.financialAccountId !== "string" || !input.financialAccountId) return send(response, 400, { error: "financialAccountId is required" });
      const providerName = input.provider || defaultProvider;
      const provider = providers.get(providerName);
      if (!provider) return send(response, 400, { error: `Unsupported payment provider: ${providerName}` });
      const payment = await provider.createPaymentIntent(input);
      return send(response, 201, { id: `pi_${payment.providerPaymentId}`, financialAccountId: input.financialAccountId, ...payment });
    } catch (error) { return send(response, 400, { error: error.message }); }
  }
  return send(response, 404, { error: "Not found" });
});

server.listen(port, () => console.log(`api-gateway listening on :${port}`));
