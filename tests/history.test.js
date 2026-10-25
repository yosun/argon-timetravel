const {test}=require('node:test');
const assert=require('node:assert/strict');
const H=require('../history');
const {createNavigator}=require('../world-navigation');
test('forks preserve ancestors and siblings and freeze nested worlds',()=>{
 const branches={orig:H.freeze({id:'orig',eras:[{year:1206,world:'old'},{year:1566,world:'original'}]})};
 branches.a=H.fork(branches,'orig',1566,{eras:[{year:1206,world:'wrong'},{year:1566,world:'A'}]},'a');
 branches.b=H.fork(branches,'a',1938,{eras:[{year:1938,world:'B'}]},'b');
 assert.equal(branches.a.parentId,'orig'); assert.equal(branches.b.parentId,'a');
 assert.deepEqual(branches.b.eras.map(e=>e.world),['old','A','B']);
 assert.equal(branches.orig.eras[1].world,'original'); assert.ok(Object.isFrozen(branches.a.eras[0]));
 assert.throws(()=>H.fork(branches,'orig',1566,{},'a'));
});
test('intermediate dates hold the preceding world',()=>{
 const eras=[1206,1566,1938,2026].map(year=>({year}));
 for(const [date,expected] of [[1100,1206],[1400,1206],[1800,1566],[2000,1938],[2030,2026]]) assert.equal(H.eraAt(eras,date).year,expected);
});
test('out of order and failed loads preserve the latest successfully selected world',async()=>{
 const pending={}; let current='initial'; const discarded=[];
 const go=createNavigator(url=>new Promise((resolve,reject)=>pending[url]={resolve,reject}),world=>current=world,world=>discarded.push(world));
 const a=go('a'), b=go('b'); assert.equal(current,'initial');
 pending.b.resolve('B'); assert.equal(await b,true); pending.a.resolve('A'); assert.equal(await a,false);
 assert.equal(current,'B'); assert.deepEqual(discarded,['A']);
 const c=go('c'); pending.c.reject(new Error('404')); assert.equal(await c,false); assert.equal(current,'B');
});
