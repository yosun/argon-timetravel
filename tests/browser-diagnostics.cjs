// Actual Chromium/WebGL and committed exported GLB. No AI requests are made.
// This verifies diagnostic integrity and restoration, not visual acceptance.
const assert = require('node:assert/strict');
const {chromium} = require('playwright');

(async () => {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/chromium', headless: true,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  try {
    const page = await browser.newPage({viewport: {width: 1440, height: 1000}});
    const errors = [], paidRequests = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', async route => {
      if (route.request().method() === 'POST') {
        paidRequests.push(route.request().url());
        await route.abort('blockedbyclient');
      } else await route.continue();
    });
    await page.goto(process.env.TEST_BASE_URL || 'http://127.0.0.1:3456');
    await page.waitForFunction(() => state.displayedWorld?.branchId === 'orig');
    const result = await page.evaluate(async () => {
      const additions = [];
      const addBackdrop = color => {
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshBasicMaterial({color, side: THREE.DoubleSide}));
        mesh.position.z = -0.2;
        scene.add(mesh); additions.push(mesh); return mesh;
      };
      photoMesh = addBackdrop(0xff00ff);
      wireframeMesh = addBackdrop(0x00ff00);
      const debug = addBackdrop(0x00ffff);
      fullIndexAttr = photoMesh.geometry.getIndex();
      displacedIndexAttr = new THREE.Uint16BufferAttribute([0, 1, 2], 1);
      photoMesh.geometry.setIndex(displacedIndexAttr);
      photoMesh.material.opacity = 0.37;
      wireframeMesh.visible = true;
      proceduralGroup.visible = false;
      dom.eraHeroOverlay.style.visibility = 'collapse';
      dom.causalAncestryPopover.style.visibility = 'visible';
      dom.causalAncestryPopover.style.display = 'none';
      dom.splitCompareOverlay.style.visibility = '';
      dom.splitCompareOverlay.style.display = 'block';
      dom.threeCanvas.style.pointerEvents = 'auto';
      dom.hudCameraPose.textContent = 'custom camera label';
      state.activeCamPreset = 'custom-user-camera';
      dom.camButtons.forEach((button, i) => {
        button.disabled = i === 1;
        button.classList.toggle('active', i === 2);
      });
      renderer.setPixelRatio(1.25);
      renderer.setSize(777, 555, false);
      camera.position.set(0.15, 0.3, 0.25);
      camera.lookAt(0, -0.5, -5);
      camera.fov = 62; camera.aspect = 1.4; camera.zoom = 1.07;
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld(true);
      navState.isTweening = true;
      navState.tweenStartTime = performance.now();
      navState.tweenDurationMs = 100000;
      navState.isDragging = true;
      navState.yaw = 0.123; navState.pitch = 0.234;
      navState.tweenStartPos.copy(camera.position);
      navState.tweenTargetPos.set(1, 0, 0);
      const meshMaterials = new Map();
      proceduralGroup.traverse(object => {
        if (!object.material) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach(material => meshMaterials.set(material, material.wireframe));
      });
      [...meshMaterials.keys()].forEach((material, i) => { material.wireframe = i % 2 === 0; });
      const snapshot = () => ({
        camera: camera.toJSON(), size: renderer.getSize(new THREE.Vector2()).toArray(),
        pixelRatio: renderer.getPixelRatio(), preset: state.activeCamPreset,
        visibility: [photoMesh.visible, wireframeMesh.visible, debug.visible, proceduralGroup.visible],
        sourceOpacity: photoMesh.material.opacity, photoIndexRestored: photoMesh.geometry.getIndex() === displacedIndexAttr,
        wireframes: [...meshMaterials.keys()].map(material => material.wireframe),
        nav: {isTweening: navState.isTweening, isDragging: navState.isDragging, yaw: navState.yaw, pitch: navState.pitch,
          tweenDurationMs: navState.tweenDurationMs, start: navState.tweenStartPos.toArray(), target: navState.tweenTargetPos.toArray()},
        overlays: [dom.eraHeroOverlay, dom.causalAncestryPopover, dom.splitCompareOverlay].map(element => [element.style.visibility, element.style.display]),
        buttons: Array.from(dom.camButtons).map(button => [button.disabled, button.classList.contains('active')]),
        pointerEvents: dom.threeCanvas.style.pointerEvents, label: dom.hudCameraPose.textContent,
      });
      const before = snapshot();
      const actualRender = renderer.render.bind(renderer), renders = [];
      renderer.render = (renderScene, renderCamera) => {
        if (diagnosticCaptureInFlight) {
          renders.push({
            clean: !photoMesh.visible && !wireframeMesh.visible && !debug.visible && proceduralGroup.visible,
            size: renderer.getSize(new THREE.Vector2()).toArray(), pixelRatio: renderer.getPixelRatio(),
            preset: state.activeCamPreset, materials: [...meshMaterials.keys()].map(material => material.wireframe),
          });
        }
        return actualRender(renderScene, renderCamera);
      };
      const shots = await captureFourDiagnosticScreenshots();
      const afterSuccess = snapshot();
      const capture = dom.threeCanvas.toDataURL.bind(dom.threeCanvas);
      let attempted = 0, failure;
      dom.threeCanvas.toDataURL = (...args) => {
        if (++attempted === 2) throw new Error('injected diagnostic encoding failure');
        return capture(...args);
      };
      try { await captureFourDiagnosticScreenshots(); }
      catch (error) { failure = error.message; }
      const afterFailure = snapshot();
      const unlocked = !diagnosticCaptureInFlight;
      dom.threeCanvas.toDataURL = capture;
      renderer.render = actualRender;
      navState.isTweening = false; navState.isDragging = false;
      const pixels = await Promise.all(Object.entries(shots).map(async ([preset, dataUrl]) => {
        const image = new Image(); image.src = dataUrl; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
        const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
        const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let contaminated = 0, geometryPixels = 0;
        const bg = [rgba[0], rgba[1], rgba[2]];
        for (let i = 0; i < rgba.length; i += 4) {
          if ((rgba[i] > 220 && rgba[i+1] < 40 && rgba[i+2] > 220) ||
              (rgba[i] < 40 && rgba[i+1] > 220 && rgba[i+2] < 40) ||
              (rgba[i] < 40 && rgba[i+1] > 220 && rgba[i+2] > 220)) contaminated++;
          if (Math.abs(rgba[i]-bg[0])+Math.abs(rgba[i+1]-bg[1])+Math.abs(rgba[i+2]-bg[2]) > 30) geometryPixels++;
        }
        return {preset, width: image.width, height: image.height, contaminated, geometryPixels};
      }));
      additions.forEach(mesh => {scene.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose();});
      photoMesh = null; wireframeMesh = null; proceduralGroup.visible = true;
      return {before, afterSuccess, afterFailure, renders, pixels, failure, unlocked};
    });
    assert.deepEqual(result.afterSuccess, result.before, 'Success must restore the complete user viewport');
    assert.deepEqual(result.afterFailure, result.before, 'Failure must restore the complete user viewport');
    assert.equal(result.failure, 'injected diagnostic encoding failure');
    assert.equal(result.unlocked, true, 'Failure must release the capture lock');
    assert.ok(result.renders.length >= 8);
    for (const render of result.renders) {
      assert.equal(render.clean, true, 'Photo/depth/debug geometry must be hidden for every actual render');
      assert.deepEqual(render.size, [1280, 960]);
      assert.equal(render.pixelRatio, 1);
      assert.ok(render.materials.every(wireframe => wireframe === (render.preset === 'wireframe')));
    }
    assert.deepEqual(result.pixels.map(image => image.preset), ['originalCam', 'threeQuarter', 'lowAngle', 'wireframe']);
    for (const image of result.pixels) {
      assert.equal(image.width, 1280); assert.equal(image.height, 960);
      assert.equal(image.contaminated, 0, `${image.preset} must contain no opaque photo/debug backdrop pixels`);
      assert.ok(image.geometryPixels > 1000, `${image.preset} must show actual loaded GLB geometry`);
    }
    assert.deepEqual(paidRequests, []); assert.deepEqual(errors, []);
    console.log('PASS actual exported GLB diagnostics: 4×1280×960, no photo/depth/debug contamination, full viewport restoration on success and error; no AI calls.');
    console.log('Diagnostic integrity only; no visual-quality acceptance is claimed.');
  } finally { await browser.close(); }
})().catch(error => {console.error(error); process.exitCode = 1;});
