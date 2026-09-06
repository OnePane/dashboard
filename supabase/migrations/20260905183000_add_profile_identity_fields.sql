alter table public.profiles add column if not exists first_name text;
alter table public.profiles add column if not exists last_name text;
alter table public.profiles add column if not exists username text;

update public.profiles p
set first_name = coalesce(nullif(first_name, ''), split_part(coalesce(p.full_name, ''), ' ', 1)),
    last_name = coalesce(nullif(last_name, ''), nullif(trim(substr(coalesce(p.full_name, ''), strpos(coalesce(p.full_name, ''), ' ') + 1)), ''))
where first_name is null or last_name is null;

update public.profiles p
set username = coalesce(nullif(username, ''), 'user_' || replace(left(p.id::text, 8), '-', ''))
where username is null or username = '';

alter table public.profiles alter column username set not null;
create unique index if not exists profiles_username_lower_unique on public.profiles (lower(username));
alter table public.profiles drop constraint if exists profiles_username_format;
alter table public.profiles add constraint profiles_username_format check (username ~ '^[a-zA-Z0-9_]{3,32}$');

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path=public as $$
declare
  new_account_id uuid;
  full_name_value text := coalesce(new.raw_user_meta_data->>'full_name', '');
  first_name_value text := coalesce(nullif(new.raw_user_meta_data->>'first_name', ''), split_part(full_name_value, ' ', 1));
  last_name_value text := coalesce(nullif(new.raw_user_meta_data->>'last_name', ''), nullif(trim(substr(full_name_value, strpos(full_name_value, ' ') + 1)), ''));
  username_value text := coalesce(nullif(new.raw_user_meta_data->>'username', ''), 'user_' || replace(left(new.id::text, 8), '-', ''));
begin
  insert into public.profiles(id, full_name, first_name, last_name, username, company_name)
  values(new.id, nullif(full_name_value, ''), nullif(first_name_value, ''), last_name_value, username_value, new.raw_user_meta_data->>'company_name')
  on conflict(id) do update set full_name = excluded.full_name, first_name = excluded.first_name, last_name = excluded.last_name, username = excluded.username;
  insert into public.accounts(owner_user_id, name)
  values(new.id, coalesce(nullif(new.raw_user_meta_data->>'company_name', ''), 'Personal account'))
  returning id into new_account_id;
  insert into public.account_members(account_id, user_id, role)
  values(new_account_id, new.id, 'owner') on conflict do nothing;
  return new;
end;
$$;
