import http from "node:http";
import { randomUUID } from "node:crypto";
import { financialAccountTypes, isCurrency } from "../../../packages/contracts/src/index.js";
import pg from "pg";

const { Pool } = pg;

const accounts = new Map();
const port = Number(process.env.PORT || 3001);
const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL, max: Number(process.env.DB_POOL_MAX || 10), ssl: { rejectUnauthorized: true } }) : null;

function send(response, status, body) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  let raw = "";
  for await (const chunk of request) raw += chunk;
  try { return JSON.parse(raw || "{}"); } catch { throw new Error("Request body must be valid JSON"); }
}

function validateAccount(input) {
  if (typeof input.customerId !== "string" || !input.customerId) return "customerId is required";
  if (!financialAccountTypes.has(input.type)) return "type must be cash, card, or bank";
  if (!isCurrency(input.currency)) return "currency must be a three-letter uppercase ISO code";
  return null;
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  if (request.method === "GET" && url.pathname === "/health") return send(response, 200, { status: "ok" });
  if (request.method === "GET" && url.pathname === "/v1/financial-accounts") {
    const customerId = url.searchParams.get("customerId");
    if (pool) {
      const result = await pool.query("select id, customer_id as \"customerId\", type, currency, provider, nickname, balances, status, created_at as \"createdAt\" from public.financial_accounts where ($1::text is null or customer_id = $1) order by created_at desc", [customerId]);
      return send(response, 200, { data: result.rows.map((row) => ({ ...row, id: `fa_${row.id}` })) });
    }
    const data = [...accounts.values()].filter((account) => !customerId || account.customerId === customerId);
    return send(response, 200, { data });
  }
  if (request.method === "POST" && url.pathname === "/v1/financial-accounts") {
    try {
      const input = await readJson(request);
      const error = validateAccount(input);
      if (error) return send(response, 400, { error });
      let account;
      if (pool) {
        const result = await pool.query("insert into public.financial_accounts (customer_id, type, currency, provider, nickname, balances) values ($1, $2, $3, $4, $5, $6::jsonb) returning id, customer_id as \"customerId\", type, currency, provider, nickname, balances, status, created_at as \"createdAt\"", [input.customerId, input.type, input.currency, input.provider || "manual", input.nickname || null, JSON.stringify(input.balances || [{ currency: input.currency, amount: 0 }])]);
        account = { ...result.rows[0], id: `fa_${result.rows[0].id}` };
      } else {
        account = { id: `fa_${randomUUID()}`, customerId: input.customerId, type: input.type, currency: input.currency, provider: input.provider || "manual", nickname: input.nickname || null, balances: input.balances || [{ currency: input.currency, amount: 0 }], status: "open", createdAt: new Date().toISOString() };
      }
      accounts.set(account.id, account);
      return send(response, 201, account);
    } catch (error) { return send(response, 400, { error: error.message }); }
  }
  const match = url.pathname.match(/^\/v1\/financial-accounts\/(fa_[\w-]+)$/);
  if (request.method === "GET" && match) {
    const account = pool
      ? (await pool.query("select id, customer_id as \"customerId\", type, currency, provider, nickname, balances, status, created_at as \"createdAt\" from public.financial_accounts where id = $1", [match[1].replace(/^fa_/, "")])).rows[0]
      : accounts.get(match[1]);
    if (pool && account) account.id = `fa_${account.id}`;
    return account ? send(response, 200, account) : send(response, 404, { error: "Financial account not found" });
  }
  return send(response, 404, { error: "Not found" });
});

server.listen(port, () => console.log(`accounts-service listening on :${port}`));
