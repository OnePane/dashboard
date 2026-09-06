import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "content-type": "application/json" } });
const stripeHeaders = (key: string, version = "2026-02-25.preview") => ({ Authorization: `Bearer ${key}`, "Stripe-Version": version });

async function requireUser(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Authentication required");
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new Error("Invalid authentication token");
  return data.user;
}

async function accountForUser(userId: string) {
  const { data, error } = await supabase.from("accounts").select("id, name").eq("owner_user_id", userId).limit(1).maybeSingle();
  if (error) throw error;
  return data;
}

async function connectionsForUser(userId: string) {
  const { data: memberships, error: membershipError } = await supabase.from("account_members").select("account_id").eq("user_id", userId);
  if (membershipError) throw membershipError;
  const accountIds = (memberships || []).map((membership: { account_id: string }) => membership.account_id);
  if (!accountIds.length) return [];
  const { data, error } = await supabase.from("platform_connections").select("id, account_id, platform, status, display_name, credentials_ref, metadata, last_synced_at, created_at").in("account_id", accountIds).order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

async function stripeFinancialAccounts(apiKey: string) {
  const response = await fetch("https://api.stripe.com/v2/money_management/financial_accounts?limit=100", { headers: stripeHeaders(apiKey) });
  if (!response.ok) {
    const detail = await response.text();
    const fallback = await stripeBalanceFallback(apiKey);
    if (fallback.length) return fallback;
    throw new Error(`Stripe Financial Accounts v2 request failed with ${response.status}${detail ? `: ${detail.slice(0, 240)}` : ""}`);
  }
  const payload = await response.json();
  return (payload.data || []).map((financialAccount: any) => ({
    nickname: financialAccount.display_name || financialAccount.description || financialAccount.id,
    identifier: financialAccount.id,
    currencies: Object.entries(financialAccount.balance?.available || {}).map(([currency, value]: [string, any]) => ({ currency: String(value?.currency || currency).toUpperCase(), amount: Number(value?.value || 0) })),
  }));
}

async function stripeBalanceFallback(apiKey: string) {
  const response = await fetch("https://api.stripe.com/v1/balance", { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!response.ok) return [];
  const payload = await response.json();
  const available = (payload.available || []).map((balance: any) => ({ currency: String(balance.currency || "").toUpperCase(), amount: Number(balance.amount || 0) }));
  return available.length ? [{ nickname: "Stripe balance", identifier: "stripe_balance", currencies: available }] : [];
}

async function stripeRecipients(apiKey: string) {
  const response = await fetch("https://api.stripe.com/v1/customers?limit=100", { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!response.ok) throw new Error(`Stripe customers request failed with ${response.status}`);
  const payload = await response.json();
  return (payload.data || []).map((customer: any) => ({ id: `stripe_customer_${customer.id}`, name: customer.name || customer.email || customer.id, destination: customer.email || customer.id, method: "stripe" }));
}

async function stripeRecipientsForConnections(connections: any[]) {
  const stripeConnections = connections.filter((connection) => connection.platform === "stripe" && connection.credentials_ref);
  const recipientGroups = await Promise.all(stripeConnections.map((connection) => stripeRecipients(connection.credentials_ref)));
  return Array.from(new Map(recipientGroups.flat().map((recipient) => [recipient.id, recipient])).values());
}

async function dashboard(userId: string) {
  const connections = await connectionsForUser(userId);
  const providers = [];
  for (const connection of connections) {
    if (connection.platform === "stripe" && connection.credentials_ref) {
      const accounts = await stripeFinancialAccounts(connection.credentials_ref);
      providers.push({ id: "stripe", name: "Stripe", accounts: accounts.map((account: any) => ({ id: account.identifier, nickname: account.nickname, type: "cash", status: "open", balances: account.currencies.map((balance: any) => ({ currency: balance.currency, amount: balance.amount })) })) });
    }
  }
  return { userId, baseCurrency: "USD", providers, syncedAt: new Date().toISOString() };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(request.url);
  try {
    const user = await requireUser(request);
    if (request.method === "GET" && url.pathname.endsWith("/health")) return json({ status: "ok" });
    if (request.method === "GET" && url.pathname.endsWith("/dashboard")) return json({ data: await dashboard(user.id) });
    if (request.method === "GET" && url.pathname.endsWith("/platform-connections")) {
      const data = (await connectionsForUser(user.id)).map(({ credentials_ref: secret, ...connection }) => ({ id: connection.id, provider: connection.platform, label: connection.display_name || connection.platform, keyLast4: secret ? secret.slice(-4) : "", connectedAt: connection.created_at, status: connection.status }));
      return json({ data });
    }
    if (request.method === "POST" && url.pathname.endsWith("/platform-connections")) {
      const input = await request.json();
      if (!["stripe", "bank-of-america", "venmo"].includes(input.provider) || typeof input.apiKey !== "string" || input.apiKey.length < 8) return json({ error: "A supported provider and API key (8+ characters) are required" }, 400);
      const account = await accountForUser(user.id);
      if (!account) return json({ error: "No account is associated with this user" }, 400);
      const { data, error } = await supabase.from("platform_connections").insert({ account_id: account.id, platform: input.provider, display_name: input.displayName || input.provider, credentials_ref: input.apiKey, access_mode: "read_only", status: "active", updated_at: new Date().toISOString() }).select("id, platform, display_name, status, created_at").single();
      if (error) return json({ error: error.message }, 500);
      return json({ data: { id: data.id, provider: data.platform, label: data.display_name, keyLast4: input.apiKey.slice(-4), connectedAt: data.created_at, status: data.status } }, 201);
    }
    if (request.method === "DELETE" && url.pathname.includes("/platform-connections/")) {
      const connectionId = url.pathname.split("/").pop();
      const connection = (await connectionsForUser(user.id)).find((item) => item.id === connectionId);
      if (!connection) return json({ error: "Connection not found" }, 404);
      const { error } = await supabase.from("platform_connections").delete().eq("id", connectionId);
      if (error) return json({ error: error.message }, 500);
      return json({ data: { id: connectionId, deleted: true } });
    }
    if (request.method === "GET" && url.pathname.endsWith("/recipients")) {
      return json({ data: await stripeRecipientsForConnections(await connectionsForUser(user.id)) });
    }
    if (request.method === "GET" && url.pathname.endsWith("/profile")) {
      const { data, error } = await supabase.from("profiles").select("first_name, last_name, username, company_name").eq("id", user.id).maybeSingle();
      if (error) return json({ error: error.message }, 500);
      return data ? json({ data }) : json({ error: "Profile not found" }, 404);
    }
    if (request.method === "POST" && url.pathname.endsWith("/profile")) {
      const input = await request.json();
      const firstName = String(input.firstName || "").trim();
      const lastName = String(input.lastName || "").trim();
      const username = String(input.username || "").trim();
      if (!firstName || !lastName || !/^[A-Za-z0-9_]{3,32}$/.test(username)) return json({ error: "First name, last name, and a valid username are required" }, 400);
      const { data: existing, error: existingError } = await supabase.from("profiles").select("id").ilike("username", username).neq("id", user.id).maybeSingle();
      if (existingError) return json({ error: existingError.message }, 500);
      if (existing) return json({ error: "That username is already taken" }, 409);
      const { data, error } = await supabase.from("profiles").update({ first_name: firstName, last_name: lastName, username, full_name: `${firstName} ${lastName}`, updated_at: new Date().toISOString() }).eq("id", user.id).select("first_name, last_name, username, company_name").single();
      if (error) return json({ error: error.message }, 500);
      return json({ data });
    }
    if (request.method === "GET" && url.pathname.endsWith("/financial-accounts")) {
      const customerId = url.searchParams.get("customerId");
      let query = supabase.from("financial_accounts").select("*").order("created_at", { ascending: false });
      if (customerId) query = query.eq("customer_id", customerId);
      const { data, error } = await query;
      return error ? json({ error: error.message }, 500) : json({ data });
    }
    if (request.method === "POST" && url.pathname.endsWith("/financial-accounts")) {
      const input = await request.json();
      if (!input.customerId || !["cash", "card", "bank"].includes(input.type) || !/^[A-Z]{3}$/.test(input.currency ?? "")) return json({ error: "customerId, type, and uppercase three-letter currency are required" }, 400);
      const balances = input.balances ?? [{ currency: input.currency, amount: 0 }];
      const { data, error } = await supabase.from("financial_accounts").insert({ customer_id: input.customerId, type: input.type, currency: input.currency, provider: input.provider ?? "manual", nickname: input.nickname ?? null, can_move_money: input.canMoveMoney === true, capabilities: { read_balance: true, move_money: input.canMoveMoney === true }, balances }).select().single();
      if (error) return json({ error: error.message }, 500);
      const normalized = await supabase.from("financial_account_balances").insert(balances.map((balance: { currency: string; amount: number; availableAmount?: number }) => ({ financial_account_id: data.id, currency: balance.currency, amount: balance.amount, available_amount: balance.availableAmount ?? null })));
      if (normalized.error) return json({ error: normalized.error.message }, 500);
      return json({ ...data, id: `fa_${data.id}` }, 201);
    }
    return json({ error: "Not found" }, 404);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Request failed" }, 401);
  }
});
