// Real browser upload/validation/context/storage checks. ONLY the unavailable-AI3D
// authentication scenario uses explicit HTTP fixtures for /api/depth-status and
// /api/depth, preventing this test from submitting a new billable photograph.
// tests/browser-live-depth.cjs separately verifies the real cached provider result.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright');
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3456';
const sample = path.resolve(__dirname, '../samples/dining_room.jpg');

async function snapshot(page) {
  return page.evaluate(() => ({
    world: proceduralGroup.children[0]?.uuid,
    displayedWorld: state.displayedWorld,
    activeBranchKey: state.activeBranchKey,
    loadedContextId: state.loadedContextId,
    photoDataUrl: state.photoDataUrl,
    metricSummary: state.metricSummary,
    branches: JSON.stringify(state.branches),
    contexts: JSON.stringify(state.historyContexts),
  }));
}
async function assertWithinViewport(page, selector) {
  const locator = page.locator(selector);
  assert.ok(await locator.isVisible(), `${selector} should be visible`);
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  assert.ok(box && box.width > 0 && box.height > 0 && box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height,
    `${selector} should fit viewport ${JSON.stringify({box, viewport})}`);
  assert.ok(await locator.evaluate(element => {
    const box = element.getBoundingClientRect();
    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return element === hit || element.contains(hit);
  }), `${selector} must be unobscured at its click target`);
}

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    // Install before any file selection: a regression that accidentally submits
    // on selection must fail this test without creating an external paid job.
    await page.route('**/api/depth-status', route => route.fulfill({
      status:200,contentType:'application/json',
      body:JSON.stringify({ok:true,depthAvailable:true,apiKeyConfigured:false,provider:'AI3D',model:'moge2',fixture:'missing-auth'}),
    }));
    await page.route('**/api/depth', route => route.fulfill({
      status:500,contentType:'application/json',
      body:JSON.stringify({ok:false,message:'AI3D_API_KEY is not configured (explicit authentication-failure test fixture).'}),
    }));
    const errors = [];
    const posts = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      if (request.method() === 'POST' && request.url().startsWith(base + '/api/')) {
        posts.push({url: request.url(), body: request.postData()});
      }
    });
    await page.goto(base);
    await page.waitForFunction(() => state.displayedWorld?.branchId === 'orig' && state.photoDataUrl && state.loadedContextId);
    await assertWithinViewport(page, '#btnUploadImage');
    const original = await snapshot(page);
    const firstPosts = posts.length;

    // Click the user-visible upload action and use its actual native file chooser.
    const chooserPromise = page.waitForEvent('filechooser');
    await page.click('#btnUploadImage');
    const chooser = await chooserPromise;
    await chooser.setFiles(sample);
    await page.waitForFunction(() => state.pendingUpload && !document.getElementById('liveImagePanel').hidden);
    await page.locator('#uploadedImagePreview').waitFor({state: 'visible'});
    await page.waitForFunction(() => {
      const image = document.getElementById('uploadedImagePreview');
      return image.complete && image.naturalWidth > 0;
    });
    assert.match(await page.locator('#uploadedImageName').textContent(), /dining_room\.jpg/);
    assert.deepEqual(await snapshot(page), original, 'Selecting a photo must preserve displayed world, source photo, contexts, and history');
    assert.equal(posts.length, firstPosts, 'Selecting a photo must not submit inference or change server state');
    await assertWithinViewport(page, '#btnReconstructImage');
    console.log('PASS visible desktop upload; real chooser preview; no POST and no world/context mutation on select');

    await page.click('#btnCancelImage');
    await page.waitForFunction(() => !state.pendingUpload && document.getElementById('liveImagePanel').hidden);
    assert.deepEqual(await snapshot(page), original, 'Cancel must preserve world, source, context, and history');
    assert.equal(posts.length, firstPosts, 'Cancel must not submit inference');
    console.log('PASS cancel keeps the original demo and its source history');

    // Native file inputs can be populated with invalid files by automation: verify app validation.
    await page.locator('#photoInput').setInputFiles({name:'unsupported.svg', mimeType:'image/svg+xml', buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')});
    await page.waitForFunction(() => /JPG|JPEG|PNG|WebP|supported|format/i.test(document.getElementById('liveImageStatus').textContent));
    assert.equal(await page.evaluate(() => Boolean(state.pendingUpload)), false, 'Unsupported MIME type must not become a pending image');
    assert.deepEqual(await snapshot(page), original);
    assert.equal(posts.length, firstPosts);
    console.log('PASS unsupported MIME type rejected without changing the demo');

    await page.locator('#photoInput').setInputFiles({name:'oversized.jpg', mimeType:'image/jpeg', buffer:Buffer.alloc(12 * 1024 * 1024 + 1)});
    await page.waitForFunction(() => /12\s*(MB|MiB)|large|size/i.test(document.getElementById('liveImageStatus').textContent));
    assert.equal(await page.evaluate(() => Boolean(state.pendingUpload)), false, 'Oversized file must not become a pending image');
    assert.deepEqual(await snapshot(page), original);
    assert.equal(posts.length, firstPosts);
    console.log('PASS oversized image rejected before inference');

    await page.setViewportSize({width:390, height:844});
    await assertWithinViewport(page, '#btnUploadImage');
    const mobileChooserPromise = page.waitForEvent('filechooser');
    await page.click('#btnUploadImage');
    await (await mobileChooserPromise).setFiles(sample);
    await page.waitForFunction(() => state.pendingUpload && !document.getElementById('liveImagePanel').hidden);
    await assertWithinViewport(page, '#btnReconstructImage');
    await page.screenshot({path:'/tmp/cloud-upload-mobile.png'});
    console.log('PASS upload and reconstruct actions visible in 390px mobile viewport');

    // Explicit missing-auth fixture: the UI must show the provider failure, keep
    // the previous world, and avoid inventing an authored root. This is NOT a live
    // AI3D inference assertion; the cached live-depth test covers that separately.
    const depthResponsePromise = page.waitForResponse(response => response.url() === base + '/api/depth' && response.request().method() === 'POST', {timeout:30000});
    await page.click('#btnReconstructImage');
    const depthResponse = await depthResponsePromise;
    const depthResult = await depthResponse.json();
    assert.ok(!depthResponse.ok() || depthResult.ok === false, 'The explicit missing-auth fixture must return an unavailable-depth error');
    assert.match(JSON.stringify(depthResult), /AI3D_API_KEY|credential|not configured|unavailable|depth service/i, 'The authentication-failure fixture should identify the missing service prerequisite');
    await page.waitForFunction(() => /failed|unavailable|AI3D|credential|not configured|error/i.test(document.getElementById('liveImageStatus').textContent));
    assert.match(await page.locator('#liveImageStatus').textContent(), /failed|unavailable|AI3D|credential|not configured|error/i);
    const depthPosts = posts.slice(firstPosts).filter(request => request.url.endsWith('/api/depth'));
    assert.equal(depthPosts.length, 1, 'One explicit click should make one intercepted depth request');
    const body = JSON.parse(depthPosts[0].body);
    const submittedImage = body.imageDataUrl || body.imageBase64;
    assert.match(submittedImage, /^data:image\/jpeg;base64,/);
    assert.equal(submittedImage, 'data:image/jpeg;base64,' + fs.readFileSync(sample).toString('base64'), 'Depth request must carry the newly selected photograph');
    assert.notEqual(submittedImage, original.photoDataUrl, 'The new photograph must differ from the original demo source');
    assert.equal(await page.evaluate(() => Object.keys(state.branches).length), Object.keys(JSON.parse(original.branches)).length, 'Depth failure must not invent a reconstructed root');
    assert.equal(await page.evaluate(() => proceduralGroup.children[0]?.uuid), original.world, 'Depth failure must retain visible geometry');
    assert.ok(!posts.slice(firstPosts).some(request => /mvp3-author|mvp3-rewrite|mvp3-critic/.test(request.url)), 'Failed depth must stop before authoring or critique');
    await page.screenshot({path:'/tmp/cloud-upload-depth-error.png'});
    await page.click('#btnCancelImage');
    await page.waitForFunction(() => !state.pendingUpload && document.getElementById('liveImagePanel').hidden);
    assert.deepEqual(await snapshot(page), original, 'Cancel after the authentication-failure fixture must restore the original demo source/context');
    assert.deepEqual(errors, []);
    console.log('PASS explicit mocked AI3D missing-auth fixture, no fake history, retained real geometry, cancel restores source; no page errors');

    // Storage-only fixture: this record deliberately reuses demo geometry. It is
    // NOT a reconstructed world or an inference result. Exercise the real browser
    // IndexedDB implementation by forcing quota only on inline localStorage data.
    const storageFixture = await page.evaluate(async newPhoto => {
      const contextId = 'upload-storage-fixture-context';
      const branchId = 'upload-storage-fixture-history';
      const rootContextId = state.branches.orig.contextId;
      const rootContextBefore = JSON.stringify(state.historyContexts[rootContextId]);
      const calibration = {fovYDeg:67.25,groundYThree:-1.61,boundsMeters:{x:[-4,4],y:[-1.61,3],z:[-12,-1]}};
      const image = await new Promise((resolve,reject) => {
        const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = newPhoto;
      });
      state.historyContexts[contextId] = CausalHistory.freeze({
        ...JSON.parse(rootContextBefore),photoDataUrl:newPhoto,samplePath:'storage-fixture:dining_room.jpg',
        photoWidth:image.naturalWidth,photoHeight:image.naturalHeight,metricSummary:calibration,
      });
      state.branches[branchId] = CausalHistory.freeze({
        ...JSON.parse(JSON.stringify(state.branches.orig)),id:branchId,contextId,
        branchTitle:'Storage fixture only · not inferred geometry',
      });
      const fullBytes = JSON.stringify({branches:state.branches,contexts:state.historyContexts}).length;
      const nativeSetItem = Storage.prototype.setItem;
      let forcedQuota = 0;
      Storage.prototype.setItem = function(key,value) {
        if (key === 'timetravel.histories.v2') {
          const saved = JSON.parse(value);
          if (Object.values(saved.contexts || {}).some(context => context.photoDataUrl)) {
            forcedQuota++;
            throw new DOMException('Test-forced inline-image quota', 'QuotaExceededError');
          }
        }
        return nativeSetItem.call(this,key,value);
      };
      let saved;
      try { saved = await persistHistories(); }
      finally { Storage.prototype.setItem = nativeSetItem; }
      const compact = JSON.parse(localStorage.getItem('timetravel.histories.v2'));
      const compactBytes = JSON.stringify(compact).length;
      const referencesOnly = Object.entries(compact.contexts).every(([id,ref]) => ref.storage === 'indexeddb' && ref.key === id && !ref.photoDataUrl);
      // Read the committed source with the actual IndexedDB API, independently of
      // the app's hydration helper (no fake database or network response).
      const database = await new Promise((resolve,reject) => {
        const request = indexedDB.open('timetravel-source-contexts',1);
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
      let record;
      try {
        record = await new Promise((resolve,reject) => {
          const request = database.transaction('contexts','readonly').objectStore('contexts').get(contextId);
          request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
        });
      } finally { database.close(); }
      return {saved,forcedQuota,contextId,branchId,rootContextId,rootContextBefore,calibration,
        contextStorage:compact.contextStorage,referencesOnly,fullBytes,compactBytes,
        actualIndexedDBPhotoMatches:record?.photoDataUrl === newPhoto,
        actualIndexedDBCalibration:record?.metricSummary,
        sourceUnchanged:state.photoDataUrl === state.historyContexts[rootContextId].photoDataUrl};
    }, submittedImage);
    assert.equal(storageFixture.saved,true);
    assert.equal(storageFixture.forcedQuota,1);
    assert.equal(storageFixture.contextStorage,'indexeddb');
    assert.equal(storageFixture.referencesOnly,true);
    assert.ok(storageFixture.compactBytes < storageFixture.fullBytes / 2, 'LocalStorage should contain compact references rather than image bytes');
    assert.equal(storageFixture.actualIndexedDBPhotoMatches,true);
    assert.deepEqual(storageFixture.actualIndexedDBCalibration,storageFixture.calibration);
    assert.equal(storageFixture.sourceUnchanged,true);

    await page.reload();
    await page.waitForFunction(contextId => state.displayedWorld?.branchId === 'orig' && !state.isInitializing && Boolean(state.historyContexts[contextId]?.photoDataUrl),storageFixture.contextId);
    const hydrated = await page.evaluate(({contextId,branchId,rootContextId}) => ({
      photo:state.historyContexts[contextId].photoDataUrl,
      calibration:state.historyContexts[contextId].metricSummary,
      branchContext:state.branches[branchId].contextId,
      rootContext:JSON.stringify(state.historyContexts[rootContextId]),
      activeContext:state.loadedContextId,
      displayedBranch:state.displayedWorld.branchId,
    }),storageFixture);
    assert.equal(hydrated.photo,submittedImage,'Reload must hydrate exact source image bytes from IndexedDB');
    assert.deepEqual(hydrated.calibration,storageFixture.calibration);
    assert.equal(hydrated.branchContext,storageFixture.contextId);
    assert.equal(hydrated.rootContext,storageFixture.rootContextBefore,'Existing original source context must survive fallback and reload unchanged');
    assert.equal(hydrated.activeContext,storageFixture.rootContextId);
    assert.equal(hydrated.displayedBranch,'orig');
    // Verify hydration is usable by normal world/context switching, then restore
    // the original demo. No reconstruction API is invoked for this storage fixture.
    await page.evaluate(branchId => switchTimelineBranch(branchId),storageFixture.branchId);
    assert.equal(await page.evaluate(() => state.photoDataUrl),submittedImage);
    assert.deepEqual(await page.evaluate(() => state.metricSummary),storageFixture.calibration);
    await page.evaluate(() => switchTimelineBranch('orig'));
    assert.equal(await page.evaluate(() => state.photoDataUrl),original.photoDataUrl);
    assert.equal(await page.evaluate(() => state.loadedContextId),storageFixture.rootContextId);
    assert.equal(posts.slice(firstPosts).filter(request => request.url.endsWith('/api/depth')).length,1,'Storage migration/reload must not invoke additional inference');
    assert.deepEqual(errors,[]);
    console.log('PASS real IndexedDB quota fallback, compact localStorage references, exact image/calibration hydration after reload, original context retained; storage-only fixture, no inference');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
