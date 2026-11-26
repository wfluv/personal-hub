const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const KEY='personal-hub:finances:v1';
const code=fs.readFileSync('src/cloud.js','utf8').replace(/export /g,'').replace('await import(LIB_URL)','await Promise.resolve({createClient:()=>fakeClient})');
function device(remote,initial=[]){
 const storage=new Map([[KEY,JSON.stringify(initial)]]);let status;
 const fakeClient={from:()=>({upsert:async(rows,options)=>{for(const row of Array.isArray(rows)?rows:[rows]){const key=row.user_id+':'+row.collection+':'+row.record_id;if(!options.ignoreDuplicates||!remote.has(key))remote.set(key,structuredClone(row))}return {error:null}},select:()=>({eq:async(_,id)=>({data:[...remote.values()].filter(r=>r.user_id===id).map(r=>structuredClone(r)),error:null})})}),auth:{getSession:async()=>({data:{session:{user:{id:'user1'}}}}),onAuthStateChange(){}}};
 const context=vm.createContext({fakeClient,localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},window:{setInterval(){},addEventListener(){}},document:{addEventListener(){}},queueMicrotask,console});
 vm.runInContext(code+'\nthis.api={initializeCloud,synchronize,queueCloudDiff};',context);
 return {storage,api:context.api,init:()=>context.api.initializeCloud({onChange(){},onStatus:s=>status=s,onUser(){}}),settle:async()=>{for(let i=0;i<100;i++){await new Promise(setImmediate);if(status==='Synced')return;}throw Error('Sync did not settle: '+status)}};
}
test('two offline devices upload distinct expenses, converge and do not duplicate after reload',async()=>{
 const remote=new Map(),a=device(remote),b=device(remote);
 const ra={id:'a',kind:'expense',account:'bank',cents:100,category:'groceries',date:'2026-11-24'},rb={...ra,id:'b',cents:200};
 for(const [d,r] of [[a,ra],[b,rb]]){d.storage.set(KEY,JSON.stringify([r]));d.api.queueCloudDiff(KEY,[],[r]);}
 await Promise.all([a.init(),b.init()]);await Promise.all([a.settle(),b.settle()]);await a.api.synchronize();await b.api.synchronize();
 assert.deepEqual(JSON.parse(a.storage.get(KEY)).map(r=>r.id).sort(),['a','b']);assert.deepEqual(JSON.parse(b.storage.get(KEY)).map(r=>r.id).sort(),['a','b']);
 const reload=device(remote,JSON.parse(a.storage.get(KEY)));await reload.init();await reload.settle();assert.equal(JSON.parse(reload.storage.get(KEY)).length,2);assert.equal(remote.size,2);
});
test('new budget change reaches second device and a deleted expense stays deleted',async()=>{
 const remote=new Map(),a=device(remote),b=device(remote);await a.init();await b.init();await Promise.all([a.settle(),b.settle()]);
 const record={id:'budget:2026-11:groceries',kind:'budget',month:'2026-11',category:'groceries',cents:25000};
 a.storage.set(KEY,JSON.stringify([record]));a.api.queueCloudDiff(KEY,[],[record]);await a.settle();await b.api.synchronize();assert.equal(JSON.parse(b.storage.get(KEY))[0].cents,25000);
 a.storage.set(KEY,'[]');a.api.queueCloudDiff(KEY,[record],[]);await a.settle();await b.api.synchronize();assert.deepEqual(JSON.parse(b.storage.get(KEY)),[]);
});
