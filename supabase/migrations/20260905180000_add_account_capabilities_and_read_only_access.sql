alter table public.platform_connections add column if not exists access_mode text not null default 'read_only' check (access_mode in ('read_only','read_write'));
alter table public.financial_accounts add column if not exists can_move_money boolean not null default false;
alter table public.financial_accounts add column if not exists capabilities jsonb not null default '{"read_balance": true, "move_money": false}'::jsonb;
create index if not exists financial_accounts_can_move_money_idx on public.financial_accounts(can_move_money) where can_move_money = true;
create unique index if not exists platform_connections_account_platform_unique on public.platform_connections(account_id, platform);
