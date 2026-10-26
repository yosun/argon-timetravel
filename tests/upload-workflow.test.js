// Client workflow tests with mocked API replies: these do not run AI inference.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function uploadedApp(authoringReady,depthAvailable=true,readinessError='missing_api_key') {
 const records=new Map(),requests=[];
 const context=vm.createContext({console,Response,TextDecoder,setTimeout,clearTimeout,
  crypto:require('node:crypto').webcrypto,
  CausalHistory:require('../history'),WorldNavigation:require('../world-navigation'),
  THREE:{Vector3:class{},Quaternion:class{}},window:{addEventListener(){}},
  Image:class {constructor(){this.naturalWidth=8;this.naturalHeight=6;}set src(value){this.value=value;queueMicrotask(()=>this.onload());}},
  localStorage:{getItem:key=>records.get(key)||null,setItem:(key,value)=>records.set(key,value)},
  fetch:async(url,options)=>{
   const body=options?.body ? JSON.parse(options.body) : null;requests.push({url,body});
   if(url==='/api/status')return new Response(JSON.stringify({ok:true,authoringProvider:'gemini',model:authoringReady?'test-model':null,liveGenerationAvailable:authoringReady,readinessError:authoringReady?null:readinessError}));
   if(url==='/api/depth-status')return new Response(JSON.stringify({ok:true,apiKeyConfigured:true,depthAvailable,message:depthAvailable?'':'The AI3D depth service is not running. Start it in the cloud.'}));
   if(url==='/api/depth')return new Response(JSON.stringify({ok:true,intrinsics:{fovYDeg:64},depthVisualizationDataUrl:'depth'}));
   if(url==='/api/argon/mvp3-author')return new Response(JSON.stringify({ok:true,round1:{bpyCode:'authored uploaded architecture',blenderGlbUrl:'/r1.glb',blenderTelemetry:{objectCount:3,totalTriangles:12}}}));
   if(url==='/api/argon/mvp3-critic')return new Response(JSON.stringify({ok:true,critique:{overallRatingOutOf10:body.roundNumber===1?4:6,deficiencies:[]}}));
   if(url==='/api/argon/mvp3-rewrite')return new Response(JSON.stringify({ok:true,round2:{rewrittenBpyCode:'rewritten uploaded architecture',blenderGlbUrl:'/r2.glb',blenderTelemetry:{objectCount:4,totalTriangles:20}}}));
   throw new Error('Unexpected endpoint '+url);
  }
 });
 vm.runInContext(fs.readFileSync(require.resolve('../app.js'),'utf8'),context);
 const run=code=>vm.runInContext(code,context);
 run(`
 state.isInitializing=false;
 dom={stageButtons:[],camButtons:[],keyframeNodes:{},threeCanvas:{toDataURL:()=> 'mock diagnostic view'},
 statusBadge:{},heroYearNumber:{},heroYearSuffix:{},heroEraName:{},heroEraProvenance:{},
 liveImagePanel:{hidden:false},liveImageStatus:{dataset:{}},btnReconstructImage:{disabled:false},btnCancelImage:{disabled:false}};
 renderer={render(){}};scene={remove(){}};camera={updateProjectionMatrix(){}};proceduralGroup={visible:true};
 renderHistoryNavigator=()=>{};renderCausalInspector=()=>{};updateMetricsDisplay=()=>{};
 renderCriticInspector=()=>{};updateCodeEditorView=()=>{};addCallLog=()=>{};
 captureFourDiagnosticScreenshots=async()=>({originalCam:'view',threeQuarter:'view',lowAngle:'view',wireframe:'view'});
 displayFourDiagnosticScreenshots=()=>{};computeImageSimilarityMetrics=async()=>({ssim:0.5});computeAverageGroundElevationError=()=>0;
 loadBlenderGlbIntoScene=async()=>true;
 buildMoge3DMeshAndExtractSummary=data=>{state.metricSummary={fovYDeg:data.intrinsics.fovYDeg,groundYThree:-1.7};};
 state.branches.orig={id:'orig',contextId:'original',demo:true,eras:[{year:2026,blenderGlbUrl:'/original.glb'}]};
 state.historyContexts.original={photoDataUrl:'original photograph'};state.photoDataUrl='original photograph';state.loadedContextId='original';
 state.pendingUpload={id:'upload',name:'new-photo.png',dataUrl:'uploaded photograph',image:{},phase:'selected'};
 `);
 return {run,records,requests};
}
test('mocked depth-only success stops honestly before architecture when the Gemini API is not configured',async()=>{
 const app=uploadedApp(false);const result=await app.run('reconstructUploadedImage()');
 assert.equal(result.depthReady,true);assert.equal(result.ok,false);assert.equal(result.blocker,'credentials');
 assert.deepEqual(app.requests.filter(r=>r.body).map(r=>r.url),['/api/depth']);
 assert.equal(app.requests.find(r=>r.url==='/api/depth').body.imageDataUrl,'uploaded photograph');
 assert.equal(app.run('Object.keys(state.branches).length'),1);
 assert.equal(app.run('state.displayedWorld.kind'),'depth');assert.equal(app.run('state.activeBranchKey'),null);
 assert.match(app.run('dom.liveImageStatus.textContent'),/Depth ready;.*GEMINI_API_KEY.*GEMINI_MODEL/);
 assert.equal(app.run('state.isGeneratingHistory'),false);assert.equal(app.run('state.isReconstructingImage'),false);
});
test('mocked complete upload pipeline sends the new photo through all stages and persists its root',async()=>{
 const app=uploadedApp(true);const result=await app.run('reconstructUploadedImage()');
 assert.equal(result.ok,true);assert.equal(result.criticAvailable,true);
 const operations=app.requests.filter(r=>r.body);
 assert.deepEqual(operations.map(r=>r.url),['/api/depth','/api/argon/mvp3-author','/api/argon/mvp3-critic','/api/argon/mvp3-rewrite','/api/argon/mvp3-critic']);
 for(const request of operations)assert.equal(request.body.imageDataUrl||request.body.originalImageDataUrl,'uploaded photograph');
 const saved=JSON.parse(app.records.get('timetravel.histories.v2'));
 const root=saved.branches[result.rootId];assert.ok(root);assert.equal(root.parentId,null);
 assert.equal(root.eras[0].eraBpyCode,'rewritten uploaded architecture');
 assert.equal(saved.contexts[root.contextId].photoDataUrl,'uploaded photograph');assert.equal(saved.contexts[root.contextId].metricSummary.fovYDeg,64);
 assert.ok(saved.branches.orig);assert.equal(saved.contexts.original.photoDataUrl,'original photograph');
 assert.equal(app.run('state.pendingUpload'),null);assert.equal(app.run('state.isGeneratingHistory'),false);
});

test('mocked unavailable depth service stops before paid or unreachable POST requests',async()=>{
 const app=uploadedApp(true,false);const result=await app.run('reconstructUploadedImage()');
 assert.equal(result.ok,false);assert.equal(result.depthReady,false);
 assert.deepEqual(app.requests.filter(request=>request.body),[]);
 assert.match(app.run('dom.liveImageStatus.textContent'),/AI3D depth service is not running/);
 assert.equal(app.run('state.photoDataUrl'),'original photograph');
});

test('mocked missing Gemini model gives model-specific setup guidance without exposing keys',async()=>{
 const app=uploadedApp(false,true,{code:'missing_model',message:'Select an accessible model'});
 const result=await app.run('reconstructUploadedImage()');
 assert.equal(result.depthReady,true);assert.equal(result.blocker,'configuration');
 assert.match(app.run('dom.liveImageStatus.textContent'),/Choose an accessible GEMINI_MODEL/);
 assert.deepEqual(app.requests.filter(request=>request.body).map(request=>request.url),['/api/depth']);
});
