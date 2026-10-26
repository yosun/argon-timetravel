const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const path = require('node:path');

test('depth readiness reflects the running AI3D adapter without exposing health payload fields', {timeout:15000}, async () => {
  let configured = false;
  const depth = http.createServer((req, res) => {
    assert.equal(req.url, '/health');
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ok:true, apiKeyConfigured:configured, internalField:'must-not-be-forwarded'}));
  });
  await new Promise(resolve => depth.listen(0, '127.0.0.1', resolve));
  const depthPort = depth.address().port;
  const reservation = http.createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const appPort = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const server = spawn(process.execPath, ['server.js'], {
    cwd:path.join(__dirname, '..'), env:{...process.env, PORT:String(appPort), DEPTH_SERVICE_PORT:String(depthPort)}, stdio:'ignore'
  });
  const url = `http://127.0.0.1:${appPort}/api/depth-status`;
  try {
    let initial;
    for(let i=0;i<50;i++) {
      try { initial=await (await fetch(url)).json(); break; }
      catch (_) { await new Promise(resolve=>setTimeout(resolve,30)); }
    }
    assert.ok(initial, 'App did not become reachable');
    assert.deepEqual(initial,{ok:true,depthAvailable:true,apiKeyConfigured:false,provider:'AI3D',model:'moge2'});
    configured = true;
    const updated=await (await fetch(url)).json();
    assert.equal(updated.apiKeyConfigured,true);
    assert.equal(updated.internalField,undefined);
    await new Promise(resolve=>depth.close(resolve));
    const offline=await (await fetch(url)).json();
    assert.equal(offline.depthAvailable,false); assert.equal(offline.apiKeyConfigured,false);
    assert.match(offline.message,/npm run depth-service/);
  } finally {
    if (depth.listening) await new Promise(resolve=>depth.close(resolve));
    if(server.exitCode===null) {const closed=once(server,'close');server.kill();await closed;}
  }
});
