-- Extend the existing user-owned cloud record collection for Debts & Credits.
-- Existing work shifts and salary payments remain untouched.
alter table public.personal_hub_records
  drop constraint if exists personal_hub_records_collection_check;
alter table public.personal_hub_records
  add constraint personal_hub_records_collection_check
  check (collection in ('work_shifts', 'salary_payments', 'debts'));
