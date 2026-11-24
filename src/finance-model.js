export const FINANCE_KEY = 'personal-hub:finances:v1';
export const LEGACY_KEY = 'personal-hub:category-budgets:v1';
export const ACCOUNTS = [['bank','Bank'],['cash','Cash'],['savings','Savings'],['investments','Investments'],['other','Other']];
export const CATEGORY_IDS = ['groceries','smoking','road'];
export const toCents = value => Math.round((Number(value) + Number.EPSILON) * 100);
export function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + 'T00:00:00Z');
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10) === value;
}
const validMonth = value => /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
export function validRecord(r) {
  if (!r || typeof r.id !== 'string' || !Number.isSafeInteger(r.cents) || Math.abs(r.cents) > 99999999900) return false;
  if (r.kind === 'budget' || r.kind === 'legacy') return validMonth(r.month) && CATEGORY_IDS.includes(r.category) && r.cents >= 0;
  if (!ACCOUNTS.some(([id]) => id === r.account)) return false;
  if (r.kind === 'opening') return r.id === 'opening:' + r.account;
  return validDate(r.date) && r.cents > 0 && (r.kind === 'income' || (r.kind === 'expense' && CATEGORY_IDS.includes(r.category)));
}
// Old totals had no individual transactions or source account. Keep them for
// category reporting only. Identical device copies share IDs; differing totals
// use the largest snapshot, since their overlap cannot safely be inferred.
export function migrateLegacy(raw, records) {
  const next = new Map(records.map(r => [r.id,r]));
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return records;
  for (const [key, value] of Object.entries(raw)) {
    const [month,category] = key.split(':');
    if (!validMonth(month) || !CATEGORY_IDS.includes(category) || !value) continue;
    const spent = toCents(value.spent), limit = toCents(value.limit);
    if (Number.isSafeInteger(spent) && spent >= 0 && spent <= 99999999900) {
      const id = `legacy:${key}:${spent}`;
      if (!next.has(id)) next.set(id,{id,kind:'legacy',month,category,cents:spent});
    }
    const id = 'budget:' + key;
    if (!next.has(id) && Number.isSafeInteger(limit) && limit >= 0 && limit <= 99999999900) next.set(id,{id,kind:'budget',month,category,cents:limit});
  }
  return [...next.values()];
}
export function accountBalance(records, account, includeOpening = true) {
  return records.reduce((sum,r) => r.account !== account ? sum : sum +
    (r.kind === 'expense' ? -r.cents : r.kind === 'income' || (includeOpening && r.kind === 'opening') ? r.cents : 0),0);
}
export function categoryTotals(records, month, category) {
  let spent = 0, legacy = 0, limit = 0;
  for (const r of records) {
    if (r.category !== category) continue;
    if (r.kind === 'expense' && r.date.slice(0,7) === month) spent += r.cents;
    if (r.month !== month) continue;
    if (r.kind === 'legacy') legacy = Math.max(legacy,r.cents);
    if (r.kind === 'budget') limit = r.cents;
  }
  return {spent:spent+legacy,limit};
}
