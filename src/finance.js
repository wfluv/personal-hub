import { queueCloudDiff } from './cloud.js?v=finance-3';
import { FINANCE_KEY, LEGACY_KEY, ACCOUNTS, toCents, validDate, validRecord, migrateLegacy, accountBalance, categoryTotals } from './finance-model.js?v=finance-3';
const categories = [
  ['groceries', 'Groceries', '<path d="M3 4h2l2 12h11l3-9H6M9 20h.01M17 20h.01"/>'],
  ['smoking', 'Smoking', '<path d="M3 14h15v4H3zM21 14v4M8 10c-3-3 3-3 0-6M13 10c-3-3 3-3 0-6"/>'],
  ['road', 'Road', '<path d="m8 3-4 18M16 3l4 18M12 4v3M12 11v3M12 18v3"/>']
];
const $ = selector => document.querySelector(selector);
const money = cents => new Intl.NumberFormat('en-IE',{style:'currency',currency:'EUR'}).format(cents/100);
const uid = () => 'finance-' + crypto.randomUUID();
function read() {
  const value = JSON.parse(localStorage.getItem(FINANCE_KEY) || '[]');
  if (!Array.isArray(value) || !value.every(validRecord)) throw new Error('Could not read saved finances. Your data has been kept.');
  return value;
}
function today() {
  const parts = new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Riga',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  return ['year','month','day'].map(type => parts.find(p => p.type === type).value).join('-');
}
let renderFinance = () => {};
export function refreshFinance() { renderFinance(); }
export function initFinance() {
  const host = $('#finance-budgets'), month = $('#budget-month');
  const dialog = $('#budget-dialog'), form = $('#budget-form');
  const moneyDialog = $('#income-dialog'), moneyForm = $('#income-form');
  const submit = $('#budget-submit'), toggle = $('#budget-edit-limit');
  let category, editingBudget = false, moneyMode = 'income', activeMonth;
  month.value = today().slice(0,7);
  const options = ACCOUNTS.map(([id,label]) => `<option value="${id}">${label}</option>`).join('');
  $('#expense-account').innerHTML = options;
  $('#income-account').innerHTML = options;
  function report(error) { $('#finance-error').textContent = error.message || 'Could not save finances on this device.'; }
  // Retain the old key intact as a backup. Migration is deterministic and repeatable.
  try {
    const previous = read();
    const migrated = migrateLegacy(JSON.parse(localStorage.getItem(LEGACY_KEY) || '{}'), previous);
    if (JSON.stringify(migrated) !== JSON.stringify(previous)) localStorage.setItem(FINANCE_KEY,JSON.stringify(migrated));
  } catch (error) { report(error); }
  function save(record) {
    if (!validRecord(record)) throw new Error('Check the amount, account and date.');
    const previous = read();
    const next = [...previous.filter(r => r.id !== record.id),record];
    localStorage.setItem(FINANCE_KEY,JSON.stringify(next));
    $('#finance-error').textContent = '';
    try { queueCloudDiff(FINANCE_KEY,previous,next); }
    catch { $('#finance-error').textContent = 'Saved on this device. Cloud sync will retry.'; }
    renderFinance();
  }
  function setMode(budget) {
    editingBudget = budget;
    $('#budget-expense-field').hidden = budget;
    $('#budget-limit-field').hidden = !budget;
    form.elements.spent.required = !budget;
    form.elements.spent.disabled = budget;
    form.elements.limit.disabled = !budget;
    $('#expense-account').disabled = budget;
    $('#expense-date').disabled = budget;
    submit.textContent = budget ? 'Save budget' : 'Add expense';
    toggle.textContent = budget ? '← Add expense' : 'Edit monthly budget';
    if (!budget) form.elements.spent.value = '';
  }
  function render() {
    let records;
    try { records = read(); } catch(error) { report(error); return; }
    const balances = ACCOUNTS.map(([id]) => accountBalance(records,id));
    $('.balance-amount').textContent = money(balances.reduce((sum,n) => sum+n,0));
    const allocation = $('#finance-allocation');
    allocation.replaceChildren();
    ACCOUNTS.forEach(([id,label],index) => {
      const row = document.createElement('div'); row.className = 'allocation-row';
      const name = document.createElement('span'), value = document.createElement('span');
      name.textContent = label; value.textContent = money(balances[index]); row.append(name,value); allocation.append(row);
    });
    host.replaceChildren();
    for (const [id,name,icon] of categories) {
      const {spent,limit} = categoryTotals(records,month.value,id), over = limit > 0 && spent > limit;
      const card = document.createElement('button'); card.type = 'button';
      card.className = 'budget-island' + (over ? ' is-over' : '');
      card.setAttribute('aria-label',`${name}, spent ${money(spent)}${limit ? ' of '+money(limit) : ', no budget set'}. Add expense`);
      card.innerHTML = `<span class="budget-island-top"><svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg><span>${name}</span><span class="budget-edit" aria-hidden="true">+</span></span><span class="budget-island-amount">${money(spent)}</span><span class="budget-island-limit">${limit ? 'of '+money(limit) : 'Set monthly budget'}</span><span class="budget-track"><span style="width:${limit ? Math.min(100,spent/limit*100) : 0}%"></span></span><span class="budget-island-remaining">${limit ? money(Math.abs(limit-spent))+(over ? ' over budget' : ' left') : 'No limit set'}</span>`;
      card.addEventListener('click',() => {
        category = id; activeMonth = month.value;
        $('#budget-title').textContent = name; $('#budget-period').textContent = activeMonth;
        setMode(false); form.elements.limit.value = limit ? limit/100 : '';
        $('#expense-date').value = today().startsWith(activeMonth) ? today() : activeMonth+'-01';
        $('#budget-error').textContent = ''; dialog.showModal(); form.elements.spent.focus();
      });
      host.append(card);
    }
  }
  renderFinance = render;
  month.addEventListener('change',() => { if (month.validity.valid && month.value) render(); });
  toggle.addEventListener('click',() => setMode(!editingBudget));
  $('#budget-close').addEventListener('click',() => dialog.close());
  $('#income-close').addEventListener('click',() => moneyDialog.close());
  [dialog,moneyDialog].forEach(d => d.addEventListener('click',e => { if (e.target === d) d.close(); }));
  form.addEventListener('submit',event => {
    event.preventDefault();
    try {
      const cents = toCents(editingBudget ? form.elements.limit.value : form.elements.spent.value);
      if (!Number.isSafeInteger(cents) || cents < (editingBudget ? 0 : 1)) throw new Error('Enter a valid amount.');
      if (editingBudget) save({id:`budget:${activeMonth}:${category}`,kind:'budget',month:activeMonth,category,cents});
      else {
        const date = $('#expense-date').value;
        if (!validDate(date) || date.slice(0,7) !== activeMonth) throw new Error('Choose a date in '+activeMonth+'.');
        save({id:uid(),kind:'expense',category,date,account:$('#expense-account').value,cents});
      }
      dialog.close();
    } catch(error) { $('#budget-error').textContent = error.message; }
  });
  function updateMoneyAccount() {
    if (moneyMode !== 'balance') return;
    try { $('#income-amount').value = accountBalance(read(),$('#income-account').value)/100; } catch(error) { report(error); }
  }
  function openMoney(mode) {
    moneyMode = mode;
    $('#income-title').textContent = mode === 'income' ? 'Add income' : 'Set current balance';
    $('#income-submit').textContent = mode === 'income' ? 'Add income' : 'Save balance';
    $('#income-amount-label').textContent = mode === 'income' ? 'Amount received (€)' : 'Current account balance (€)';
    $('#income-date-field').hidden = mode !== 'income';
    $('#income-date').disabled = mode !== 'income';
    $('#income-amount').min = mode === 'income' ? '0.01' : '-999999999';
    $('#income-amount').value = ''; $('#income-date').value = today();
    $('#income-error').textContent = '';
    $('#income-note').textContent = mode === 'income' ? 'Record received money here once. Work entries do not add to your balance automatically.' : 'Enter what is in this account now. Your recorded income and expenses stay unchanged.';
    updateMoneyAccount();
    $('#allocation-popover').hidden = true;
    $('.allocation-trigger').setAttribute('aria-expanded','false');
    moneyDialog.showModal(); $('#income-amount').focus();
  }
  $('#add-income').addEventListener('click',() => openMoney('income'));
  $('#set-balances').addEventListener('click',() => openMoney('balance'));
  $('#income-account').addEventListener('change',updateMoneyAccount);
  moneyForm.addEventListener('submit',event => {
    event.preventDefault();
    try {
      const account = $('#income-account').value, cents = toCents($('#income-amount').value);
      if (!Number.isSafeInteger(cents)) throw new Error('Enter a valid amount.');
      if (moneyMode === 'income') save({id:uid(),kind:'income',account,cents,date:$('#income-date').value});
      else save({id:'opening:'+account,kind:'opening',account,cents:cents-accountBalance(read(),account,false)});
      moneyDialog.close();
    } catch(error) { $('#income-error').textContent = error.message; }
  });
  window.addEventListener('storage',event => { if (event.key === FINANCE_KEY) render(); });
  render();
}
