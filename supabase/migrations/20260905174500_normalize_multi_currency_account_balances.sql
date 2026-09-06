create table if not exists public.financial_account_balances (
  id uuid primary key default gen_random_uuid(),
  financial_account_id uuid not null references public.financial_accounts(id) on delete cascade,
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  amount bigint not null default 0,
  available_amount bigint,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (financial_account_id, currency)
);
create index if not exists financial_account_balances_account_idx on public.financial_account_balances(financial_account_id);
alter table public.financial_account_balances enable row level security;
create policy financial_account_balances_select_own on public.financial_account_balances for select using (exists (select 1 from public.financial_accounts fa where fa.id = financial_account_id and exists (select 1 from public.account_members am where am.account_id = fa.account_id and am.user_id = auth.uid())));
