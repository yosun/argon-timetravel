// Real CPU Blender + HTTP + WebGL integration. Only deliberate missing-asset failure is injected.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:3456';
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
 try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  const errors=[]; const realRequests=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(r.url().includes('/api/')) realRequests.push({url:r.url(),body:r.postData()});});
  await page.goto(base);
  await page.waitForFunction(()=>state.displayedWorld?.branchId==='orig');
  const root=await page.evaluate(()=>({objects:proceduralGroup.children[0].children.length,url:state.displayedWorld.url,year:state.displayedWorld.year,source:state.branches.orig.eras[0].eraBpyCode}));
  assert.ok(root.objects>100); assert.equal(root.year,2026); assert.equal(root.url,'/samples/worlds/2026.glb'); assert.match(root.source,/TIME_TRAVEL_DEMO/);
  console.log('PASS real startup geometry',root.objects,'objects');
  await page.evaluate(()=>jumpToKeyframe(1800));
  const intermediate=await page.evaluate(()=>({shown:state.displayedWorld.year,requested:state.activeYear,hero:dom.heroYearNumber.textContent,provenance:dom.heroEraProvenance.textContent,url:state.displayedWorld.url}));
  assert.equal(intermediate.shown,1566); assert.equal(intermediate.requested,1800); assert.equal(intermediate.hero,'1566'); assert.match(intermediate.provenance,/Requested 1800/); assert.equal(intermediate.url,'/samples/worlds/1566.glb');
  await page.evaluate(()=>Promise.all([jumpToKeyframe(1206),jumpToKeyframe(1938),jumpToKeyframe(2026)]));
  assert.deepEqual(await page.evaluate(()=>[state.displayedWorld.year,state.displayedWorld.url,proceduralGroup.children.length]),[2026,'/samples/worlds/2026.glb',1]);
  const started=Date.now();
  await page.click('#btnBranchA');
  await page.waitForFunction(()=>Object.values(state.branches).some(b=>b.parentId==='orig') && !state.isGeneratingHistory,{},{timeout:120000});
  await page.waitForFunction(()=>!state.isReturnWarpActive && !dom.btnApplyIntervention.disabled,{},{timeout:120000});
  const first=await page.evaluate(()=>{
    const branch=Object.values(state.branches).find(b=>b.parentId==='orig');
    return {id:branch.id,forkYear:branch.forkYear,source:branch.eras[0].eraBpyCode,meshNames:proceduralGroup.children[0].children.map(o=>o.name),url:state.displayedWorld.url};
  });
  assert.equal(first.forkYear,1206); assert.match(first.source,/"year":1206,"type":"lavabo"/); assert.ok(first.meshNames.some(n=>n.includes('Lavabo'))); assert.match(first.url,/\.cache\/demo_/);
  console.log('PASS default 1206 action: real CPU generated fountain',Date.now()-started,'ms');
  await page.reload();
  await page.waitForFunction(()=>state.displayedWorld?.branchId==='orig');
  await page.evaluate(id=>switchTimelineBranch(id),first.id);
  assert.equal(await page.evaluate(()=>state.round2),null);
  // Continue the restored branch, using its saved source with no reconstruction API call.
  await page.click('#btnBranchB');
  await page.waitForFunction(parent=>Object.values(state.branches).some(b=>b.parentId===parent),first.id,{timeout:120000});
  await page.waitForFunction(()=>!state.isReturnWarpActive && !dom.btnApplyIntervention.disabled,{},{timeout:120000});
  const second=await page.evaluate(parent=>{
    const branch=Object.values(state.branches).find(b=>b.parentId===parent);
    return {id:branch.id,parent:branch.parentId,forkYear:branch.forkYear,source:branch.eras.find(e=>e.year===1566).eraBpyCode,names:proceduralGroup.children[0].children.map(o=>o.name),count:Object.keys(state.branches).length,hero:dom.heroEraName.textContent};
  },first.id);
  assert.equal(second.parent,first.id); assert.equal(second.forkYear,1566); assert.equal(second.count,3);
  assert.match(second.source,/"type":"lavabo"/); assert.match(second.source,/"type":"astrolabe"/);
  assert.ok(second.names.some(n=>n.includes('Lavabo'))); assert.ok(second.names.some(n=>n.includes('Astrolabe'))); assert.match(second.hero,/Astrolabe/);
  assert.ok(!realRequests.some(r=>/mvp3-author|mvp3-rewrite|mvp3-critic|\/api\/depth/.test(r.url)));
  const demoRequests=realRequests.filter(r=>r.url.includes('/api/demo/causal')).map(r=>JSON.parse(r.body));
  assert.equal(demoRequests.length,2); assert.equal(demoRequests[1].parentId,first.id); assert.match(demoRequests[1].verifiedBpyCode,/"type":"lavabo"/);
  // Geometry AND metadata must remain attached to the displayed world after a failed load.
  const failed=await page.evaluate(async()=>{
    const before={branch:state.activeBranchKey,world:proceduralGroup.children[0].uuid,year:state.activeYear,hero:dom.heroEraName.textContent};
    state.branches.missing={id:'missing',contextId:state.branches[state.activeBranchKey].contextId,eras:[{year:2026,blenderGlbUrl:'/deliberately-missing.glb',eraTitle:'Wrong world'}]};
    const ok=await switchTimelineBranch('missing'); delete state.branches.missing;
    return {ok,before,after:{branch:state.activeBranchKey,world:proceduralGroup.children[0].uuid,year:state.activeYear,hero:dom.heroEraName.textContent},status:dom.statusBadge.textContent};
  });
  assert.equal(failed.ok,false); assert.deepEqual(failed.after,failed.before); assert.match(failed.status,/failed/i);
  await page.evaluate(id=>switchTimelineBranch(id),second.id);
  await page.screenshot({path:'/tmp/cloud-workbench-verified.png'});
  assert.deepEqual(errors,[]);
  console.log('PASS restored nested branch, parent source, inherited geometry, labels, failed asset retention; no page errors');
  console.log('REAL GENERATION demo wall time',Date.now()-started,'ms; no AI or depth mocks used');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
