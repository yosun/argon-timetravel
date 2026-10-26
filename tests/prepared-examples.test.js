// Synthetic artifacts test the integrity/acceptance gate, never visual quality.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const {VIEWS, validateManifest, load, eligibility, inspectGlb, renderSetIdentity, toHistoryBundle} = require('../prepared-examples');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function triangleGlb(extra = {}) {
  const gltf = {asset:{version:'2.0'}, scenes:[{nodes:[0]}], scene:0, nodes:[{mesh:0}], meshes:[{primitives:[{attributes:{POSITION:0},indices:1}]}],
    buffers:[{byteLength:44}], bufferViews:[{buffer:0,byteOffset:0,byteLength:36},{buffer:0,byteOffset:36,byteLength:6}],
    accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[0,0,0],max:[1,1,0]},{bufferView:1,componentType:5123,count:3,type:'SCALAR'}], ...extra};
  const json = Buffer.from(JSON.stringify(gltf));
  const chunk = Buffer.concat([json, Buffer.alloc((4-json.length%4)%4,0x20)]);
  const bin = Buffer.alloc(44); [0,0,0,1,0,0,0,1,0].forEach((v,i)=>bin.writeFloatLE(v,i*4)); [0,1,2].forEach((v,i)=>bin.writeUInt16LE(v,36+i*2));
  const result = Buffer.alloc(12+8+chunk.length+8+bin.length);
  result.writeUInt32LE(0x46546c67,0); result.writeUInt32LE(2,4); result.writeUInt32LE(result.length,8);
  result.writeUInt32LE(chunk.length,12); result.writeUInt32LE(0x4e4f534a,16); chunk.copy(result,20);
  const offset = 20+chunk.length; result.writeUInt32LE(bin.length,offset); result.writeUInt32LE(0x004e4942,offset+4); bin.copy(result,offset+8);
  return result;
}
function fixture() {
  const artifacts = {}, bytes = {};
  const add = (id, data, type, suffix) => {bytes[id] = Buffer.from(data); const sha256 = hash(bytes[id]); artifacts[id]={path:`${id}-${sha256}.${suffix}`,sha256,bytes:bytes[id].length,mediaType:type};};
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/y9sAAAAASUVORK5CYII=','base64');
  add('source','# Synthetic source fixture; not an authored scene.\n','text/x-python','py');
  add('world',triangleGlb(),'model/gltf-binary','glb');
  add('reference',png,'image/png','png'); add('target',png,'image/png','png');
  add('worker','# Synthetic render receipt fixture; no actual render performed.\n','text/x-python','py');
  add('critic',JSON.stringify({overallScore:92,passedThreshold:true,findings:[]}),'application/json','json');
  const camera = {position:[0,0,0],lookAt:[0,0,-1],fovYDeg:60};
  const views = Object.fromEntries(VIEWS.map(view => {add(view,png,'image/png','png');return [view,{artifactId:view,camera}];}));
  const manifest = {schemaVersion:1,id:'synthetic-fixture',title:'Synthetic gate fixture',provenance:'generated_prepared_example',year:2026,narrative:'Synthetic test data, not visual acceptance.',
    artifacts, source:{artifactId:'source',selfContained:true,assetIds:[]},world:{artifactId:'world',sourceSha256:artifacts.source.sha256},
    context:{referenceArtifactId:'reference',metricSummary:{},cameraPresets:{originalCam:camera}},targetArtifactIds:['target'],
    renderSet:{id:'render-fixture',glbSha256:artifacts.world.sha256,method:'exported-glb-reimport',renderer:{name:'Fixture',version:'1',device:'CPU'},recordedAt:'2026-10-25T10:00:00Z',workerArtifactId:'worker',views},
    critic:{artifactId:'critic',provider:'fixture',model:'fixture',recordedAt:'2026-10-25T10:01:00Z',independent:true,score:9.2,scale:10,sourceScale:100,scorePointer:'/overallScore',acceptancePointer:'/passedThreshold',blockingFindingsPointer:'/findings',renderSetId:'render-fixture',glbSha256:artifacts.world.sha256},
    review:{status:'accepted',executionHost:'cloud',reviewer:'synthetic fixture',recordedAt:'2026-10-25T10:02:00Z',glbSha256:artifacts.world.sha256,renderSetId:'render-fixture',criticSha256:artifacts.critic.sha256}};
  manifest.renderSet.sha256=hash(Buffer.from(renderSetIdentity(manifest)));
  manifest.critic.renderSetSha256=manifest.renderSet.sha256;
  manifest.review.renderSetSha256=manifest.renderSet.sha256;
  return {manifest,bytes,readArtifact:async a=>bytes[Object.keys(artifacts).find(id=>artifacts[id].path===a.path)]};
}
test('prepared manifest rejects traversal, mutable world URLs and inferred dating',()=>{
  for (const value of ['../secret','/outside/file','dir/../file','https://example.com/file','file%2epy','dir\\file']) {
    const f=fixture(); f.manifest.artifacts.source.path=value; assert.throws(()=>validateManifest(f.manifest),/safe relative/);
  }
  const f=fixture(); f.manifest.artifacts.world.path='scene.glb'; assert.throws(()=>validateManifest(f.manifest),/immutable/);
  delete f.manifest.year; assert.throws(()=>validateManifest(f.manifest),/represented year/);
});
test('loader verifies every artifact before producing a separate single-year history bundle',async()=>{
  const f=fixture(), loaded=await load(f.manifest,f);
  assert.equal(loaded.promotion.eligible,true); assert.equal(loaded.promotion.minimumScore,9);
  const bundle=toHistoryBundle(loaded,{artifactUrl:a=>`/samples/prepared/fixture/${a.path}`});
  assert.equal(bundle.branch.parentId,null); assert.equal(bundle.branch.forkYear,null); assert.equal(bundle.branch.demo,false);
  assert.notEqual(bundle.branch.id,'orig'); assert.ok(bundle.branch.id.endsWith(f.manifest.artifacts.world.sha256));
  assert.equal(bundle.branch.eras.length,1); assert.equal(bundle.branch.eras[0].year,2026);
  assert.equal(bundle.branch.eras[0].eraBpyCode,f.bytes.source.toString()); assert.ok(Object.isFrozen(bundle.branch));
  assert.equal(bundle.context.photoDataUrl,`data:image/png;base64,${f.bytes.reference.toString('base64')}`);
  assert.equal(eligibility(validateManifest(f.manifest)).eligible,false);
  assert.throws(()=>toHistoryBundle({...loaded},{artifactUrl:a=>a.path}),/verify/);
});
test('corrupted artifacts and external GLB resources fail integrity loading',async()=>{
  const f=fixture(); f.bytes.source[0]^=1;
  await assert.rejects(load(f.manifest,f),/SHA-256 differs/);
  assert.throws(()=>inspectGlb(triangleGlb({images:[{uri:'texture.png'}]})),/external/);
});
test('GLB inspection rejects JSON-only, empty accessors and incomplete or wrong mesh buffer ranges',()=>{
  const json=Buffer.from(JSON.stringify({asset:{version:'2.0'},meshes:[{primitives:[{attributes:{POSITION:0}}]}],accessors:[{type:'VEC3',count:0}]}));
  const chunk=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,0x20)]), jsonOnly=Buffer.alloc(20+chunk.length);
  jsonOnly.writeUInt32LE(0x46546c67,0);jsonOnly.writeUInt32LE(2,4);jsonOnly.writeUInt32LE(jsonOnly.length,8);jsonOnly.writeUInt32LE(chunk.length,12);jsonOnly.writeUInt32LE(0x4e4f534a,16);chunk.copy(jsonOnly,20);
  assert.throws(()=>inspectGlb(jsonOnly),/actual complete embedded binary/);
  for (const extra of [
    {accessors:[{bufferView:0,componentType:5126,count:0,type:'VEC3'}]},
    {accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC2'}]},
    {accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',byteOffset:12}]},
    {bufferViews:[{buffer:0,byteLength:60}]},
    {bufferViews:[{buffer:1,byteLength:36}]},
    {bufferViews:[{buffer:0,byteLength:36,target:34963}]},
    {buffers:[{byteLength:80}]}
  ]) assert.throws(()=>inspectGlb(triangleGlb(extra)),/buffer|POSITION/);
  assert.equal(inspectGlb(triangleGlb()).embeddedImages,0);
});
test('unverified drafts remain inspectable but cannot be promoted',async()=>{
  const f=fixture(); delete f.manifest.renderSet; delete f.manifest.critic; delete f.manifest.review;
  const loaded=await load(f.manifest,f);
  assert.equal(loaded.promotion.eligible,false); assert.match(loaded.promotion.label,/UNVERIFIED/);
  assert.ok(loaded.promotion.reasons.some(reason=>reason.includes('9/10')));
  assert.equal(toHistoryBundle(loaded,{artifactUrl:a=>a.path}).branch.visualAcceptance.eligible,false);
});
test('rejected scores, wrong score receipts, missing close-ups and wrong artifact ancestry block promotion',async()=>{
  const mutations=[
    m=>{m.critic.score=4.8;},
    m=>{m.critic.score=9.9;},
    m=>{delete m.renderSet.views.clockDetail;},
    m=>{m.renderSet.method='source-blend-render';},
    m=>{m.renderSet.glbSha256='0'.repeat(64);},
    m=>{m.critic.independent=false;},
    m=>{delete m.critic.blockingFindingsPointer;},
    m=>{m.review.status='rejected';},
    m=>{m.review.criticSha256='0'.repeat(64);},
    m=>{m.renderSet.views.clockDetail.camera.fovYDeg=35;},
    m=>{m.targetArtifactIds=[];}
  ];
  for(const mutate of mutations){const f=fixture(); mutate(f.manifest); const loaded=await load(f.manifest,f); assert.equal(loaded.promotion.eligible,false);}
});
test('high numeric grade cannot override a raw rejection or blocking severity finding',async()=>{
  const responses=[{overallScore:92,passedThreshold:false,findings:[]},...['high',' critical ','blocker','release-blocking','release blocking','release_blocking'].map(severity=>({overallScore:92,passedThreshold:true,findings:[{severity,message:'Leaves remain ribbons'}]}))];
  for(const response of responses) {
    const f=fixture(); f.bytes.critic=Buffer.from(JSON.stringify(response));
    f.manifest.artifacts.critic.bytes=f.bytes.critic.length;
    f.manifest.artifacts.critic.sha256=hash(f.bytes.critic);
    f.manifest.review.criticSha256=f.manifest.artifacts.critic.sha256;
    const loaded=await load(f.manifest,f); assert.equal(loaded.promotion.eligible,false);
    assert.ok(loaded.promotion.reasons.some(reason=>/actual critic response/.test(reason)));
  }
});
