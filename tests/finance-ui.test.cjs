const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
class Element{constructor(){this.value='';this.children=[];this.listeners={};this.elements={};this.validity={valid:true};this.hidden=false;}addEventListener(type,callback){this.listeners[type]=callback}setAttribute(){}replaceChildren(){this.children=[]}append(...items){this.children.push(...items)}showModal(){this.open=true}close(){this.open=false}focus(){}}
const model=fs.readFileSync('src/finance-model.js','utf8').replaceAll('export ','');
const ui=fs.readFileSync('src/finance.js','utf8').replace(/^import .*;\n/gm,'').replaceAll('export ','');
test('income, starting balance, account-specific expenses and separate budget UI keep existing totals',()=>{
 const elements={},$=s=>elements[s]??=new Element();$('#budget-form').elements={spent:new Element(),limit:new Element()};
 const data=new Map([['personal-hub:category-budgets:v1',JSON.stringify({'2026-11:groceries':{spent:124,limit:250}})]]),queued=[];
 vm.runInNewContext(model+'\n'+ui+'\ninitFinance();',{document:{querySelector:$,createElement:()=>new Element()},window:{addEventListener(){}},localStorage:{getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)},crypto:{randomUUID:()=>String(queued.length)},Intl,Date,Number,JSON,Math,Error,queueCloudDiff:(...args)=>queued.push(args)});
 const click=id=>$(id).listeners.click(),submit=id=>$(id).listeners.submit({preventDefault(){}}),read=()=>JSON.parse(data.get('personal-hub:finances:v1'));
 $('#income-account').value='bank';click('#set-balances');$('#income-amount').value='500';submit('#income-form');assert.equal($('.balance-amount').textContent,'€500.00');
 click('#add-income');$('#income-amount').value='100';$('#income-date').value='2026-11-24';submit('#income-form');assert.equal($('.balance-amount').textContent,'€600.00');
 $('#budget-month').value='2026-11';$('#budget-month').listeners.change();$('#finance-budgets').children[0].listeners.click();$('#budget-form').elements.spent.value='12.50';$('#expense-account').value='bank';$('#expense-date').value='2026-11-24';submit('#budget-form');assert.equal($('.balance-amount').textContent,'€587.50');
 assert.ok($('#finance-budgets').children[0].innerHTML.includes('€136.50'));
 $('#finance-budgets').children[0].listeners.click();assert.equal($('#budget-form').elements.spent.value,'');click('#budget-edit-limit');$('#budget-form').elements.limit.value='300';submit('#budget-form');assert.equal($('.balance-amount').textContent,'€587.50');assert.equal(read().find(r=>r.kind==='budget').cents,30000);
 $('#income-account').value='cash';click('#add-income');$('#income-amount').value='25';$('#income-date').value='2026-11-24';submit('#income-form');assert.equal($('.balance-amount').textContent,'€612.50');
 assert.equal($('#finance-allocation').children[1].children[1].textContent,'€25.00');assert.equal(read().filter(r=>r.kind==='expense').length,1);assert.equal(queued.length,5);
});
