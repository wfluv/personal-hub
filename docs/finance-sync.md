# Finances: accounts and synchronized records

Finance records use `personal-hub:finances:v1` locally and the `finances` collection in `personal_hub_records`. Income and expenses are independent records with UUIDs and integer cents, so devices can add expenses offline without overwriting a shared total. Monthly limits and opening balances use stable IDs. The existing per-user RLS policies apply unchanged.

The existing `personal-hub:category-budgets:v1` key is retained intact. Initial totals migrate as category-only legacy snapshots, with stable IDs to avoid counting identical device copies twice. If old devices have different aggregate totals for the same category/month, use the largest snapshot because overlap cannot be inferred. These old totals never subtract from an account; set current balances once to begin tracking actual remaining money.

Income is recorded manually once in Finances. Work shifts and salary payments remain work reporting and are not automatically credited. Set current balance adjusts the opening component while preserving existing income and expense records.

Applied database change (`add_finance_records_collection`):

```sql
alter table public.personal_hub_records drop constraint personal_hub_records_collection_check;
alter table public.personal_hub_records add constraint personal_hub_records_collection_check
  check (collection in ('work_shifts','salary_payments','debts','finances'));
```

Verification:

```sh
node --test tests/finance-model.test.mjs tests/finance-sync.test.cjs tests/finance-ui.test.cjs
```

The tests cover arithmetic, legacy migration, offline device convergence, tombstones, budget changes, and the income/expense UI handlers. Database verification used a rolled-back authenticated insert/read and confirmed another user identity cannot read that record. No test records were retained. Browser rendering needs a separate visual check; local Chromium cannot launch in the execution environment.
