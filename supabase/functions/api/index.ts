import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

Deno.serve(async (request) => {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname.endsWith("/health")) return json({ status: "ok" });
  if (request.method === "GET" && url.pathname.endsWith("/financial-accounts")) {
    const customerId = url.searchParams.get("customerId");
    let query = supabase.from("financial_accounts").select("*").order("created_at", { ascending: false });
    if (customerId) query = query.eq("customer_id", customerId);
    const { data, error } = await query;
    return error ? json({ error: error.message }, 500) : json({ data });
  }
  if (request.method === "POST" && url.pathname.endsWith("/financial-accounts")) {
    const input = await request.json();
    if (!input.customerId || !["cash", "card", "bank"].includes(input.type) || !/^[A-Z]{3}$/.test(input.currency ?? "")) {
      return json({ error: "customerId, type, and uppercase three-letter currency are required" }, 400);
    }
    const { data, error } = await supabase.from("financial_accounts").insert({
      customer_id: input.customerId, type: input.type, currency: input.currency,
      provider: input.provider ?? "manual", nickname: input.nickname ?? null,
      balances: input.balances ?? [{ currency: input.currency, amount: 0 }],
    }).select().single();
    return error ? json({ error: error.message }, 500) : json({ ...data, id: `fa_${data.id}` }, 201);
  }
  return json({ error: "Not found" }, 404);
});
