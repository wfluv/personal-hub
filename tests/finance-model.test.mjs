import {test} from 'node:test';
import assert from 'node:assert/strict';
import {migrateLegacy,categoryTotals,accountBalance,toCents,validRecord,validDate} from '../src/finance-model.js';
test('legacy totals retained without deducting account balances, idempotent across devices',()=>{
 const old={'2026-11:groceries':{spent:124,limit:250}};
 const a=migrateLegacy(old,[]), b=migrateLegacy(old,[]);
 const merged=[...new Map([...a,...b].map(r=>[r.id,r])).values()];
 assert.deepEqual(migrateLegacy(old,a),a);
 assert.deepEqual(categoryTotals(merged,'2026-11','groceries'),{spent:12400,limit:25000});
 assert.equal(accountBalance(merged,'bank'),0);
 const diff=migrateLegacy({'2026-11:groceries':{spent:150,limit:250}},merged);
 assert.equal(categoryTotals(diff,'2026-11','groceries').spent,15000);
});
test('income and expenses affect only selected accounts, month budgets remain independent',()=>{
 const records=[{id:'opening:bank',kind:'opening',account:'bank',cents:50000},{id:'income1',kind:'income',account:'bank',cents:100000,date:'2026-11-24'},
 {id:'expense1',kind:'expense',account:'bank',category:'groceries',cents:1240,date:'2026-11-24'},
 {id:'expense2',kind:'expense',account:'cash',category:'groceries',cents:325,date:'2026-11-24'}];
 assert.equal(accountBalance(records,'bank'),148760);assert.equal(accountBalance(records,'cash'),-325);
 assert.deepEqual(categoryTotals(records,'2026-11','groceries'),{spent:1565,limit:0});
 assert.deepEqual(categoryTotals(records,'2026-12','groceries'),{spent:0,limit:0});
 const baseline=70000-accountBalance(records,'bank',false);
 records[0].cents=baseline;assert.equal(accountBalance(records,'bank'),70000);
});
test('offline expenses merge as records, never as overwritten totals',()=>{
 const a={id:'a',kind:'expense',account:'bank',category:'groceries',cents:10,date:'2026-11-24'};
 const b={...a,id:'b',cents:20};
 const merged=[...new Map([a,b,a].map(r=>[r.id,r])).values()];
 assert.equal(categoryTotals(merged,'2026-11','groceries').spent,30);
 assert.equal(accountBalance(merged,'bank'),-30);
});
test('money and dates are validated without rounding drift',()=>{
 assert.equal(toCents(1.005),101);assert.equal(toCents(0.1)+toCents(0.2),30);
 assert.equal(validDate('2026-02-30'),false);
 assert.equal(validRecord({id:'bad',kind:'income',account:'bank',cents:NaN,date:'2026-11-24'}),false);
 assert.equal(validRecord({id:'bad',kind:'income',account:'unknown',cents:100,date:'2026-11-24'}),false);
 assert.equal(validRecord({id:'bad',kind:'expense',account:'bank',cents:-100,category:'groceries',date:'2026-11-24'}),false);
});
