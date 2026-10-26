const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const { once } = require('node:events');
const { validateBlenderResult } = require('../blender-result');

const checkout = path.join(__dirname, '..');
const cache = path.join(checkout, '.cache');
const blender = process.env.BLENDER_PATH || 'blender';
const available = spawnSync(blender, ['--version'], { encoding:'utf8', timeout:10000 }).status === 0;
const hash = text => crypto.createHash('sha256').update(text).digest('hex');

// Only the already-produced AI plan is a fixture. Every Blender invocation, HTTP
// request, failure response, and repaired GLB in this test is real CPU execution.
test('HTTP causal routes reject failed compilation and rebuild invalid Blender caches', { skip: !available, timeout:90000 }, async t => {
  const created = new Set();
  const fixture = (source, year) => {
    const unique = crypto.randomUUID();
    const originalPhoto = Buffer.from(unique).toString('base64');
    const body = {
      originalImageDataUrl:`data:image/jpeg;base64,${originalPhoto}`,
      verifiedBpyCode:`# Parent source ${unique}`,
      metricSummary:{ groundYThree:-1.72 },
      interventionText:`Regression fixture ${unique}`,
      thinkingLevel:'MEDIUM',
    };
    const key = { imageHash:hash(originalPhoto), sourceHash:hash(body.verifiedBpyCode),
      metricSummary:body.metricSummary, interventionText:body.interventionText, thinkingLevel:body.thinkingLevel };
    const cacheFile = path.join(cache, `mvp3_causal_v2_${hash(JSON.stringify({provider:'gemini',model:process.env.GEMINI_MODEL === undefined ? 'gemini-4-argon' : process.env.GEMINI_MODEL.trim(),input:key})).slice(0,24)}.json`);
    fs.writeFileSync(cacheFile, JSON.stringify({data:{eras:[{year, eraBpyCode:source}]},latencyMs:0}), {flag:'wx'});
    created.add(cacheFile);
    const spec = {stage:`mvp3_era_${year}`,bpyCode:source,groundYThree:-1.72};
    const prefix = path.join(cache, `mvp3_era_${year}_${hash(JSON.stringify(spec)).slice(0,20)}`);
    for (const suffix of ['_spec.json','.glb','.py','.telemetry.json','.pending.glb']) created.add(prefix+suffix);
    return {body,prefix};
  };
  fs.mkdirSync(cache, {recursive:true});
  const server = spawn(process.execPath, ['server.js'], {cwd:checkout,
    env:{...process.env,PORT:'3469'}, stdio:['ignore','pipe','pipe']});
  let serverOutput = '';
  server.stdout.on('data', chunk => { serverOutput += chunk; });
  server.stderr.on('data', chunk => { serverOutput += chunk; });
  try {
    await new Promise((resolve,reject) => {
      const timer = setTimeout(() => reject(new Error(`Test server did not become ready: ${serverOutput}`)), 10000);
      const cleanup = () => { clearTimeout(timer); server.stdout.off('data',ready); server.off('error',failed); server.off('exit',exited); };
      const ready = chunk => { if (String(chunk).includes('Server running')) { cleanup(); resolve(); } };
      const failed = error => {cleanup();reject(error);};
      const exited = code => failed(new Error(`Test server exited ${code}: ${serverOutput}`));
      server.stdout.on('data',ready); server.once('error',failed); server.once('exit',exited);
    });
    const post = (route, body) => fetch(`http://127.0.0.1:3469${route}`, {
      method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body), signal:AbortSignal.timeout(45000),
    });
    const failed = fixture(`bpy.ops.mesh.primitive_cube_add()\nraise RuntimeError('HTTP regression ${crypto.randomUUID()}')`,1566);
    await t.test('JSON route returns an explicit failure instead of ok:true/null geometry', async () => {
      const response = await post('/api/argon/mvp3-causal',failed.body);
      assert.equal(response.status,500);
      const payload = await response.json();
      assert.equal(payload.ok,false);
      assert.equal(payload.causalSimulation,undefined);
      assert.match(payload.exactApiError.message,/Era 1566 failed Blender compilation/);
      assert.equal(fs.existsSync(failed.prefix+'.glb'),false);
      const telemetry = JSON.parse(fs.readFileSync(failed.prefix+'.telemetry.json','utf8'));
      assert.match(telemetry.execError,/HTTP regression/);
    });
    await t.test('streaming route emits error and never emits done after an era fails', async () => {
      const response = await post('/api/argon/mvp3-causal-stream',failed.body);
      const events = (await response.text()).trim().split('\n').map(line=>JSON.parse(line));
      assert.ok(events.some(event=>event.phase==='era_compile_start'));
      assert.ok(events.some(event=>event.phase==='error' && /failed Blender compilation/.test(event.exactApiError.message)));
      assert.equal(events.some(event=>event.phase==='done'),false);
      assert.equal(events.some(event=>event.phase==='era_compiled'),false);
      assert.equal(fs.existsSync(failed.prefix+'.glb'),false);
    });
    const repaired = fixture(`# Unique CPU geometry ${crypto.randomUUID()}\nbpy.ops.mesh.primitive_cube_add(size=2, location=three_to_blender(0, 0, -5))`,1938);
    fs.writeFileSync(repaired.prefix+'.glb',Buffer.alloc(132));
    fs.writeFileSync(repaired.prefix+'.py','# Old failed export');
    fs.writeFileSync(repaired.prefix+'.telemetry.json',JSON.stringify({execError:'previous failed export',objectCount:0,totalVertices:0,totalTriangles:0}));
    await t.test('invalid existing GLB cache is rebuilt into real renderable geometry', async () => {
      const response = await post('/api/argon/mvp3-causal',repaired.body);
      assert.equal(response.status,200);
      const payload = await response.json();
      assert.equal(payload.ok,true);
      assert.equal(payload.causalSimulation.eras.length,1);
      const era = payload.causalSimulation.eras[0];
      assert.equal(era.blenderTelemetry.execError,null);
      assert.equal(era.blenderTelemetry.objectCount,1);
      assert.ok(era.blenderTelemetry.totalTriangles>=12);
      validateBlenderResult(repaired.prefix+'.glb',era.blenderTelemetry);
      const artifact = await fetch(`http://127.0.0.1:3469${era.blenderGlbUrl}`);
      assert.equal(artifact.status,200);
      assert.ok((await artifact.arrayBuffer()).byteLength>132);
    });
  } finally {
    if (server.exitCode === null) {
      const exited = once(server,'exit');
      server.kill('SIGTERM');
      const timer = setTimeout(()=>server.kill('SIGKILL'),2000);
      await exited;
      clearTimeout(timer);
    }
    for (const file of created) fs.rmSync(file,{force:true});
  }
});
