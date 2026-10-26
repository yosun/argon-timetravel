const {test}=require('node:test');
const assert=require('node:assert/strict');
const {create}=require('../history-storage');
function storageFixture() {
 let saved=JSON.stringify({branches:{old:{id:'old'}},contexts:{}});
 const records=new Map();
 const storage={getItem:()=>saved,setItem:(key,value)=>{
  const envelope=JSON.parse(value);
  if(Object.values(envelope.contexts||{}).some(context=>context.photoDataUrl)) throw Object.assign(new Error('forced quota'),{name:'QuotaExceededError'});
  saved=value;
 }};
 const database={putAll:async contexts=>{for(const [id,context]of Object.entries(contexts))records.set(id,structuredClone(context));},getAll:async ids=>Object.fromEntries(ids.map(id=>[id,records.get(id)]))};
 return {storage,database,read:()=>saved};
}
test('forced quota saves image contexts separately and hydrates an equivalent reload',async()=>{
 const fixture=storageFixture();
 const envelope={branches:{new:{id:'new',contextId:'photo'}},contexts:{photo:{photoDataUrl:'large uploaded photograph',metricSummary:{fovYDeg:64}}}};
 assert.equal((await create(fixture).save('history',envelope)).contextStorage,'indexeddb');
 const compact=JSON.parse(fixture.read());assert.equal(compact.contextStorage,'indexeddb');
 assert.deepEqual(compact.contexts.photo,{storage:'indexeddb',key:'photo'});
 assert.equal(envelope.contexts.photo.photoDataUrl,'large uploaded photograph');
 const reload=await create(fixture).load('history');
 assert.deepEqual(reload.branches,envelope.branches);assert.deepEqual(reload.contexts,envelope.contexts);
});
test('failed source transaction preserves the complete old history record',async()=>{
 const fixture=storageFixture();const before=fixture.read();
 fixture.database.putAll=async()=>{throw new Error('storage unavailable');};
 await assert.rejects(create(fixture).save('history',{branches:{new:{}},contexts:{p:{photoDataUrl:'large photo'}}}),/storage unavailable/);
 assert.equal(fixture.read(),before);
});
test('nonquota browser storage failures do not attempt source migration',async()=>{
 let called=false;
 const store=create({storage:{setItem:()=>{throw Object.assign(new Error('denied'),{name:'SecurityError'});}},database:{putAll:async()=>{called=true;}}});
 await assert.rejects(store.save('history',{contexts:{}}),/denied/);assert.equal(called,false);
});
