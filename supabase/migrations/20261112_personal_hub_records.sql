-- Personal Hub cloud synchronization foundation.
-- Apply only to the chosen Supabase project after connection.
-- Each record belongs to the signed-in user; anonymous visitors have no access.
create table if not exists public.personal_hub_records (
  user_id uuid not null references auth.users(id) on delete cascade,
  collection text not null check (collection in ('work_shifts', 'salary_payments')),
  record_id text not null check (length(record_id) between 1 and 160),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  updated_at timestamptz not null default now(),
  primary key (user_id, collection, record_id)
);

create index if not exists personal_hub_records_user_collection_idx
on public.personal_hub_records (user_id, collection);

alter table public.personal_hub_records enable row level security;
revoke all on public.personal_hub_records from anon, authenticated;
grant select, insert, update, delete on public.personal_hub_records to authenticated;

create policy "Read own Personal Hub records"
on public.personal_hub_records for select to authenticated
using (user_id = (select auth.uid()));

create policy "Insert own Personal Hub records"
on public.personal_hub_records for insert to authenticated
with check (user_id = (select auth.uid()));

create policy "Update own Personal Hub records"
on public.personal_hub_records for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "Delete own Personal Hub records"
on public.personal_hub_records for delete to authenticated
using (user_id = (select auth.uid()));

-- Notes:
-- Never put a Supabase service_role/secret key in GitHub Pages.
-- Client uses only the publishable key and Supabase Auth.
-- Initial import must deduplicate legacy local shifts and never overwrite cloud records silently.
-- Cloud writes should be performed per-record, not by replacing the entire collection.
