// Monthly category totals; separate from account balances and work income.
const KEY = 'personal-hub:category-budgets:v1';
const categories = [
  ['groceries', 'Groceries', '<path d="M3 4h2l2 12h11l3-9H6M9 20h.01M17 20h.01"/>'],
  ['smoking', 'Smoking', '<path d="M3 14h15v4H3zM21 14v4M8 10c-3-3 3-3 0-6M13 10c-3-3 3-3 0-6"/>'],
  ['road', 'Road', '<path d="m8 3-4 18M16 3l4 18M12 4v3M12 11v3M12 18v3"/>']
];
export function initFinance() {
  const host = document.querySelector('#finance-budgets');
  const month = document.querySelector('#budget-month');
  const dialog = document.querySelector('#budget-dialog');
  const form = document.querySelector('#budget-form');
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Riga', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
  month.value = parts.find(p => p.type === 'year').value + '-' + parts.find(p => p.type === 'month').value;
  const money = n => new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' }).format(n);
  let active;
  function read() {
    try { const value = JSON.parse(localStorage.getItem(KEY) || '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
    catch { return {}; }
  }
  const amount = value => Number.isFinite(value) && value >= 0 ? value : 0;
  function render() {
    const data = read();
    host.replaceChildren();
    categories.forEach(([id, name, icon]) => {
      const entry = data[month.value + ':' + id] || {};
      const spent = amount(entry.spent), limit = amount(entry.limit);
      const over = limit > 0 && spent > limit;
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'budget-island' + (over ? ' is-over' : '');
      card.setAttribute('aria-label', name + ', spent ' + money(spent) + (limit ? ' of ' + money(limit) : ', no budget set') + '. Edit budget');
      card.innerHTML = `<span class="budget-island-top"><svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg><span>${name}</span><span class="budget-edit" aria-hidden="true">↗</span></span><span class="budget-island-amount">${money(spent)}</span><span class="budget-island-limit">${limit ? 'of ' + money(limit) : 'Set monthly budget'}</span><span class="budget-track"><span style="width:${limit ? Math.min(100, spent / limit * 100) : 0}%"></span></span><span class="budget-island-remaining">${limit ? money(Math.abs(limit - spent)) + (over ? ' over budget' : ' left') : 'No limit set'}</span>`;
      card.addEventListener('click', () => {
        active = month.value + ':' + id;
        document.querySelector('#budget-title').textContent = name;
        document.querySelector('#budget-period').textContent = month.value;
        form.elements.spent.value = spent;
        form.elements.limit.value = limit || '';
        document.querySelector('#budget-error').textContent = '';
        dialog.showModal();
      });
      host.append(card);
    });
  }
  month.addEventListener('change', () => { if (month.validity.valid && month.value) render(); });
  document.querySelector('#budget-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  form.addEventListener('submit', event => {
    event.preventDefault();
    const spent = Number(form.elements.spent.value), limit = Number(form.elements.limit.value);
    if (![spent, limit].every(n => Number.isFinite(n) && n >= 0 && n <= 999999999)) return;
    const data = read();
    data[active] = { spent: Math.round(spent * 100) / 100, limit: Math.round(limit * 100) / 100 };
    try { localStorage.setItem(KEY, JSON.stringify(data)); }
    catch { document.querySelector('#budget-error').textContent = 'Could not save on this device.'; return; }
    dialog.close();
    render();
  });
  window.addEventListener('storage', event => { if (event.key === KEY) render(); });
  render();
}
