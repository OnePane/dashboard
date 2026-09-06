create extension if not exists pgcrypto;
create table if not exists public.financial_accounts (
  id uuid primary key default gen_random_uuid(), customer_id text not null,
  type text not null check (type in ('cash', 'card', 'bank')),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'), provider text not null default 'manual',
  nickname text, balances jsonb not null default '[]'::jsonb,
  status text not null default 'open' check (status in ('open', 'closed', 'suspended')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists financial_accounts_customer_id_idx on public.financial_accounts (customer_id);
create index if not exists financial_accounts_provider_idx on public.financial_accounts (provider);
create table if not exists public.payment_intents (
  id uuid primary key default gen_random_uuid(), financial_account_id uuid not null references public.financial_accounts(id),
  amount bigint not null check (amount > 0), currency char(3) not null check (currency ~ '^[A-Z]{3}$'), provider text not null,
  provider_payment_id text, status text not null check (status in ('requires_payment_method','processing','succeeded','failed','canceled')),
  metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (provider, provider_payment_id)
);
create table if not exists public.idempotency_keys (key text primary key, request_hash text not null, response_status integer, response_body jsonb, created_at timestamptz not null default now(), expires_at timestamptz not null default (now() + interval '24 hours'));
create table if not exists public.outbox_events (id bigint generated always as identity primary key, aggregate_type text not null, aggregate_id uuid not null, event_type text not null, payload jsonb not null, created_at timestamptz not null default now(), published_at timestamptz);
create index if not exists outbox_events_unpublished_idx on public.outbox_events (created_at) where published_at is null;
alter table public.financial_accounts enable row level security;
alter table public.payment_intents enable row level security;
alter table public.idempotency_keys enable row level security;
alter table public.outbox_events enable row level security;
