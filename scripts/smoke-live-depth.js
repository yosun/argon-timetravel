// A real authenticated inference smoke check. No API response is mocked.
const fs=require('fs'); const path=require('path'); const assert=require('assert/strict');
(async()=>{
 const started=Date.now();
 const image=fs.readFileSync(path.join(__dirname,'..','samples','cloister_courtyard.jpg'));
 const response=await fetch(`${process.env.TEST_BASE_URL||'http://127.0.0.1:3456'}/api/depth`,{
  method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({imageDataUrl:`data:image/jpeg;base64,${image.toString('base64')}`}),signal:AbortSignal.timeout(260000)
 });
 const data=await response.json();
 if(!response.ok || !data.ok) throw new Error(`Live depth failed (${response.status}): ${data.error||data.message||data.exactApiError?.message||'See depth-service status'}`);
 assert.ok(data.gridWidth>1 && data.gridHeight>1); assert.equal(data.pointsGrid.length,data.gridHeight);
 const point=data.pointsGrid.flat().find(p=>p.length===3 && p.every(Number.isFinite) && p.some(n=>n!==0));
 assert.ok(point,'No finite metric geometry returned'); assert.ok(Number.isFinite(data.intrinsics?.fovYDeg));
 console.log(JSON.stringify({ok:true,elapsedMs:Date.now()-started,cached:Boolean(data.cached),grid:[data.gridWidth,data.gridHeight],fovYDeg:data.intrinsics.fovYDeg,meshReturned:Boolean(data.meshGlbUrl),backend:data.backend||data.model}));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
