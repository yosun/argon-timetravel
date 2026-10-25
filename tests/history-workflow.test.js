const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const CausalHistory=require('../history');
const WorldNavigation=require('../world-navigation');
function app() {
  const storage=new Map();
  const context=vm.createContext({
    console, CausalHistory, WorldNavigation, Response, TextDecoder,
    crypto:require('node:crypto').webcrypto,
    THREE:{Vector3:class{},Quaternion:class{}},
    window:{addEventListener(){}},
    Image:class { set src(value) { this.value=value;queueMicrotask(()=>this.onload()); } },
    localStorage:{setItem:(k,v)=>storage.set(k,v), getItem:k=>storage.get(k)||null},
    setTimeout,clearTimeout,
    fetch:async()=>{throw new Error('Unexpected fetch');}
  });
  vm.runInContext(fs.readFileSync(require.resolve('../app.js'),'utf8'),context);
  vm.runInContext(`
    dom={stageButtons:[],keyframeNodes:{}, threeCanvas:{toDataURL:()=> 'data:image/png;base64,test'},
      statusBadge:{}, heroYearNumber:{},heroYearSuffix:{},heroEraName:{},heroEraProvenance:{}};
    renderer={render(){}};scene={remove(){}};camera={updateProjectionMatrix(){}};
    renderHistoryNavigator=()=>{};renderCausalInspector=()=>{}; updateMetricsDisplay=()=>{};
    loadBlenderGlbIntoScene=async()=>true;executeCinematicReturnToPresent=async()=>{};
    saveMilestoneToGallery=async()=>{}; addCallLog=()=>{};closeInterventionModal=()=>{};
  `,context);
  return {context,storage,run:code=>vm.runInContext(code,context)};
}
test('suggested and explicit intervention dates override the current present',()=>{
 assert.equal(CausalHistory.interventionYear('In 1206, add a fountain',undefined,2026),1206);
 assert.equal(CausalHistory.interventionYear('In 1206, add a fountain',1566,2026),1566);
 assert.equal(CausalHistory.interventionYear('Add a fountain',undefined,1938),1938);
});
test('forks preserve the source context and procedural provenance',()=>{
 const parent={id:'p',demo:true,contextId:'photo-1',eras:[{year:1206,eraBpyCode:'parent'}]};
 const fork=CausalHistory.fork({p:parent},'p',1566,{eras:[{year:1566,eraBpyCode:'changed'}]},'c');
 assert.equal(fork.contextId,'photo-1');assert.equal(fork.demo,true);
 assert.throws(()=>CausalHistory.fork({p:parent},'p',2027,{eras:[{year:2026}]},'c'),/no world/);
});
test('failed navigation retains displayed history, date and labels',async()=>{
 const a=app();
 a.run(`state.activeBranchKey='good';state.activeYear=2026;dom.heroEraName.textContent='Original visible world';
 state.branches.bad={id:'bad',eras:[{year:1206,blenderGlbUrl:'/bad.glb'}]};
 loadBlenderGlbIntoScene=async()=>false;`);
 assert.equal(await a.run("syncWorldToYear(1206,'bad')"),false);
 assert.equal(a.run('state.activeBranchKey'),'good');assert.equal(a.run('state.activeYear'),2026);
 assert.equal(a.run('dom.heroEraName.textContent'),'Original visible world');
 assert.match(a.run('dom.statusBadge.textContent'),/load failed/);
});
test('missing historical geometry is explicitly labeled by the resolved world',async()=>{
 const a=app();
 a.run(`state.branches.present={id:'present',branchTitle:'Reconstruction',eras:[{year:2026,eraTitle:'Measured present',blenderGlbUrl:'/2026.glb'}]};`);
 assert.equal(await a.run("syncWorldToYear(1206,'present')"),true);
 assert.equal(a.run('dom.heroYearNumber.textContent'),'2026');
 assert.match(a.run('dom.heroEraProvenance.textContent'),/Requested 1206; showing available 2026/);
 assert.equal(a.run('dom.heroEraName.textContent'),'Measured present');
});
test('a restored parent continues from its source without a new reconstruction',async()=>{
 const a=app(); let request;
 a.context.fetch=async(url,options)=>{
  assert.equal(url,'/api/argon/mvp3-causal-stream');request=JSON.parse(options.body);
  return new Response(JSON.stringify({phase:'done',payload:{ok:true,causalSimulation:{eras:[{year:1566,eraBpyCode:'new source',blenderGlbUrl:'/new.glb'}]}}})+'\n');
 };
 a.run(`state.round2=null;state.activeBranchKey='saved';
 state.historyContexts.ctx={photoDataUrl:'saved photograph',metricSummary:{fovYDeg:60}};
 state.loadedContextId='other';state.photoDataUrl='wrong photograph';state.metricSummary={fovYDeg:90};
 state.branches.saved={id:'saved',contextId:'ctx',eras:[{year:1206,eraBpyCode:'saved parent source',blenderGlbUrl:'/parent.glb'}]};
 step4RewriteAndRerenderRound2=async()=>{throw new Error('Must not reconstruct a restored parent');};`);
 const id=await a.run("step5RunMultiEpochCausalSimulation('In 1566, add an astrolabe')");
 assert.equal(request.verifiedBpyCode,'saved parent source');assert.equal(request.forkYear,1566);
 assert.equal(request.originalImageDataUrl,'saved photograph');assert.equal(request.metricSummary.fovYDeg,60);
 assert.equal(a.run(`state.branches['${id}'].parentId`),'saved');
 assert.ok(a.storage.has('timetravel.histories.v2'));
});
test('reconstruction roots persist immediately with their reference photo and calibration',async()=>{
 const a=app();
 a.context.fetch=async url=>new Response(JSON.stringify(url.includes('rewrite')
  ? {ok:true,round2:{rewrittenBpyCode:'root source',blenderGlbUrl:'/root.glb',blenderTelemetry:{}}}
  : {ok:true,critique:{overallRatingOutOf10:5}}));
 a.run(`state.photoDataUrl='data:image/png;base64,source';state.metricSummary={fovYDeg:63};state.critiqueR1={};state.round1={};
 captureFourDiagnosticScreenshots=async()=>({originalCam:'image'});displayFourDiagnosticScreenshots=()=>{};
 computeImageSimilarityMetrics=async()=>({});computeAverageGroundElevationError=()=>0;
 updateCodeEditorView=()=>{};renderCriticInspector=()=>{};`);
 await a.run('step4RewriteAndRerenderRound2()');
 const saved=JSON.parse(a.storage.get('timetravel.histories.v2'));
 const root=Object.values(saved.branches).find(b=>b.branchTitle==='Reconstructed present');
 assert.ok(root);assert.equal(root.eras[0].eraBpyCode,'root source');
 assert.equal(saved.contexts[root.contextId].photoDataUrl,'data:image/png;base64,source');
 assert.equal(saved.contexts[root.contextId].metricSummary.fovYDeg,63);
});

test('generation refuses concurrent actions and failed destination retains causal state',async()=>{
 const a=app(); let release;
 const responseReady=new Promise(resolve=>{release=resolve;});
 a.context.fetch=async()=>{await responseReady;return new Response(JSON.stringify({phase:'done',payload:{ok:true,causalSimulation:{eras:[{year:1566,eraBpyCode:'child',blenderGlbUrl:'/bad.glb'}]}}})+'\n');};
 a.run(`state.activeBranchKey='saved';state.activeYear=2026;state.causalSimulation={branchTitle:'Original visible causal history'};
 state.historyContexts.ctx={photoDataUrl:'saved photograph'};state.loadedContextId='ctx';
 state.branches.saved={id:'saved',contextId:'ctx',eras:[{year:1206,eraBpyCode:'parent',blenderGlbUrl:'/parent.glb'}]};
 dom.btnBranchA={disabled:false};dom.btnStep1Ground={disabled:true};
 loadBlenderGlbIntoScene=async()=>false;`);
 const first=a.run("step5RunMultiEpochCausalSimulation('In 1566, add an astrolabe')");
 assert.equal(a.run('state.isGeneratingHistory'),true);
 assert.equal(a.run('dom.btnBranchA.disabled'),true);
 assert.equal(await a.run("step5RunMultiEpochCausalSimulation('In 1206, add another object')"),false);
 assert.equal(await a.run("syncWorldToYear(1206,'saved')"),false);
 assert.equal(await a.run("switchTimelineBranch('saved')"),false);
 release();
 await assert.rejects(first,/could not be loaded/);
 assert.equal(a.run('state.causalSimulation.branchTitle'),'Original visible causal history');
 assert.equal(a.run('state.activeBranchKey'),'saved');
 assert.equal(a.run('state.isGeneratingHistory'),false);
 assert.equal(a.run('dom.btnBranchA.disabled'),false);
 assert.equal(a.run('dom.btnStep1Ground.disabled'),true);
});
