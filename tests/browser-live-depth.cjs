// Real browser Upload -> cached result from a previously authenticated AI3D MoGe-2 job.
// No HTTP, inference, geometry, or browser storage mocks. Gemini-authoring-unavailable behavior
// is checked explicitly; successful metric depth is not claimed as authored architecture.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium } = require('playwright');
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3456';
const photograph = path.resolve(__dirname, '../samples/cloister_courtyard.jpg');
const imageBytes = fs.readFileSync(photograph);
const imageHash = crypto.createHash('sha256').update(imageBytes).digest('hex');
const cacheDirectory = path.resolve(__dirname, '../.cache', `moge_${imageHash}`);
// Guard against unintentionally submitting another paid job when the cloud cache
// is missing. Run scripts/smoke-live-depth.js deliberately to populate it first.
for (const filename of ['points.exr', 'depth.exr', 'image.png']) {
  assert.ok(fs.existsSync(path.join(cacheDirectory, filename)) && fs.statSync(path.join(cacheDirectory, filename)).size > 0,
    `This browser check requires the authenticated result already cached in ${cacheDirectory}; missing ${filename}`);
}

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  try {
    const page = await browser.newPage({ viewport: { width:1440, height:1000 } });
    const errors = [];
    const requests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      if (request.method() === 'POST' && request.url().startsWith(base + '/api/')) {
        requests.push({url:request.url(),body:request.postData()});
      }
    });
    await page.goto(base);
    await page.waitForFunction(() => state.displayedWorld?.branchId === 'orig' && !state.isInitializing && state.photoDataUrl && state.loadedContextId);
    const services = await page.evaluate(async () => {
      const [depth,authoring] = await Promise.all([fetch('/api/depth-status').then(r => r.json()),fetch('/api/status').then(r => r.json())]);
      return {depthAvailable:depth.depthAvailable,depthKeyConfigured:depth.apiKeyConfigured,authoringAvailable:authoring.liveGenerationAvailable,authoringProvider:authoring.authoringProvider};
    });
    assert.equal(services.depthAvailable,true,'Real cloud depth service must be running');
    assert.equal(services.depthKeyConfigured,true,'This check expects the newly configured real AI3D binding');
    assert.equal(services.authoringProvider,'gemini','Live authoring uses the Gemini Developer API');
    assert.equal(services.authoringAvailable,false,'This scenario verifies honest depth-only behavior while Gemini authoring is not configured');
    const before = await page.evaluate(() => ({
      source:state.photoDataUrl,contextId:state.loadedContextId,metricSummary:state.metricSummary,
      contexts:JSON.stringify(state.historyContexts),branches:JSON.stringify(state.branches),
      displayed:state.displayedWorld,worldCount:proceduralGroup.children.length,
    }));
    const chooserPromise = page.waitForEvent('filechooser');
    await page.click('#btnUploadImage');
    await (await chooserPromise).setFiles(photograph);
    await page.waitForFunction(() => state.pendingUpload?.phase === 'selected' && document.getElementById('uploadedImagePreview').naturalWidth > 0);
    assert.equal(requests.length,0,'Selecting the photograph must not submit inference');
    const responsePromise = page.waitForResponse(response => response.url() === base + '/api/depth' && response.request().method() === 'POST', {timeout:90000});
    const started = Date.now();
    await page.click('#btnReconstructImage');
    const response = await responsePromise;
    const result = await response.json();
    assert.equal(response.status(),200);
    assert.equal(result.ok,true);
    assert.equal(result.cached,true,'The live inference result must be reused without another paid job');
    assert.equal(result.sha256,imageHash);
    assert.equal(result.gridWidth,192);
    assert.equal(result.gridHeight,168);
    assert.ok(result.intrinsics.fovYDeg > 0 && result.intrinsics.fovYDeg < 180);
    assert.match(result.meshGlbUrl || '',/\.glb$/,'The actual provider result should include a downloadable reconstructed mesh');
    await page.waitForFunction(() => state.pendingUpload?.phase === 'blocked' && !state.isReconstructingImage && state.displayedWorld?.kind === 'depth');
    const elapsed = Date.now() - started;
    const preview = await page.evaluate(() => {
      photoMesh.geometry.computeBoundingBox();
      return ({
      pendingPhase:state.pendingUpload.phase,kind:state.displayedWorld.kind,activeBranch:state.activeBranchKey,
      hasDepth:Boolean(state.mogeData?.ok),grid:[state.mogeData?.gridWidth,state.mogeData?.gridHeight],
      pointVertices:photoMesh?.geometry?.attributes?.position?.count || 0,
      depthSpan:photoMesh.geometry.boundingBox.max.z - photoMesh.geometry.boundingBox.min.z,
      triangles:(photoMesh?.geometry?.index?.count || 0) / 3,
      pointMeshVisible:Boolean(photoMesh?.visible && photoMesh?.parent === scene && photoMesh?.material?.map),
      oldWorldHidden:!proceduralGroup.visible,
      branches:JSON.stringify(state.branches),contexts:JSON.stringify(state.historyContexts),
      status:document.getElementById('liveImageStatus').textContent,
      hero:dom.heroEraProvenance.textContent,
    });
    });
    assert.equal(preview.hasDepth,true);
    assert.deepEqual(preview.grid,[192,168]);
    assert.equal(preview.pointVertices,192 * 168);
    assert.ok(preview.triangles > 0);
    assert.ok(Number.isFinite(preview.depthSpan) && preview.depthSpan > 1,'Recovered geometry must have varying metric depth, not a flat photo plane');
    assert.equal(preview.pointMeshVisible,true,'Measured photo geometry must actually be attached to the rendered scene');
    assert.equal(preview.oldWorldHidden,true,'Demo geometry must not be presented as the uploaded reconstruction');
    assert.equal(preview.activeBranch,null,'Metric depth alone must not invent an authored history');
    assert.equal(preview.branches,before.branches);
    assert.equal(preview.contexts,before.contexts);
    assert.match(preview.status,/Depth ready.*GEMINI_API_KEY.*GEMINI_MODEL.*No reconstructed history/i);
    assert.match(preview.hero,/Metric depth recovered.*authoring.*not completed/i);
    const depthRequests = requests.filter(request => request.url.endsWith('/api/depth'));
    assert.equal(depthRequests.length,1);
    assert.equal(JSON.parse(depthRequests[0].body).imageDataUrl,'data:image/jpeg;base64,' + imageBytes.toString('base64'));
    assert.ok(!requests.some(request => /mvp3-author|mvp3-rewrite|mvp3-critic/.test(request.url)),'Unavailable Gemini authoring must stop authoring and critique');
    await page.screenshot({path:'/tmp/cloud-live-depth.png'});
    await page.click('#camViewSwitcher [data-cam="threeQuarter"]');
    await page.waitForFunction(() => !navState.isTweening && state.activeCamPreset === 'threeQuarter');
    assert.ok(await page.evaluate(() => camera.position.length() > 1 && photoMesh.visible && photoMesh.parent === scene),'The real camera control must navigate around the metric photo geometry');
    await page.screenshot({path:'/tmp/cloud-live-depth-overview.png'});
    await page.evaluate(() => setCameraPreset('originalCam',false));

    await page.click('#btnCancelImage');
    await page.waitForFunction(() => !state.pendingUpload && state.displayedWorld?.branchId === 'orig' && proceduralGroup.visible);
    const restored = await page.evaluate(() => ({
      source:state.photoDataUrl,contextId:state.loadedContextId,metricSummary:state.metricSummary,
      contexts:JSON.stringify(state.historyContexts),branches:JSON.stringify(state.branches),
      displayed:state.displayedWorld,worldCount:proceduralGroup.children.length,
      photoMeshRemoved:!photoMesh || photoMesh.parent !== scene,
    }));
    const {photoMeshRemoved,...restoredSource} = restored;
    assert.deepEqual(restoredSource,before,'Cancel must restore the original world, source context, calibration, and histories');
    assert.equal(photoMeshRemoved,true,'Cancel should remove the uploaded depth preview');
    assert.deepEqual(errors,[]);
    console.log('PASS real cached AI3D/MoGe Upload -> metric 3D preview',JSON.stringify({wallMs:elapsed,cached:result.cached,grid:preview.grid,vertices:preview.pointVertices,triangles:preview.triangles,fovYDeg:result.intrinsics.fovYDeg,meshReturned:Boolean(result.meshGlbUrl)}));
    console.log('PASS explicit Gemini API setup blocker, no fake authored root or critic result, original history/source restored on cancel; no browser errors');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
