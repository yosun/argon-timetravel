const {test}=require('node:test');
const assert=require('node:assert/strict');
const {sceneCode,planFork,parseSource}=require('../demo-worlds');
test('procedural generation includes exact fork dates and inherited intervention source',()=>{
 const a=planFork({forkYear:1206,interventionText:'In 1206, build a canopy',verifiedBpyCode:sceneCode(2026)});
 assert.deepEqual(a.eras.map(e=>e.year),[1206,1566,1938,2026]);
 assert.equal(parseSource(a.eras[0].eraBpyCode).interventions[0].type,'lavabo');
 const b=planFork({forkYear:1800,interventionText:'Parent canopy',interventionPrompt:'Plant a garden',verifiedBpyCode:a.eras[1].eraBpyCode});
 assert.deepEqual(b.eras.map(e=>e.year),[1800,1938,2026]);
 assert.deepEqual(parseSource(b.eras[0].eraBpyCode).interventions,[{year:1206,type:'lavabo'},{year:1800,type:'garden'}]);
 assert.throws(()=>planFork({forkYear:2027,interventionText:'canopy',verifiedBpyCode:sceneCode(2026)}));
 assert.throws(()=>planFork({forkYear:1206,interventionText:'unknown operation',verifiedBpyCode:sceneCode(2026)}));
});
