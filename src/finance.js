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
  let editingBudget = false;
  const expenseField = document.querySelector('#budget-expense-field');
  const limitField = document.querySelector('#budget-limit-field');
  const submit = document.querySelector('#budget-submit');
  const toggle = document.querySelector('#budget-edit-limit');
  function setMode(budget) {
    editingBudget = budget;
    expenseField.hidden = budget;
    limitField.hidden = !budget;
    form.elements.spent.required = !budget;
    form.elements.spent.disabled = budget;
    form.elements.limit.disabled = !budget;
    submit.textContent = budget ? 'Save budget' : 'Add expense';
    toggle.textContent = budget ? '← Add expense' : 'Edit monthly budget';
    if (!budget) form.elements.spent.value = '';
  }
  toggle.addEventListener('click', () => setMode(!editingBudget));
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
      card.setAttribute('aria-label', name + ', spent ' + money(spent) + (limit ? ' of ' + money(limit) : ', no budget set') + '. Add expense');
      card.innerHTML = `<span class="budget-island-top"><svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg><span>${name}</span><span class="budget-edit" aria-hidden="true">+</span></span><span class="budget-island-amount">${money(spent)}</span><span class="budget-island-limit">${limit ? 'of ' + money(limit) : 'Set monthly budget'}</span><span class="budget-track"><span style="width:${limit ? Math.min(100, spent / limit * 100) : 0}%"></span></span><span class="budget-island-remaining">${limit ? money(Math.abs(limit - spent)) + (over ? ' over budget' : ' left') : 'No limit set'}</span>`;
      card.addEventListener('click', () => {
        active = month.value + ':' + id;
        document.querySelector('#budget-title').textContent = name;
        document.querySelector('#budget-period').textContent = month.value;
        setMode(false);
        form.elements.limit.value = limit || '';
        document.querySelector('#budget-error').textContent = '';
        dialog.showModal();
        form.elements.spent.focus();
      });
      host.append(card);
    });
  }
  month.addEventListener('change', () => { if (month.validity.valid && month.value) render(); });
  document.querySelector('#budget-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  form.addEventListener('submit', event => {
    event.preventDefault();
    const value = Number(editingBudget ? form.elements.limit.value : form.elements.spent.value);
    if (!Number.isFinite(value) || value < (editingBudget ? 0 : 0.01) || value > 999999999) return;
    const data = read();
    const previous = data[active] || {};
    const spent = amount(previous.spent), limit = amount(previous.limit);
    data[active] = editingBudget
      ? { ...previous, spent, limit: Math.round(value * 100) / 100 }
      : { ...previous, spent: (Math.round(spent * 100) + Math.round(value * 100)) / 100, limit };
    try { localStorage.setItem(KEY, JSON.stringify(data)); }
    catch { document.querySelector('#budget-error').textContent = 'Could not save on this device.'; return; }
    dialog.close();
    render();
  });
  window.addEventListener('storage', event => { if (event.key === KEY) render(); });
  render();
}
