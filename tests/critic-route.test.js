const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const http = require('node:http');
const {spawn} = require('node:child_process');
const {once} = require('node:events');
const {responseCacheKey} = require('../gemini-inputs');
const {getConfig} = require('../gemini-client');

// A recorded model-response fixture, not a real visual-quality assessment.
// HTTP validation and cache decision handling are real; no model is called.
test('critic HTTP route rejects missing views and cannot accept a cached 4.8/10 draft', {timeout:15000}, async () => {
  const checkout = path.resolve(__dirname,'..');
  const reservation = http.createServer();
  await new Promise(resolve => reservation.listen(0,'127.0.0.1',resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const server = spawn(process.execPath,['server.js'],{cwd:checkout,
    env:{...process.env,PORT:String(port),GEMINI_API_KEY:''},stdio:'ignore'});
  const digest = value => crypto.createHash('sha256').update(value).digest('hex');
  const image = 'data:image/png;base64,' + Buffer.from(crypto.randomUUID()).toString('base64');
  const body = {originalImageDataUrl:image,bpyCode:'# Unverified fixture',roundNumber:1,
    fourViews:Object.fromEntries(['originalCam','threeQuarter','lowAngle','wireframe'].map(view => [view,image]))};
  const cacheFile = path.join(checkout,'.cache',responseCacheKey('mvp3_critic_v3_r1',{
    imageHash:digest(image),targetHash:digest(''),views:body.fourViews,telemetry:{},
    codeHash:digest(body.bpyCode).slice(0,16),roundNum:1,thinkingLevel:'MEDIUM'},getConfig().model));
  fs.mkdirSync(path.dirname(cacheFile),{recursive:true});
  fs.writeFileSync(cacheFile,JSON.stringify({data:{overallRatingOutOf10:4.8,passedThreshold:true,deficiencies:[]}}),{flag:'wx'});
  try {
    let ready = false;
    for(let i=0;i<80;i++) {
      try {const response=await fetch(`http://127.0.0.1:${port}/api/status`);if(response.ok){ready=true;break;}}
      catch(_) {}
      await new Promise(resolve=>setTimeout(resolve,30));
    }
    assert.equal(ready,true);
    const post = payload => fetch(`http://127.0.0.1:${port}/api/argon/mvp3-critic`,{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const incomplete = await post({...body,fourViews:{...body.fourViews,lowAngle:''}});
    assert.equal(incomplete.status,400);
    assert.match((await incomplete.json()).exactApiError.message,/lowAngle/);
    const cached = await post(body);
    assert.equal(cached.status,200);
    const result = await cached.json();
    assert.equal(result.cached,true);
    assert.equal(result.critique.overallRatingOutOf10,4.8);
    assert.equal(result.critique.passedThreshold,false);
    assert.equal(result.critique.acceptance.accepted,false);
  } finally {
    fs.rmSync(cacheFile,{force:true});
    if(server.exitCode === null) {const closed=once(server,'close');server.kill();await closed;}
  }
});
