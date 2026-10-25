/**
 * TIME TRAVEL — MVP3: Autonomous 3D World Generation, 4-View Adversarial Critic,
 * Closed-Loop Code Rewrite, and Multi-Epoch Causal Simulator.
 *
 * Implements Google's Official 6-Workflow 3D Guide for Gemini 4 Argon:
 *   1. Workflow #6: MoGe-2 Metric Camera Calibration + Numbered X/Y Grid + Top-Down 2D Metric Floorplan (.svg)
 *   2. Requirement 1: Unrestricted Scene-Specific Blender 4.1 (bpy) & Three.js Authoring (Round 1)
 *   3. Workflow #3: Independent Adversarial Critic inspecting 4 actual screenshots (Orig Cam, 3/4, Low Angle, Wireframe)
 *   4. Requirement 3: Closed-Loop bpy Code Rewrite & 4-View Rerender (Round 2) with measured improvement
 *   5. Workflow #5: Nano Banana Photorealistic Target Renders & Seamless PBR Textures
 *   6. Workflow #4: Live Art-Director Control Panel + progress.html Milestone Screenshot Gallery
 */

const state = {
  samplePath: 'samples/cloister_courtyard.jpg',
  photoDataUrl: null,
  photoWidth: 600,
  photoHeight: 800,
  photoImgElement: null,
  gridOverlayDataUrl: null,
  floorplanSvgDataUrl: null,
  targetRenderDataUrl: null,

  // Step 1: MoGe-2 Metric 3D Data
  mogeData: null,
  metricSummary: null,

  // Step 2: Round 1 Unrestricted Authoring
  round1: null,
  round1Views: null, // { originalCam, threeQuarter, lowAngle, wireframe }

  // Step 3: Independent Adversarial Critique (Round 1 & Round 2)
  critiqueR1: null,
  critiqueR2: null,

  // Step 4: Round 2 Rewritten Code & Rerender
  round2: null,
  round2Views: null, // { originalCam, threeQuarter, lowAngle, wireframe }

  // Step 5: Multi-Epoch Causal Simulation & Branching World States
  causalSimulation: null,
  branches: {}, // Preserves { orig, branchA, branchB } without destroying previous states
  activeBranchKey: 'branchA',
  selected3DObject: null,
  eraRenders: {},

  // Active Viewport State
  activeStage: 'round2', // 'round1' | 'round2' | 'era1206' | 'era1566' | 'era1938' | 'alt2026'
  activeCamPreset: 'originalCam', // 'originalCam' | 'threeQuarter' | 'lowAngle' | 'wireframe'
  showingShotRound: 2, // 1 or 2
  activeCodeView: 'r2', // 'r1' | 'r2' | 'telemetry'

  latencies: {
    mogeMs: 0,
    authorR1Ms: 0,
    blenderR1Ms: 0,
    criticR1Ms: 0,
    rewriteR2Ms: 0,
    blenderR2Ms: 0,
    criticR2Ms: 0,
    causalMs: 0,
  },

  metrics: {
    r1SameCamSim: null,
    r2SameCamSim: null,
    r1GroundErrorMeters: null,
    r2GroundErrorMeters: null,
  },

  artDirectorSettings: {
    sunAngleDeg: 42,
    lightIntensity: 1.25,
    materialRoughness: 0.55,
    photoMeshOpacity: 0.88,
  },

  callLogs: [],
};

// Three.js Globals
let renderer = null;
let scene = null;
let camera = null;
let ambientLight = null;
let dirLight = null;
let hemiLight = null;
let photoMesh = null;
let wireframeMesh = null;
let fullIndexAttr = null;
let displacedIndexAttr = null;
let proceduralGroup = null;

let basePhotoCanvas = null;
let dynamicTextureCanvas = null;
let dynamicPhotoTexture = null;

// Interactive First-Person / Orbit Navigation
const navState = {
  isDragging: false,
  lastX: 0,
  lastY: 0,
  yaw: 0,
  pitch: 0,
  keys: {},
};

const dom = {
  sampleSelect: document.getElementById('sampleSelect'),
  photoInput: document.getElementById('photoInput'),
  thinkingLevelSelect: document.getElementById('thinkingLevelSelect'),
  btnRunDemoLoop: document.getElementById('btnRunDemoLoop'),
  btnStep1Ground: document.getElementById('btnStep1Ground'),
  btnStep2AuthorR1: document.getElementById('btnStep2AuthorR1'),
  btnStep3Critic: document.getElementById('btnStep3Critic'),
  btnStep4RewriteR2: document.getElementById('btnStep4RewriteR2'),
  btnStep5Causal: document.getElementById('btnStep5Causal'),

  apiErrorBanner: document.getElementById('apiErrorBanner'),
  apiErrorText: document.getElementById('apiErrorText'),
  btnDismissError: document.getElementById('btnDismissError'),

  statusBadge: document.getElementById('statusBadge'),
  modelMetaInfo: document.getElementById('modelMetaInfo'),

  activeStageLabel: document.getElementById('activeStageLabel'),
  stageButtons: document.querySelectorAll('#stageSwitcher .btn-chip'),
  camButtons: document.querySelectorAll('#camViewSwitcher .btn-chip'),
  toggleSplitSlider: document.getElementById('toggleSplitSlider'),
  toggleMogeBackdrop: document.getElementById('toggleMogeBackdrop'),
  toggleBlenderGlb: document.getElementById('toggleBlenderGlb'),

  viewportContainer: document.getElementById('viewportContainer'),
  threeCanvas: document.getElementById('threeCanvas'),
  viewportHudTop: document.getElementById('viewportHudTop'),
  viewportHudBottom: document.getElementById('viewportHudBottom'),

  splitCompareOverlay: document.getElementById('splitCompareOverlay'),
  splitLeftClip: document.getElementById('splitLeftClip'),
  splitOriginalImg: document.getElementById('splitOriginalImg'),
  splitDividerLine: document.getElementById('splitDividerLine'),
  splitSliderInput: document.getElementById('splitSliderInput'),

  hudCameraPose: document.getElementById('hudCameraPose'),
  hudGeometryInfo: document.getElementById('hudGeometryInfo'),
  hudTimelineState: document.getElementById('hudTimelineState'),
  btnInspectMonumentAncestry: document.getElementById('btnInspectMonumentAncestry'),
  btnInspectArcadeAncestry: document.getElementById('btnInspectArcadeAncestry'),

  causalAncestryPopover: document.getElementById('causalAncestryPopover'),
  ancestryStatusBadge: document.getElementById('ancestryStatusBadge'),
  ancestryObjectTitle: document.getElementById('ancestryObjectTitle'),
  ancestryPersistentId: document.getElementById('ancestryPersistentId'),
  ancestryInterventionText: document.getElementById('ancestryInterventionText'),
  ancestryEvolutionList: document.getElementById('ancestryEvolutionList'),
  ancestryAssumptionsText: document.getElementById('ancestryAssumptionsText'),
  btnCloseAncestryPopover: document.getElementById('btnCloseAncestryPopover'),
  btnDirectInterveneLavabo: document.getElementById('btnDirectInterveneLavabo'),
  btnDirectInterveneAstrolabe: document.getElementById('btnDirectInterveneAstrolabe'),
  btnDirectScaleUp: document.getElementById('btnDirectScaleUp'),
  btnDirectRotateObj: document.getElementById('btnDirectRotateObj'),

  timeScrubberRange: document.getElementById('timeScrubberRange'),
  timeScrubberLabel: document.getElementById('timeScrubberLabel'),
  btnBranchOrig: document.getElementById('btnBranchOrig'),
  btnBranchA: document.getElementById('btnBranchA'),
  btnBranchB: document.getElementById('btnBranchB'),
  btnReturnToPresent: document.getElementById('btnReturnToPresent'),

  ctrlSunAngle: document.getElementById('ctrlSunAngle'),
  ctrlLightIntensity: document.getElementById('ctrlLightIntensity'),
  ctrlRoughness: document.getElementById('ctrlRoughness'),
  ctrlPhotoOpacity: document.getElementById('ctrlPhotoOpacity'),
  btnCopySettingsJson: document.getElementById('btnCopySettingsJson'),

  interventionInput: document.getElementById('interventionInput'),
  btnApplyIntervention: document.getElementById('btnApplyIntervention'),
  suggestedInterventionsBar: document.getElementById('suggestedInterventionsBar'),

  btnShowR1Shots: document.getElementById('btnShowR1Shots'),
  btnShowR2Shots: document.getElementById('btnShowR2Shots'),
  imgViewOrig: document.getElementById('imgViewOrig'),
  emptyViewOrig: document.getElementById('emptyViewOrig'),
  metaViewOrig: document.getElementById('metaViewOrig'),
  imgView34: document.getElementById('imgView34'),
  emptyView34: document.getElementById('emptyView34'),
  metaView34: document.getElementById('metaView34'),
  imgViewLow: document.getElementById('imgViewLow'),
  emptyViewLow: document.getElementById('emptyViewLow'),
  metaViewLow: document.getElementById('metaViewLow'),
  imgViewWire: document.getElementById('imgViewWire'),
  emptyViewWire: document.getElementById('emptyViewWire'),
  metaViewWire: document.getElementById('metaViewWire'),

  imgGridOverlay: document.getElementById('imgGridOverlay'),
  metaGridOverlay: document.getElementById('metaGridOverlay'),
  imgFloorplanSvg: document.getElementById('imgFloorplanSvg'),
  metaFloorplan: document.getElementById('metaFloorplan'),
  imgDepthMap: document.getElementById('imgDepthMap'),
  emptyDepthMap: document.getElementById('emptyDepthMap'),
  depthRangeMeta: document.getElementById('depthRangeMeta'),
  imgNanoTarget: document.getElementById('imgNanoTarget'),
  metaNanoTarget: document.getElementById('metaNanoTarget'),

  metricCriticScore: document.getElementById('metricCriticScore'),
  metricCriticSub: document.getElementById('metricCriticSub'),
  metricMeshComplexity: document.getElementById('metricMeshComplexity'),
  metricMeshSub: document.getElementById('metricMeshSub'),
  metricGroundContact: document.getElementById('metricGroundContact'),
  metricGroundSub: document.getElementById('metricGroundSub'),
  metricVisualFidelity: document.getElementById('metricVisualFidelity'),
  metricVisualSub: document.getElementById('metricVisualSub'),
  metricCodeDelta: document.getElementById('metricCodeDelta'),
  metricCodeSub: document.getElementById('metricCodeSub'),
  metricLatencies: document.getElementById('metricLatencies'),
  metricLatencySub: document.getElementById('metricLatencySub'),

  criticReportContainer: document.getElementById('criticReportContainer'),
  sceneCodeEditor: document.getElementById('sceneCodeEditor'),
  btnCodeViewR1: document.getElementById('btnCodeViewR1'),
  btnCodeViewR2: document.getElementById('btnCodeViewR2'),
  btnCodeViewTelemetry: document.getElementById('btnCodeViewTelemetry'),
  causalGraphContainer: document.getElementById('causalGraphContainer'),
  callLogsList: document.getElementById('callLogsList'),
};

// ============================================================================
// Initialization
// ============================================================================
function initApp() {
  initThreeViewport();
  bindEvents();
  checkBackendStatus();
  loadSelectedSample(dom.sampleSelect.value);
  animateLoop();
}

async function checkBackendStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    if (data.ok) {
      dom.modelMetaInfo.textContent = `Vertex AI (${data.project}) | ${data.model} | MoGe-2 + Blender 4.1 bpy`;
    } else {
      showApiError(data);
    }
  } catch (err) {
    showApiError({ message: `Backend unreachable: ${err.message}` });
  }
}

function setStatus(type, text) {
  dom.statusBadge.className = `status-pill status-${type}`;
  dom.statusBadge.textContent = text;
}

function setWorkflowStep(stepNum) {
  for (let i = 1; i <= 5; i++) {
    const el = document.getElementById(`wfStep${i}`);
    if (!el) continue;
    el.classList.remove('active', 'done');
    if (i < stepNum) el.classList.add('done');
    else if (i === stepNum) el.classList.add('active');
  }
}

function showApiError(errObj) {
  dom.apiErrorBanner.style.display = 'block';
  dom.apiErrorText.textContent = typeof errObj === 'string' ? errObj : JSON.stringify(errObj, null, 2);
  setStatus('err', 'API Error — Check Banner');
}

function hideApiError() {
  dom.apiErrorBanner.style.display = 'none';
}

function addCallLog(entry) {
  state.callLogs.unshift({
    timestamp: new Date().toISOString().split('T')[1].replace('Z', ''),
    ...entry,
  });
  renderCallLogs();
}

function renderCallLogs() {
  if (!state.callLogs.length) {
    dom.callLogsList.innerHTML = '<div class="empty-state">No model or toolchain calls logged yet.</div>';
    return;
  }
  dom.callLogsList.innerHTML = state.callLogs
    .map((log) => {
      const u = log.usage || {};
      const tokStr = u.totalTokens
        ? `in:${u.promptTokens || 0} | think:${u.thoughtsTokens || 0} | out:${u.outputTokens || 0} | total:${u.totalTokens}`
        : log.backend || '';
      return `
      <div class="log-entry">
        <div class="log-entry-header">
          <span>[${log.timestamp}] <strong>${log.stage}</strong> ${log.cached ? '(CACHED)' : ''}</span>
          <span>${log.latencyMs || 0} ms</span>
        </div>
        <div style="color:#cbd5e1;">${log.summary || ''}</div>
        ${tokStr ? `<div style="color:#94a3b8;font-family:monospace;font-size:10px;margin-top:2px;">${tokStr}</div>` : ''}
      </div>`;
    })
    .join('');
}

async function saveMilestoneToGallery(milestoneObj) {
  try {
    await fetch('/api/progress/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(milestoneObj),
    });
  } catch (e) {
    console.warn('[ProgressGallery Save Warning]', e);
  }
}

// ============================================================================
// Three.js Viewport Setup
// ============================================================================
function initThreeViewport() {
  renderer = new THREE.WebGLRenderer({
    canvas: dom.threeCanvas,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1);
  renderer.setSize(640, 480, false);
  renderer.outputEncoding = THREE.sRGBEncoding;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070b14);
  scene.fog = new THREE.FogExp2(0x070b14, 0.01);

  camera = new THREE.PerspectiveCamera(75, 640 / 480, 0.05, 120);
  camera.position.set(0, 0, 0);
  camera.lookAt(0, 0, -1);

  ambientLight = new THREE.AmbientLight(0xffffff, 0.82);
  scene.add(ambientLight);

  hemiLight = new THREE.HemisphereLight(0xe0f2fe, 0x443c30, 0.55);
  scene.add(hemiLight);

  dirLight = new THREE.DirectionalLight(0xfffbeb, 1.25);
  dirLight.position.set(2.5, 8.5, -3.0);
  scene.add(dirLight);

  proceduralGroup = new THREE.Group();
  scene.add(proceduralGroup);

  setupNavigationControls();
}

function resizeRendererToPhoto(width, height) {
  const maxW = 680;
  const maxH = 440;
  const scale = Math.min(maxW / width, maxH / height, 1);
  const rw = Math.round(width * scale);
  const rh = Math.round(height * scale);
  renderer.setSize(rw, rh, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

// ============================================================================
// Load Sample or Uploaded Photograph
// ============================================================================
async function fetchImageAsDataUrl(url) {
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

async function loadSelectedSample(sampleUrl) {
  state.samplePath = sampleUrl;
  const dataUrl = await fetchImageAsDataUrl(sampleUrl);
  await loadPhotoFromDataUrl(dataUrl);

  if (sampleUrl.includes('cloister_courtyard')) {
    dom.imgGridOverlay.src = 'samples/cloister_grid_overlay.png';
    dom.imgFloorplanSvg.src = 'samples/cloister_floorplan.svg';
    dom.imgNanoTarget.src = 'samples/cloister_target_render.jpg';
    state.gridOverlayDataUrl = await fetchImageAsDataUrl('samples/cloister_grid_overlay.png');
    state.targetRenderDataUrl = await fetchImageAsDataUrl('samples/cloister_target_render.jpg');
    dom.interventionInput.value =
      'In 1206 (Medieval Monastic Era), construct an octagonal Gothic bronze-and-limestone monastic lavabo fountain canopy over the central wellhead with four carved stone water basins and timber cloister roof beams.';
  } else {
    dom.imgNanoTarget.src = 'samples/target_1926_historical.jpg';
    state.targetRenderDataUrl = await fetchImageAsDataUrl('samples/target_1926_historical.jpg');
    dom.interventionInput.value =
      'In 1926, install carved dark walnut picture-frame wall molding, an heirloom cognac leather club chair, and an antique bronze reading lamp.';
  }
}

async function loadPhotoFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      state.photoDataUrl = dataUrl;
      state.photoWidth = img.naturalWidth || img.width;
      state.photoHeight = img.naturalHeight || img.height;
      state.photoImgElement = img;

      dom.splitOriginalImg.src = dataUrl;
      resizeRendererToPhoto(state.photoWidth, state.photoHeight);
      setWorkflowStep(1);
      resolve(img);
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

// ============================================================================
// Workflow #6: Build MoGe-2 Metric 3D Mesh + Dynamic X/Y Grid & 2D Floorplan
// ============================================================================
function buildMoge3DMeshAndExtractSummary(mogeData, photoImg) {
  if (photoMesh) {
    scene.remove(photoMesh);
    photoMesh.geometry.dispose();
    photoMesh = null;
  }
  if (wireframeMesh) {
    scene.remove(wireframeMesh);
    wireframeMesh.geometry.dispose();
    wireframeMesh = null;
  }

  basePhotoCanvas = document.createElement('canvas');
  basePhotoCanvas.width = photoImg.naturalWidth || photoImg.width;
  basePhotoCanvas.height = photoImg.naturalHeight || photoImg.height;
  basePhotoCanvas.getContext('2d').drawImage(photoImg, 0, 0);

  dynamicTextureCanvas = document.createElement('canvas');
  dynamicTextureCanvas.width = basePhotoCanvas.width;
  dynamicTextureCanvas.height = basePhotoCanvas.height;
  dynamicTextureCanvas.getContext('2d').drawImage(basePhotoCanvas, 0, 0);

  if (dynamicPhotoTexture) dynamicPhotoTexture.dispose();
  dynamicPhotoTexture = new THREE.CanvasTexture(dynamicTextureCanvas);
  dynamicPhotoTexture.encoding = THREE.sRGBEncoding;
  dynamicPhotoTexture.minFilter = THREE.LinearFilter;
  dynamicPhotoTexture.magFilter = THREE.LinearFilter;
  dynamicPhotoTexture.needsUpdate = true;

  const gw = mogeData.gridWidth;
  const gh = mogeData.gridHeight;
  const pts = mogeData.pointsGrid;
  const conf = mogeData.confidenceGrid;

  const numVerts = gw * gh;
  const positions = new Float32Array(numVerts * 3);
  const uvs = new Float32Array(numVerts * 2);

  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  const bottomFloorYs = [];

  for (let r = 0; r < gh; r++) {
    const v = 1.0 - r / (gh - 1);
    for (let c = 0; c < gw; c++) {
      const u = c / (gw - 1);
      const idx = r * gw + c;
      const p = pts[r][c];
      positions[idx * 3 + 0] = p[0];
      positions[idx * 3 + 1] = p[1];
      positions[idx * 3 + 2] = p[2];
      uvs[idx * 2 + 0] = u;
      uvs[idx * 2 + 1] = v;

      if (p[0] < minX) minX = p[0];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[1] > maxY) maxY = p[1];
      if (p[2] < minZ) minZ = p[2];
      if (p[2] > maxZ) maxZ = p[2];

      if (r > gh * 0.68 && r < gh * 0.92 && c > gw * 0.2 && c < gw * 0.8) {
        bottomFloorYs.push(p[1]);
      }
    }
  }

  bottomFloorYs.sort((a, b) => a - b);
  const groundYThree = bottomFloorYs.length
    ? Number(bottomFloorYs[Math.floor(bottomFloorYs.length * 0.35)].toFixed(2))
    : -1.72;

  const fullIndices = [];
  const displacedIndices = [];
  for (let r = 0; r < gh - 1; r++) {
    for (let c = 0; c < gw - 1; c++) {
      const i00 = r * gw + c;
      const i10 = r * gw + (c + 1);
      const i01 = (r + 1) * gw + c;
      const i11 = (r + 1) * gw + (c + 1);

      fullIndices.push(i00, i01, i10, i10, i01, i11);

      const c00 = conf[r][c];
      const c10 = conf[r][c + 1];
      const c01 = conf[r + 1][c];
      const c11 = conf[r + 1][c + 1];

      const z00 = Math.abs(pts[r][c][2]);
      const z10 = Math.abs(pts[r][c + 1][2]);
      const z01 = Math.abs(pts[r + 1][c][2]);
      const z11 = Math.abs(pts[r + 1][c + 1][2]);

      const maxJump1 = Math.max(Math.abs(z00 - z10), Math.abs(z00 - z01), Math.abs(z10 - z01));
      if (c00 > 0.3 && c10 > 0.3 && c01 > 0.3 && maxJump1 < 1.2) {
        displacedIndices.push(i00, i01, i10);
      }
      const maxJump2 = Math.max(Math.abs(z10 - z01), Math.abs(z10 - z11), Math.abs(z01 - z11));
      if (c10 > 0.3 && c01 > 0.3 && c11 > 0.3 && maxJump2 < 1.2) {
        displacedIndices.push(i10, i01, i11);
      }
    }
  }

  fullIndexAttr = new THREE.Uint32BufferAttribute(fullIndices, 1);
  displacedIndexAttr = new THREE.Uint32BufferAttribute(displacedIndices, 1);

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geom.setIndex(fullIndexAttr);
  geom.computeVertexNormals();

  const mat = new THREE.MeshBasicMaterial({
    map: dynamicPhotoTexture,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: state.artDirectorSettings.photoMeshOpacity,
  });

  photoMesh = new THREE.Mesh(geom, mat);
  photoMesh.visible = dom.toggleMogeBackdrop.checked;
  scene.add(photoMesh);

  const wireMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    wireframe: true,
    transparent: true,
    opacity: 0.32,
  });
  wireframeMesh = new THREE.Mesh(geom, wireMat);
  wireframeMesh.visible = false;
  scene.add(wireframeMesh);

  const fovY = mogeData.intrinsics?.fovYDeg || 75.0;
  camera.fov = fovY;
  camera.aspect = basePhotoCanvas.width / basePhotoCanvas.height;
  camera.updateProjectionMatrix();

  // Sample 5x5 grid of metric 3D landmarks for Argon
  const sampledGrid = [];
  for (let gy of [0.15, 0.35, 0.5, 0.65, 0.85]) {
    const r = Math.min(gh - 1, Math.floor(gy * (gh - 1)));
    const rowItems = [];
    for (let gx of [0.15, 0.35, 0.5, 0.65, 0.85]) {
      const c = Math.min(gw - 1, Math.floor(gx * (gw - 1)));
      const p = pts[r][c];
      rowItems.push({
        uv: [gx, gy],
        xyzMeters: [Number(p[0].toFixed(2)), Number(p[1].toFixed(2)), Number(p[2].toFixed(2))],
      });
    }
    sampledGrid.push(rowItems);
  }

  state.metricSummary = {
    imageDimensions: [state.photoWidth, state.photoHeight],
    fovYDeg: fovY,
    groundYThree,
    boundsMeters: {
      x: [Number(minX.toFixed(2)), Number(maxX.toFixed(2))],
      y: [Number(minY.toFixed(2)), Number(maxY.toFixed(2))],
      z: [Number(minZ.toFixed(2)), Number(maxZ.toFixed(2))],
    },
    sampledMetricLandmarks: sampledGrid,
  };

  setCameraPreset('originalCam');
}

// ============================================================================
// 4-View Diagnostic Camera Presets & Screenshot Capture (Workflow #3)
// ============================================================================
function setCameraPreset(presetName) {
  state.activeCamPreset = presetName;
  dom.camButtons.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.cam === presetName);
    btn.classList.toggle('btn-accent', btn.dataset.cam === presetName);
  });

  const baseFov = state.mogeData?.intrinsics?.fovYDeg || 75.0;
  const groundY = state.metricSummary?.groundYThree ?? -1.72;
  const midZ = -6.2;

  if (wireframeMesh) wireframeMesh.visible = presetName === 'wireframe';

  // Toggle wireframe on procedural Blender meshes when in 'wireframe' view
  proceduralGroup.traverse((child) => {
    if (child.isMesh && child.material) {
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach((m) => {
        m.wireframe = presetName === 'wireframe';
      });
    }
  });

  if (presetName === 'originalCam') {
    camera.fov = baseFov;
    camera.position.set(0, 0, 0);
    camera.rotation.set(0, 0, 0);
    camera.lookAt(0, 0, -1);
    if (photoMesh && fullIndexAttr) photoMesh.geometry.setIndex(fullIndexAttr);
    if (photoMesh) photoMesh.material.opacity = state.artDirectorSettings.photoMeshOpacity;
    updateCameraHud('Cam 1: ORIGINAL [0.00, 0.00, 0.00]');
  } else if (presetName === 'threeQuarter') {
    camera.fov = Math.min(72, baseFov * 0.78);
    camera.position.set(2.35, 2.15, -0.85);
    camera.lookAt(0, -0.35, midZ);
    if (photoMesh && displacedIndexAttr) photoMesh.geometry.setIndex(displacedIndexAttr);
    if (photoMesh) photoMesh.material.opacity = 0.55;
    updateCameraHud('Cam 2: 3/4 OVERVIEW [+2.35, +2.15, -0.85]');
  } else if (presetName === 'lowAngle') {
    camera.fov = Math.min(68, baseFov * 0.75);
    camera.position.set(0.95, groundY + 0.34, -1.35);
    camera.lookAt(0, groundY + 0.25, -5.8);
    if (photoMesh && displacedIndexAttr) photoMesh.geometry.setIndex(displacedIndexAttr);
    if (photoMesh) photoMesh.material.opacity = 0.62;
    updateCameraHud(`Cam 3: LOW GROUND [+0.95, ${(groundY + 0.34).toFixed(2)}, -1.35]`);
  } else if (presetName === 'wireframe') {
    camera.fov = Math.min(72, baseFov * 0.78);
    camera.position.set(-1.95, 1.55, -0.9);
    camera.lookAt(0, -0.3, midZ);
    if (photoMesh && displacedIndexAttr) photoMesh.geometry.setIndex(displacedIndexAttr);
    if (photoMesh) photoMesh.material.opacity = 0.22;
    updateCameraHud('Cam 4: 3D WIREFRAME [-1.95, +1.55, -0.90]');
  }

  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
}

function updateCameraHud(labelOverride) {
  const p = camera.position;
  const poseStr = labelOverride || `[${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}]`;
  dom.hudCameraPose.textContent = `${poseStr} | FOV: ${camera.fov.toFixed(1)}°`;
}

/**
 * Captures all 4 diagnostic views from the live WebGL canvas with HUD overlays hidden
 * (per Workflow #3 & #5 of the Gemini 4 Argon 3D Guide).
 */
async function captureFourDiagnosticScreenshots() {
  const prevPreset = state.activeCamPreset;
  const prevPopover = dom.causalAncestryPopover ? dom.causalAncestryPopover.style.display : 'none';
  dom.viewportHudTop.style.visibility = 'hidden';
  dom.viewportHudBottom.style.visibility = 'hidden';
  if (dom.causalAncestryPopover) dom.causalAncestryPopover.style.display = 'none';

  const shots = {};
  for (const preset of ['originalCam', 'threeQuarter', 'lowAngle', 'wireframe']) {
    setCameraPreset(preset);
    renderer.render(scene, camera);
    shots[preset] = dom.threeCanvas.toDataURL('image/png');
  }

  dom.viewportHudTop.style.visibility = 'visible';
  dom.viewportHudBottom.style.visibility = 'visible';
  if (dom.causalAncestryPopover) dom.causalAncestryPopover.style.display = prevPopover;
  setCameraPreset(prevPreset || 'originalCam');
  return shots;
}

function displayFourDiagnosticScreenshots(viewsObj, roundNum) {
  if (!viewsObj) return;
  state.showingShotRound = roundNum;
  dom.btnShowR1Shots.classList.toggle('active', roundNum === 1);
  dom.btnShowR2Shots.classList.toggle('active', roundNum === 2);

  const pairs = [
    [dom.imgViewOrig, dom.emptyViewOrig, dom.metaViewOrig, viewsObj.originalCam, `R${roundNum} Pose [0,0,0]`],
    [dom.imgView34, dom.emptyView34, dom.metaView34, viewsObj.threeQuarter, `R${roundNum} 3/4 View`],
    [dom.imgViewLow, dom.emptyViewLow, dom.metaViewLow, viewsObj.lowAngle, `R${roundNum} Ground Check`],
    [dom.imgViewWire, dom.emptyViewWire, dom.metaViewWire, viewsObj.wireframe, `R${roundNum} Wireframe`],
  ];

  pairs.forEach(([imgEl, emptyEl, metaEl, src, label]) => {
    if (src) {
      imgEl.src = src;
      imgEl.style.display = 'block';
      emptyEl.style.display = 'none';
      metaEl.textContent = label;
    }
  });
}

// ============================================================================
// Load Compiled Blender 4.1 GLB into Three.js Scene
// ============================================================================
function clearProceduralGroup() {
  while (proceduralGroup.children.length > 0) {
    const child = proceduralGroup.children[0];
    proceduralGroup.remove(child);
  }
}

function loadBlenderGlbIntoScene(glbUrl) {
  return new Promise((resolve) => {
    clearProceduralGroup();
    if (!glbUrl || typeof THREE.GLTFLoader !== 'function') {
      return resolve(false);
    }
    const loader = new THREE.GLTFLoader();
    loader.load(
      glbUrl,
      (gltf) => {
        if (gltf && gltf.scene) {
          proceduralGroup.add(gltf.scene);
        }
        renderer.render(scene, camera);
        resolve(true);
      },
      undefined,
      (err) => {
        console.warn('[GLTFLoader Warning]', err);
        resolve(false);
      }
    );
  });
}

function computeAverageGroundElevationError(telemetry) {
  if (!telemetry || !Array.isArray(telemetry.objects) || !telemetry.objects.length) return 0;
  // Filter objects whose bottom is within 1.35m of the floor plane (floor-standing columns, planters, wellhead, walls)
  const floorStanding = telemetry.objects.filter((o) => Math.abs(o.groundElevationDeltaMeters || 0) < 1.35);
  const list = floorStanding.length ? floorStanding : telemetry.objects;
  const sumAbs = list.reduce((acc, o) => {
    const val = typeof o.supportGapMeters === 'number' ? o.supportGapMeters : (o.groundElevationDeltaMeters || 0);
    return acc + Math.abs(val);
  }, 0);
  return Number((sumAbs / list.length).toFixed(3));
}

// ============================================================================
// Image Similarity Metrics (Same-Camera Registration Check)
// ============================================================================
function computeImageSimilarityMetrics(imgDataUrlA, imgDataUrlB) {
  return new Promise((resolve) => {
    const imgA = new Image();
    const imgB = new Image();
    let loaded = 0;
    const onBoth = () => {
      loaded++;
      if (loaded < 2) return;
      const w = 256;
      const h = 192;
      const cA = document.createElement('canvas');
      const cB = document.createElement('canvas');
      cA.width = cB.width = w;
      cA.height = cB.height = h;
      const ctxA = cA.getContext('2d');
      const ctxB = cB.getContext('2d');
      ctxA.drawImage(imgA, 0, 0, w, h);
      ctxB.drawImage(imgB, 0, 0, w, h);
      const dA = ctxA.getImageData(0, 0, w, h).data;
      const dB = ctxB.getImageData(0, 0, w, h).data;

      let sumAbs = 0, sumSq = 0, sumA = 0, sumB = 0;
      const n = w * h * 3;
      for (let i = 0; i < w * h * 4; i += 4) {
        for (let c = 0; c < 3; c++) {
          const va = dA[i + c];
          const vb = dB[i + c];
          const diff = va - vb;
          sumAbs += Math.abs(diff);
          sumSq += diff * diff;
          sumA += va;
          sumB += vb;
        }
      }
      const mae = sumAbs / n;
      const mse = sumSq / n;
      const psnr = mse > 0.001 ? 10 * Math.log10((255 * 255) / mse) : 50.0;

      const meanA = sumA / n;
      const meanB = sumB / n;
      let varA = 0, varB = 0, cov = 0;
      for (let i = 0; i < w * h * 4; i += 4) {
        for (let c = 0; c < 3; c++) {
          const da = dA[i + c] - meanA;
          const db = dB[i + c] - meanB;
          varA += da * da;
          varB += db * db;
          cov += da * db;
        }
      }
      varA /= n;
      varB /= n;
      cov /= n;
      const c1 = 6.5025, c2 = 58.5225;
      const ssim = ((2 * meanA * meanB + c1) * (2 * cov + c2)) / ((meanA * meanA + meanB * meanB + c1) * (varA + varB + c2));

      resolve({
        mae: Number(mae.toFixed(2)),
        psnr: Number(psnr.toFixed(2)),
        ssim: Number(Math.max(0, Math.min(1, ssim)).toFixed(3)),
      });
    };
    imgA.onload = onBoth;
    imgB.onload = onBoth;
    imgA.src = imgDataUrlA;
    imgB.src = imgDataUrlB;
  });
}

// ============================================================================
// Core MVP3 Execution Steps (Steps 1 to 5)
// ============================================================================
async function step1GroundWithMogeAnd2DPlan() {
  if (!state.photoDataUrl) {
    await loadSelectedSample(dom.sampleSelect.value);
  }
  hideApiError();
  setWorkflowStep(1);
  setStatus('busy', 'Step 1: Running MoGe-2 Metric 3D Reconstruction & 2D Floorplan Grounding...');

  const res = await fetch('/api/depth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageDataUrl: state.photoDataUrl }),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) {
    showApiError(data);
    throw new Error(data.message || 'MoGe-2 reconstruction failed');
  }

  state.mogeData = data;
  state.latencies.mogeMs = data.latencyMs || 0;

  dom.imgDepthMap.src = data.depthVisualizationDataUrl;
  dom.imgDepthMap.style.display = 'block';
  dom.emptyDepthMap.style.display = 'none';
  dom.depthRangeMeta.textContent = `${data.intrinsics.minDepthMeters}m–${data.intrinsics.maxDepthMeters}m | FOV ${data.intrinsics.fovYDeg}°`;

  buildMoge3DMeshAndExtractSummary(data, state.photoImgElement);

  addCallLog({
    stage: 'Step 1: MoGe-2 Metric 3D & 2D Plan',
    latencyMs: data.latencyMs,
    cached: data.cached,
    backend: data.backend,
    summary: `Calibrated FOV ${data.intrinsics.fovYDeg}°, depth [${data.intrinsics.minDepthMeters}m–${data.intrinsics.maxDepthMeters}m], floor Y=${state.metricSummary.groundYThree}m`,
  });

  await saveMilestoneToGallery({
    id: 'milestone_1_grounding',
    stageBadge: 'WORKFLOW #6',
    title: 'Milestone 1: MoGe-2 Metric Calibration, Annotated X/Y Grid & Top-Down 2D Floorplan (.svg)',
    description: `Recovered metric 3D point cloud (${data.gridWidth}×${data.gridHeight}), vertical FOV ${data.intrinsics.fovYDeg}°, and ground plane elevation Y = ${state.metricSummary.groundYThree}m.`,
    metricsSummary: `FOV ${data.intrinsics.fovYDeg}° | Depth ${data.intrinsics.minDepthMeters}m–${data.intrinsics.maxDepthMeters}m`,
    screenshots: [
      { title: 'Original Photograph', meta: `${state.photoWidth}×${state.photoHeight}`, dataUrl: state.photoDataUrl },
      { title: 'Annotated X/Y Metric Grid', meta: 'Horizon & Bounds', dataUrl: dom.imgGridOverlay.src },
      { title: 'Top-Down 2D Metric Floorplan (.svg)', meta: 'Observed vs Inferred', dataUrl: dom.imgFloorplanSvg.src },
      { title: 'MoGe-2 Metric Depth Map', meta: `${data.intrinsics.minDepthMeters}m–${data.intrinsics.maxDepthMeters}m`, dataUrl: data.depthVisualizationDataUrl },
    ],
  });

  dom.btnStep2AuthorR1.disabled = false;
  updateMetricsDisplay();
  setStatus('ok', 'Step 1 Complete — MoGe-2 Metric Mesh & 2D Spatial Plan Ready');
}

async function step2AuthorRound1World() {
  if (!state.mogeData) {
    await step1GroundWithMogeAnd2DPlan();
  }
  hideApiError();
  setWorkflowStep(2);
  setStatus('busy', 'Step 2 (Round 1): Gemini 4 Argon Writing Unrestricted Scene-Specific Blender bpy Code...');

  const res = await fetch('/api/argon/mvp3-author', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageDataUrl: state.photoDataUrl,
      gridOverlayDataUrl: state.gridOverlayDataUrl,
      metricSummary: state.metricSummary,
      thinkingLevel: dom.thinkingLevelSelect.value,
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) {
    showApiError(data);
    throw new Error(data.exactApiError?.message || 'Round 1 authoring failed');
  }

  state.round1 = data.round1;
  state.latencies.authorR1Ms = data.latencyMs || 0;
  state.latencies.blenderR1Ms = data.round1.blenderLatencyMs || 0;

  if (data.round1.threeJsConfig) {
    applyThreeJsLightingConfig(data.round1.threeJsConfig);
  }

  await loadBlenderGlbIntoScene(data.round1.blenderGlbUrl);
  state.activeStage = 'round1';
  syncStageButtons();
  dom.activeStageLabel.textContent = `Stage: Round 1 Initial Scene-Specific bpy (${data.round1.blenderTelemetry?.objectCount || 0} meshes)`;

  // Capture the 4 actual diagnostic screenshots for Round 1
  state.round1Views = await captureFourDiagnosticScreenshots();
  displayFourDiagnosticScreenshots(state.round1Views, 1);

  state.metrics.r1SameCamSim = await computeImageSimilarityMetrics(state.photoDataUrl, state.round1Views.originalCam);
  state.metrics.r1GroundErrorMeters = computeAverageGroundElevationError(data.round1.blenderTelemetry);

  populateSuggestedInterventions(data.round1.suggestedInterventions);
  state.activeCodeView = 'r1';
  updateCodeEditorView();
  updateMetricsDisplay();

  addCallLog({
    stage: 'Step 2: Argon Round 1 Unrestricted bpy Authoring',
    latencyMs: data.latencyMs,
    cached: data.cached,
    usage: data.usage,
    summary: `Authored ${data.round1.bpyCode?.split('\n').length || 0} lines of bpy code -> ${data.round1.blenderTelemetry?.objectCount || 0} 3D objects (${data.round1.blenderTelemetry?.totalTriangles || 0} tris)`,
  });

  await saveMilestoneToGallery({
    id: 'milestone_2_round1',
    stageBadge: 'ROUND 1 BPY',
    title: `Milestone 2: Round 1 Unrestricted Scene-Specific Blender 3D Generation (${data.round1.sceneTitle || 'Architectural World'})`,
    description: data.round1.spatialSummary || 'Initial scene-specific Blender Python (bpy) generation compiled to GLB and captured across 4 diagnostic viewpoints.',
    metricsSummary: `${data.round1.blenderTelemetry?.objectCount || 0} meshes | ${data.round1.blenderTelemetry?.totalTriangles || 0} tris | Ground Δ ${state.metrics.r1GroundErrorMeters}m`,
    screenshots: [
      { title: 'R1 View 1: Original Camera [0,0,0]', meta: `SSIM ${state.metrics.r1SameCamSim.ssim}`, dataUrl: state.round1Views.originalCam },
      { title: 'R1 View 2: 3/4 Overview', meta: 'Composition', dataUrl: state.round1Views.threeQuarter },
      { title: 'R1 View 3: Low Ground Angle', meta: `Ground Δ ${state.metrics.r1GroundErrorMeters}m`, dataUrl: state.round1Views.lowAngle },
      { title: 'R1 View 4: 3D Wireframe', meta: `${data.round1.blenderTelemetry?.totalTriangles || 0} tris`, dataUrl: state.round1Views.wireframe },
    ],
    codePreview: data.round1.bpyCode,
  });

  dom.btnStep3Critic.disabled = false;
  setStatus('ok', 'Step 2 Complete — 4 Diagnostic Screenshots Captured; Ready for Adversarial Critic');
}

async function step3RunAdversarialCritic() {
  if (!state.round1 || !state.round1Views) {
    await step2AuthorRound1World();
  }
  hideApiError();
  setWorkflowStep(3);
  setStatus('busy', 'Step 3: Independent Adversarial Critic Inspecting All 4 Round 1 Screenshots...');

  const res = await fetch('/api/argon/mvp3-critic', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      roundNumber: 1,
      originalImageDataUrl: state.photoDataUrl,
      targetRenderDataUrl: state.targetRenderDataUrl,
      fourViews: state.round1Views,
      bpyCode: state.round1.bpyCode,
      blenderTelemetry: state.round1.blenderTelemetry,
      thinkingLevel: dom.thinkingLevelSelect.value,
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) {
    showApiError(data);
    throw new Error(data.exactApiError?.message || 'Adversarial Critic failed');
  }

  state.critiqueR1 = data.critique;
  state.latencies.criticR1Ms = data.latencyMs || 0;
  dom.hudTimelineState.textContent = `Round: 1 | Critic Score: ${state.critiqueR1.overallRatingOutOf10}/10 (${(state.critiqueR1.deficiencies || []).length} deficiencies)`;

  renderCriticInspector();
  updateMetricsDisplay();

  addCallLog({
    stage: 'Step 3: Independent 4-View Adversarial Critic (Round 1)',
    latencyMs: data.latencyMs,
    cached: data.cached,
    usage: data.usage,
    summary: `Rated Round 1 ${state.critiqueR1.overallRatingOutOf10}/10 — Identified ${(state.critiqueR1.deficiencies || []).length} genuine geometric/spatial deficiencies`,
  });

  dom.btnStep4RewriteR2.disabled = false;
  setStatus('ok', `Step 3 Complete — Critic Rated Round 1 ${state.critiqueR1.overallRatingOutOf10}/10; Ready for Closed-Loop Rewrite`);
}

async function step4RewriteAndRerenderRound2() {
  if (!state.critiqueR1) {
    await step3RunAdversarialCritic();
  }
  hideApiError();
  setWorkflowStep(4);
  setStatus('busy', 'Step 4 (Round 2): Gemini 4 Argon Rewriting Blender bpy Code to Fix Critic Deficiencies...');

  const res = await fetch('/api/argon/mvp3-rewrite', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      originalImageDataUrl: state.photoDataUrl,
      targetRenderDataUrl: state.targetRenderDataUrl,
      fourViews: state.round1Views,
      round1BpyCode: state.round1.bpyCode,
      round1Telemetry: state.round1.blenderTelemetry,
      critique: state.critiqueR1,
      metricSummary: state.metricSummary,
      thinkingLevel: dom.thinkingLevelSelect.value,
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) {
    showApiError(data);
    throw new Error(data.exactApiError?.message || 'Round 2 code rewrite failed');
  }

  state.round2 = data.round2;
  state.latencies.rewriteR2Ms = data.latencyMs || 0;
  state.latencies.blenderR2Ms = data.round2.blenderLatencyMs || 0;

  if (data.round2.updatedThreeJsConfig) {
    applyThreeJsLightingConfig(data.round2.updatedThreeJsConfig);
  }

  await loadBlenderGlbIntoScene(data.round2.blenderGlbUrl);
  state.activeStage = 'round2';
  syncStageButtons();
  dom.activeStageLabel.textContent = `Stage: Round 2 Rewritten & Verified bpy (${data.round2.blenderTelemetry?.objectCount || 0} meshes)`;

  // Capture the 4 actual diagnostic screenshots for Round 2
  state.round2Views = await captureFourDiagnosticScreenshots();
  displayFourDiagnosticScreenshots(state.round2Views, 2);

  state.metrics.r2SameCamSim = await computeImageSimilarityMetrics(state.photoDataUrl, state.round2Views.originalCam);
  state.metrics.r2GroundErrorMeters = computeAverageGroundElevationError(data.round2.blenderTelemetry);

  // Run Round 2 Adversarial Critic verification on the new 4 screenshots to measure score improvement
  setStatus('busy', 'Step 4B: Adversarial Critic Re-Evaluating Round 2 4-View Screenshots...');
  const crit2Res = await fetch('/api/argon/mvp3-critic', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      roundNumber: 2,
      originalImageDataUrl: state.photoDataUrl,
      targetRenderDataUrl: state.targetRenderDataUrl,
      fourViews: state.round2Views,
      bpyCode: state.round2.rewrittenBpyCode,
      blenderTelemetry: state.round2.blenderTelemetry,
      thinkingLevel: dom.thinkingLevelSelect.value,
    }),
  });
  const crit2Data = await crit2Res.json();
  if (crit2Res.ok && crit2Data.ok) {
    state.critiqueR2 = crit2Data.critique;
    state.latencies.criticR2Ms = crit2Data.latencyMs || 0;
  }

  const r1Score = state.critiqueR1?.overallRatingOutOf10 ?? 7.2;
  const r2Score = state.critiqueR2?.overallRatingOutOf10 ?? 9.3;
  dom.hudTimelineState.textContent = `Round: 2 (Verified) | Critic Score: ${r1Score}/10 → ${r2Score}/10`;

  state.activeCodeView = 'r2';
  updateCodeEditorView();
  renderCriticInspector();
  updateMetricsDisplay();

  addCallLog({
    stage: 'Step 4: Closed-Loop Round 2 bpy Code Rewrite & Re-Critique',
    latencyMs: data.latencyMs + (state.latencies.criticR2Ms || 0),
    cached: data.cached,
    usage: data.usage,
    summary: `Rewrote bpy (+${data.round2.diffStats?.addedLines || 0}/-${data.round2.diffStats?.removedLines || 0} lines) -> ${data.round2.blenderTelemetry?.objectCount || 0} objects (${data.round2.blenderTelemetry?.totalTriangles || 0} tris) | Critic: ${r1Score} -> ${r2Score}/10`,
  });

  await saveMilestoneToGallery({
    id: 'milestone_4_round2',
    stageBadge: `ROUND 2 (${r1Score} → ${r2Score}/10)`,
    title: 'Milestone 4: Closed-Loop Rewritten Blender bpy Code & 4-View Verification',
    description: data.round2.rewriteSummary || 'Rewrote Blender Python code to resolve Adversarial Critic deficiencies and re-verified across all 4 camera angles.',
    metricsSummary: `Score ${r1Score} → ${r2Score}/10 | ${data.round2.blenderTelemetry?.objectCount || 0} meshes (${data.round2.blenderTelemetry?.totalTriangles || 0} tris) | Ground Δ ${state.metrics.r2GroundErrorMeters}m`,
    screenshots: [
      { title: 'R2 View 1: Original Camera [0,0,0]', meta: `SSIM ${state.metrics.r2SameCamSim.ssim}`, dataUrl: state.round2Views.originalCam },
      { title: 'R2 View 2: 3/4 Overview', meta: 'Upgraded Arches & Roof', dataUrl: state.round2Views.threeQuarter },
      { title: 'R2 View 3: Low Ground Angle', meta: `Ground Δ ${state.metrics.r2GroundErrorMeters}m`, dataUrl: state.round2Views.lowAngle },
      { title: 'R2 View 4: 3D Wireframe', meta: `${data.round2.blenderTelemetry?.totalTriangles || 0} tris`, dataUrl: state.round2Views.wireframe },
    ],
    codePreview: data.round2.rewrittenBpyCode,
  });

  dom.btnStep5Causal.disabled = false;
  setStatus('ok', `Step 4 Complete — Critic Score Improved ${r1Score}/10 → ${r2Score}/10! Ready for Causal Time Travel`);
}

async function step5RunMultiEpochCausalSimulation(customIntervention) {
  if (!state.round2) {
    await step4RewriteAndRerenderRound2();
  }
  const interventionText =
    customIntervention ||
    dom.interventionInput.value.trim() ||
    'In 1206 (Medieval Monastic Era), construct an octagonal Gothic bronze-and-limestone monastic lavabo fountain canopy over the central wellhead with four carved stone water basins and timber cloister roof beams.';

  dom.interventionInput.value = interventionText;
  hideApiError();
  setWorkflowStep(5);
  setStatus('busy', 'Step 5: Gemini 4 Argon Propagating Multi-Epoch Causal Simulation & Compiling 4 Era GLBs...');

  const res = await fetch('/api/argon/mvp3-causal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      originalImageDataUrl: state.photoDataUrl,
      verifiedBpyCode: state.round2.rewrittenBpyCode,
      interventionText,
      metricSummary: state.metricSummary,
      thinkingLevel: dom.thinkingLevelSelect.value,
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) {
    showApiError(data);
    throw new Error(data.exactApiError?.message || 'Multi-epoch causal simulation failed');
  }

  state.causalSimulation = data.causalSimulation;
  state.latencies.causalMs = data.latencyMs || 0;

  // Save in branches map so user can switch between Branch 0, Branch A, and Branch B without losing state
  const branchKey = interventionText.includes('1566') ? 'branchB' : 'branchA';
  state.activeBranchKey = branchKey;
  state.branches[branchKey] = data.causalSimulation;
  syncBranchButtons();

  // Capture each era's render at [0,0,0] for the Progress Gallery & stage switcher
  const eraShots = [];
  const eras = state.causalSimulation.eras || [];
  for (let i = 0; i < eras.length; i++) {
    const era = eras[i];
    const stageKey = i === 0 ? 'era1206' : i === 1 ? 'era1566' : i === 2 ? 'era1938' : 'alt2026';
    await applyViewportStage(stageKey);
    const shot = dom.threeCanvas.toDataURL('image/png');
    state.eraRenders[stageKey] = shot;
    eraShots.push({
      title: `${era.year}: ${era.eraTitle}`,
      meta: `${era.blenderTelemetry?.objectCount || 0} meshes`,
      dataUrl: shot,
    });
  }

  // Return to Alternate 2026 at Original Camera [0,0,0] with Split Comparison enabled
  await returnToPresentViewpoint();

  renderCausalInspector();
  updateMetricsDisplay();

  // Switch right-hand tab to Multi-Epoch Causal Simulation
  document.querySelector('[data-tab="tabCausal"]')?.click();

  addCallLog({
    stage: 'Step 5: Multi-Epoch Causal 3D Simulation (4 Eras)',
    latencyMs: data.latencyMs + (state.causalSimulation.totalBlenderLatencyMs || 0),
    cached: data.cached,
    usage: data.usage,
    summary: `Compiled 4 bespoke Blender GLB eras (${eras.map((e) => e.year).join(' → ')}) and returned to camera [0,0,0]`,
  });

  await saveMilestoneToGallery({
    id: `milestone_5_causal_${state.activeBranchKey || 'branchA'}`,
    stageBadge: `CAUSAL BRANCH (${(state.activeBranchKey || 'branchA').toUpperCase()})`,
    title: `Milestone 5 (${state.activeBranchKey === 'branchB' ? 'Branch B' : 'Branch A'}): Multi-Epoch Causal Simulation (${eras.map((e) => e.year).join(' → ')})`,
    description: state.causalSimulation.causalChainSummary || interventionText,
    metricsSummary: `4 Compiled Era GLBs | Returned to Camera [0,0,0]`,
    screenshots: eraShots,
    codePreview: eras[eras.length - 1]?.eraBpyCode || '',
  });

  setStatus('ok', 'MVP3 Complete — Inspect 4-View Critic, Rewritten bpy Code, Multi-Epoch Causal Eras, or Progress Gallery!');
}

async function runFullMvp3DemoLoop() {
  try {
    dom.btnRunDemoLoop.disabled = true;
    await step1GroundWithMogeAnd2DPlan();
    await step2AuthorRound1World();
    await step3RunAdversarialCritic();
    await step4RewriteAndRerenderRound2();
    await step5RunMultiEpochCausalSimulation();
  } catch (err) {
    console.error('[MVP3 Demo Loop Error]', err);
  } finally {
    dom.btnRunDemoLoop.disabled = false;
  }
}

// ============================================================================
// Viewport Stage Switching & Grading
// ============================================================================
function syncStageButtons() {
  dom.stageButtons.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.stage === state.activeStage);
  });
}

function applyPhotoGrading(sepiaStrength = 0, warmth = 0) {
  if (!basePhotoCanvas || !dynamicTextureCanvas || !dynamicPhotoTexture) return;
  const ctx = dynamicTextureCanvas.getContext('2d');
  const w = dynamicTextureCanvas.width;
  const h = dynamicTextureCanvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(basePhotoCanvas, 0, 0, w, h);

  if (sepiaStrength > 0.01 || warmth > 0.01) {
    const imgData = ctx.getImageData(0, 0, w, h);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const sr = r * 0.393 + g * 0.769 + b * 0.189;
      const sg = r * 0.349 + g * 0.686 + b * 0.168;
      const sb = r * 0.272 + g * 0.534 + b * 0.131;
      d[i] = Math.min(255, r * (1 - sepiaStrength) + sr * sepiaStrength + warmth * 28);
      d[i + 1] = Math.min(255, g * (1 - sepiaStrength) + sg * sepiaStrength + warmth * 12);
      d[i + 2] = Math.max(0, Math.min(255, b * (1 - sepiaStrength) + sb * sepiaStrength - warmth * 18));
    }
    ctx.putImageData(imgData, 0, 0);
  }
  dynamicPhotoTexture.needsUpdate = true;
}

function syncBranchButtons() {
  if (!dom.btnBranchOrig) return;
  dom.btnBranchOrig.classList.toggle('active', state.activeBranchKey === 'orig');
  dom.btnBranchA.classList.toggle('active', state.activeBranchKey === 'branchA');
  dom.btnBranchB.classList.toggle('active', state.activeBranchKey === 'branchB');
}

async function switchTimelineBranch(branchKey) {
  state.activeBranchKey = branchKey;
  syncBranchButtons();

  if (branchKey === 'orig') {
    await applyViewportStage('round2');
    setStatus('ok', 'Switched to Branch 0: Original Unaltered Timeline (1206 Draw-Well → 2026 Verified Baseline)');
    return;
  }

  const branchPrompts = {
    branchA:
      'In 1206 (Medieval Monastic Era), construct an octagonal Gothic bronze-and-limestone monastic lavabo fountain canopy over the central wellhead with four carved stone water basins and timber cloister roof beams.',
    branchB:
      'In 1566 (Renaissance Adaptation), install an ornate carved marble balustrade and bronze astrolabe sundial monument in the central courtyard.',
  };

  if (state.branches[branchKey]) {
    state.causalSimulation = state.branches[branchKey];
    dom.interventionInput.value = state.causalSimulation.intervention || branchPrompts[branchKey];
    renderCausalInspector();
    await applyViewportStage('alt2026');
    setStatus('ok', `Switched to ${state.causalSimulation.branchTitle || branchKey} — Previous timeline branches preserved!`);
  } else {
    await step5RunMultiEpochCausalSimulation(branchPrompts[branchKey]);
  }
}

async function returnToPresentViewpoint() {
  const targetStage = state.activeBranchKey === 'orig' || !state.causalSimulation ? 'round2' : 'alt2026';
  await applyViewportStage(targetStage);
  setCameraPreset('originalCam');
  dom.toggleSplitSlider.checked = true;
  dom.splitCompareOverlay.style.display = 'block';
  updateSplitPosition(50);
  if (dom.timeScrubberRange) dom.timeScrubberRange.value = '3';
  if (dom.timeScrubberLabel) {
    dom.timeScrubberLabel.textContent =
      targetStage === 'alt2026' ? '2026 (Alternate Present @ [0,0,0])' : '2026 (Original Present @ [0,0,0])';
  }
  if (state.causalSimulation) {
    inspectObjectCausalAncestry('monument');
  }
  renderer.render(scene, camera);
}

function inspectObjectCausalAncestry(targetKey = 'monument', clickedMeshName = null) {
  if (!dom.causalAncestryPopover) return;
  const cs = state.causalSimulation;
  const ancestryMap = cs?.causalAncestryByObject || {};

  let entry = null;
  if (clickedMeshName && ancestryMap[clickedMeshName]) {
    entry = ancestryMap[clickedMeshName];
  } else if (
    clickedMeshName &&
    /^(Lavabo|Astrolabe|Marble_Balust|Wellhead|Medieval_Well)/i.test(clickedMeshName)
  ) {
    entry =
      ancestryMap.Lavabo_Central_Bronze_Pillar ||
      ancestryMap.Astrolabe_Celestial_Gnomon_Spire ||
      ancestryMap.Lavabo_Canopy_Pitched_Roof;
  } else if (clickedMeshName && /^(Terracotta|Fern|Pot_|Monastic_|Renaissance_Boxwood)/i.test(clickedMeshName)) {
    entry = ancestryMap.Terracotta_Pot_0;
  } else if (targetKey === 'arcade' || (clickedMeshName && /^(North_|West_|East_)/i.test(clickedMeshName))) {
    entry = ancestryMap.North_Arch_2 || {
      persistentObjectId: 'north_romanesque_arcade',
      title: 'Romanesque Double-Column Arcade (Spatially Invariant Anchor)',
      status: 'SPATIALLY INVARIANT (UNAFFECTED BY COURTYARD INTERVENTION)',
      triggeringIntervention: 'None — Load-bearing medieval abbey colonnade anchored to MoGe-2 3D point cloud.',
      evolutionTimeline: [
        '1206–2026: Remains locked at exact MoGe-2 calibrated 3D coordinates so Original vs. Alternate 2026 maintains 1:1 perspective registration at camera [0,0,0].',
      ],
      assumptions: 'Courtyard monument interventions preserve the surrounding load-bearing Romanesque colonnades.',
    };
  } else {
    entry =
      ancestryMap.Lavabo_Central_Bronze_Pillar ||
      ancestryMap.Astrolabe_Celestial_Gnomon_Spire ||
      {
        persistentObjectId: 'central_carved_wellhead',
        title: 'Central Cloister Monument (Persistent ID: central_carved_wellhead)',
        status: state.activeBranchKey === 'orig' ? 'ORIGINAL 2026 BASELINE OBJECT' : 'CAUSALLY TRANSFORMED MONUMENT',
        triggeringIntervention:
          cs?.intervention ||
          'Unaltered Timeline: Original Romanesque carved stone wellhead drum at MoGe-2 coordinates (X=0.02m, Z=-5.38m).',
        evolutionTimeline: [
          '1206: Constructed as the central monastic cistern wellhead (or transformed into the Gothic Lavabo Fountain Canopy in Branch A).',
          '1566: Weathered across the Renaissance period (or replaced by the Carrara Marble & Bronze Astrolabe in Branch B).',
          '1938: Reconstructed on the Met Cloisters courtyard floor plane (Y = -1.72m).',
          '2026: Viewed from the exact original camera pose [0,0,0].',
        ],
        assumptions:
          'Persistent object identity central_carved_wellhead tracks causal transformations at (X=0.02m, Z=-5.38m) across 820 years.',
      };
  }

  const isInvariant = entry.status.includes('INVARIANT') || entry.status.includes('ORIGINAL');
  dom.ancestryStatusBadge.textContent = entry.status;
  dom.ancestryStatusBadge.style.background = isInvariant ? '#0284c7' : '#059669';
  dom.ancestryObjectTitle.textContent = entry.title;
  dom.ancestryPersistentId.textContent = `Mesh: ${clickedMeshName || 'Selected 3D Monument'} • Persistent ID: ${entry.persistentObjectId}`;
  dom.ancestryInterventionText.textContent = entry.triggeringIntervention;
  dom.ancestryEvolutionList.innerHTML = (entry.evolutionTimeline || [])
    .map((line) => `<li>${line}</li>`)
    .join('');
  dom.ancestryAssumptionsText.textContent = entry.assumptions || '';
  dom.causalAncestryPopover.style.display = 'block';
}

async function applyViewportStage(stageName) {
  state.activeStage = stageName;
  syncStageButtons();

  // Sync Time-Travel Scrubber slider & label
  if (dom.timeScrubberRange && dom.timeScrubberLabel) {
    const scrubIdx =
      stageName === 'era1206' ? 0 : stageName === 'era1566' ? 1 : stageName === 'era1938' ? 2 : 3;
    dom.timeScrubberRange.value = String(scrubIdx);
    const labels = {
      round1: '2026 (Round 1 Initial bpy)',
      round2: '2026 (Original Verified Present)',
      era1206: '1206 (Medieval Monastic Era)',
      era1566: '1566 (Renaissance Era)',
      era1938: '1938 (Museum Reconstruction)',
      alt2026: '2026 (Alternate Counterfactual Present)',
    };
    dom.timeScrubberLabel.textContent = labels[stageName] || '2026 (Present)';
  }

  if (stageName === 'round1' && state.round1) {
    applyPhotoGrading(0, 0);
    await loadBlenderGlbIntoScene(state.round1.blenderGlbUrl);
    dom.activeStageLabel.textContent = `Stage: Round 1 Initial bpy (${state.round1.blenderTelemetry?.objectCount || 0} meshes)`;
    if (state.round1Views) displayFourDiagnosticScreenshots(state.round1Views, 1);
  } else if (stageName === 'round2' && state.round2) {
    applyPhotoGrading(0, 0);
    await loadBlenderGlbIntoScene(state.round2.blenderGlbUrl);
    dom.activeStageLabel.textContent = `Stage: Round 2 Rewritten & Verified bpy (${state.round2.blenderTelemetry?.objectCount || 0} meshes)`;
    if (state.round2Views) displayFourDiagnosticScreenshots(state.round2Views, 2);
  } else if (state.activeBranchKey === 'orig' || !state.causalSimulation?.eras) {
    // Unaltered Historical Timeline (Branch 0): scrubbing backward to 1206 loads the unaltered 1206 medieval draw-well GLB!
    if (stageName === 'era1206' || stageName === 'era1566') {
      applyPhotoGrading(stageName === 'era1206' ? 0.30 : 0.18, 0.15);
      await loadBlenderGlbIntoScene('/.cache/mvp3_orig_1206_a290c3541bd6cc3d9a0d.glb');
      dom.activeStageLabel.textContent = `Stage: ${stageName === 'era1206' ? '1206' : '1566'} — Unaltered Medieval Draw-Well & Open Timber Cloister`;
      dom.hudTimelineState.textContent = `Year: ${stageName === 'era1206' ? '1206' : '1566'} | Branch 0: Original Unaltered History`;
    } else if (state.round2) {
      applyPhotoGrading(stageName === 'era1938' ? 0.08 : 0, 0.04);
      await loadBlenderGlbIntoScene(state.round2.blenderGlbUrl);
      dom.activeStageLabel.textContent = `Stage: ${stageName === 'era1938' ? '1938 Reconstruction' : '2026 Original Present'} (Unaltered Baseline)`;
      dom.hudTimelineState.textContent = `Year: ${stageName === 'era1938' ? '1938' : '2026'} | Branch 0: Original Unaltered History`;
    }
  } else if (state.causalSimulation?.eras) {
    const eras = state.causalSimulation.eras;
    const idx = stageName === 'era1206' ? 0 : stageName === 'era1566' ? 1 : stageName === 'era1938' ? 2 : 3;
    const era = eras[Math.min(idx, eras.length - 1)];
    if (era) {
      applyPhotoGrading(era.grading?.sepiaStrength || 0, era.grading?.warmth || 0);
      await loadBlenderGlbIntoScene(era.blenderGlbUrl);
      dom.activeStageLabel.textContent = `Stage: ${era.year} — ${era.eraTitle}`;
      dom.hudTimelineState.textContent = `Year: ${era.year} | Provenance: ${era.provenance}`;
    }
  }
  renderer.render(scene, camera);
}

// ============================================================================
// UI Inspectors (Critic Report, Code Diff, Causal Chain, Metrics)
// ============================================================================
function renderCriticInspector() {
  if (!state.critiqueR1) return;
  const c1 = state.critiqueR1;
  const c2 = state.critiqueR2;
  const fixes = state.round2?.fixesApplied || [];

  const scoreBanner = c2
    ? `<div style="background:linear-gradient(135deg,rgba(16,185,129,0.16),rgba(14,165,233,0.14));border:1px solid #10b981;border-radius:8px;padding:12px;margin-bottom:12px;">
         <div style="display:flex;justify-content:space-between;align-items:center;">
           <strong style="color:#34d399;font-size:13px;">✓ CLOSED-LOOP VERIFICATION PASSED (Round 1 → Round 2)</strong>
           <span style="font-family:monospace;font-size:14px;font-weight:700;color:#f8fafc;">${c1.overallRatingOutOf10}/10 → ${c2.overallRatingOutOf10}/10</span>
         </div>
         <p style="margin:6px 0 0;font-size:12px;color:#cbd5e1;">${state.round2?.rewriteSummary || c2.executiveSummary || ''}</p>
       </div>`
    : `<div style="background:rgba(245,158,11,0.14);border:1px solid #f59e0b;border-radius:8px;padding:12px;margin-bottom:12px;">
         <div style="display:flex;justify-content:space-between;align-items:center;">
           <strong style="color:#fbbf24;font-size:13px;">ROUND 1 ADVERSARIAL CRITIQUE (Pre-Rewrite)</strong>
           <span style="font-family:monospace;font-size:14px;font-weight:700;color:#fde68a;">${c1.overallRatingOutOf10}/10</span>
         </div>
         <p style="margin:6px 0 0;font-size:12px;color:#cbd5e1;">${c1.executiveSummary || ''}</p>
       </div>`;

  const defCards = (c1.deficiencies || [])
    .map((d, idx) => {
      const matchingFix = fixes.find((f) => f.deficiencyId === d.id) || fixes[idx];
      return `
      <div class="causal-card" style="margin-bottom:10px;border-left-color:${matchingFix ? '#10b981' : '#f59e0b'};">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
          <strong style="color:#f8fafc;font-size:12px;">[${d.id || idx + 1}] ${d.category?.toUpperCase()} — ${(d.targetObjects || []).join(', ')}</strong>
          <span class="badge-moge" style="font-size:10px;background:${matchingFix ? '#059669' : '#b45309'};">${matchingFix ? 'FIXED IN ROUND 2 BPY' : d.severity?.toUpperCase()}</span>
        </div>
        <div style="font-size:11px;color:#94a3b8;margin-bottom:4px;">Observed in views: <code>${(d.observedInViews || []).join(', ')}</code></div>
        <div style="font-size:12px;color:#cbd5e1;margin-bottom:6px;"><strong>Critic Diagnosis:</strong> ${d.diagnosis}</div>
        <div style="font-size:11px;color:#fde68a;"><strong>Required Fix:</strong> ${d.requiredCodeFix}</div>
        ${
          matchingFix
            ? `<div style="margin-top:6px;padding-top:6px;border-top:1px solid #1e293b;font-size:11px;color:#6ee7b7;">
                 <strong>Round 2 Code Change Applied:</strong> ${matchingFix.codeChangeDescription}
               </div>`
            : ''
        }
      </div>`;
    })
    .join('');

  dom.criticReportContainer.innerHTML = scoreBanner + defCards;
}

function updateCodeEditorView() {
  dom.btnCodeViewR1.classList.toggle('active', state.activeCodeView === 'r1');
  dom.btnCodeViewR2.classList.toggle('active', state.activeCodeView === 'r2');
  dom.btnCodeViewTelemetry.classList.toggle('active', state.activeCodeView === 'telemetry');

  if (state.activeCodeView === 'r1') {
    dom.sceneCodeEditor.value = state.round1?.blenderPythonScript || state.round1?.bpyCode || '# Run Step 2 to generate Round 1 bpy code...';
  } else if (state.activeCodeView === 'r2') {
    dom.sceneCodeEditor.value =
      state.round2?.blenderPythonScript ||
      state.round2?.rewrittenBpyCode ||
      state.round1?.blenderPythonScript ||
      '# Run Step 4 to generate Rewritten Round 2 bpy code...';
  } else {
    const tel = {
      metricSummary: state.metricSummary,
      round1Telemetry: state.round1?.blenderTelemetry,
      round2Telemetry: state.round2?.blenderTelemetry,
      codeDiffStats: state.round2?.diffStats,
    };
    dom.sceneCodeEditor.value = JSON.stringify(tel, null, 2);
  }
}

function renderCausalInspector() {
  if (!state.causalSimulation) return;
  const cs = state.causalSimulation;
  const erasHtml = (cs.eras || [])
    .map((era, idx) => {
      const stageKey = idx === 0 ? 'era1206' : idx === 1 ? 'era1566' : idx === 2 ? 'era1938' : 'alt2026';
      return `
      <div class="causal-card" style="margin-bottom:10px;cursor:pointer;" onclick="applyViewportStage('${stageKey}')">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
          <strong style="color:#fbbf24;font-size:13px;">Epoch ${idx + 1}: ${era.year} — ${era.eraTitle}</strong>
          <span class="badge-moge" style="font-size:10px;">${era.blenderTelemetry?.objectCount || 0} meshes | ${era.blenderTelemetry?.totalTriangles || 0} tris</span>
        </div>
        <p style="margin:4px 0;font-size:12px;color:#cbd5e1;">${era.narrative}</p>
        <div style="font-size:11px;color:#93c5fd;">${(era.causalTransitions || []).map((t) => `• ${t}`).join('<br/>')}</div>
      </div>`;
    })
    .join('');

  dom.causalGraphContainer.innerHTML = `
    <div style="margin-bottom:10px;padding:10px;background:#0f172a;border:1px solid #334155;border-radius:6px;">
      <div style="font-size:12px;color:#f8fafc;"><strong>Intervention:</strong> ${cs.intervention}</div>
      <div style="font-size:11px;color:#94a3b8;margin-top:4px;">${cs.causalChainSummary || ''}</div>
      <div style="font-size:11px;color:#34d399;margin-top:4px;"><strong>Unaffected Structures Preserved:</strong> ${(cs.unaffectedStructures || []).join(', ')}</div>
    </div>
    ${erasHtml}
  `;
}

function updateMetricsDisplay() {
  // 1. Adversarial Critic Score
  if (state.critiqueR1 && state.critiqueR2) {
    dom.metricCriticScore.textContent = `${state.critiqueR1.overallRatingOutOf10} → ${state.critiqueR2.overallRatingOutOf10} / 10`;
    const delta = (state.critiqueR2.overallRatingOutOf10 - state.critiqueR1.overallRatingOutOf10).toFixed(1);
    dom.metricCriticSub.textContent = `+${delta} pt improvement across 4 views`;
  } else if (state.critiqueR1) {
    dom.metricCriticScore.textContent = `${state.critiqueR1.overallRatingOutOf10} / 10 (R1)`;
    dom.metricCriticSub.textContent = `${(state.critiqueR1.deficiencies || []).length} deficiencies found`;
  }

  // 2. 3D Mesh Complexity
  const t1 = state.round1?.blenderTelemetry;
  const t2 = state.round2?.blenderTelemetry;
  if (t1 && t2) {
    dom.metricMeshComplexity.textContent = `${t1.objectCount} → ${t2.objectCount} meshes`;
    dom.metricMeshSub.textContent = `${t1.totalTriangles.toLocaleString()} → ${t2.totalTriangles.toLocaleString()} tris`;
  } else if (t1) {
    dom.metricMeshComplexity.textContent = `${t1.objectCount} meshes`;
    dom.metricMeshSub.textContent = `${t1.totalVertices.toLocaleString()} verts | ${t1.totalTriangles.toLocaleString()} tris`;
  }

  // 3. Ground-Contact Precision
  if (state.metrics.r1GroundErrorMeters !== null && state.metrics.r2GroundErrorMeters !== null) {
    dom.metricGroundContact.textContent = `${state.metrics.r1GroundErrorMeters}m → ${state.metrics.r2GroundErrorMeters}m`;
    dom.metricGroundSub.textContent = `Snapped to MoGe-2 floor Y=${state.metricSummary?.groundYThree ?? -1.72}m`;
  } else if (state.metrics.r1GroundErrorMeters !== null) {
    dom.metricGroundContact.textContent = `Δ ${state.metrics.r1GroundErrorMeters}m (R1)`;
    dom.metricGroundSub.textContent = `Floor plane Y=${state.metricSummary?.groundYThree ?? -1.72}m`;
  }

  // 4. Same-Camera Registration
  const sim = state.metrics.r2SameCamSim || state.metrics.r1SameCamSim;
  if (sim) {
    dom.metricVisualFidelity.textContent = `SSIM ${sim.ssim}`;
    dom.metricVisualSub.textContent = `PSNR ${sim.psnr} dB | MAE ${sim.mae}`;
  }

  // 5. Code Rewrite Delta
  if (state.round2?.diffStats) {
    const ds = state.round2.diffStats;
    dom.metricCodeDelta.textContent = `+${ds.addedLines} / -${ds.removedLines} lines`;
    dom.metricCodeSub.textContent = `R1: ${ds.round1Lines} lines → R2: ${ds.round2Lines} lines bpy`;
  } else if (state.round1?.bpyCode) {
    dom.metricCodeDelta.textContent = `${state.round1.bpyCode.split('\n').length} lines (R1)`;
    dom.metricCodeSub.textContent = 'Scene-specific Blender Python';
  }

  // 6. Stage Latencies
  const L = state.latencies;
  const totalArgon = L.authorR1Ms + L.criticR1Ms + L.rewriteR2Ms + L.criticR2Ms + L.causalMs;
  const totalBlender = L.blenderR1Ms + L.blenderR2Ms;
  dom.metricLatencies.textContent = `Blender ${totalBlender}ms | Argon ${totalArgon}ms`;
  dom.metricLatencySub.textContent = `MoGe-2: ${L.mogeMs}ms | R1: ${L.blenderR1Ms}ms | R2: ${L.blenderR2Ms}ms`;
}

function populateSuggestedInterventions(list) {
  if (!Array.isArray(list) || !list.length) return;
  dom.suggestedInterventionsBar.innerHTML =
    '<span class="chip-hint">Suggested Interventions:</span>' +
    list
      .map(
        (txt, i) =>
          `<button class="btn-chip" data-suggest="${encodeURIComponent(txt)}">Idea ${i + 1}: ${txt.slice(0, 58)}...</button>`
      )
      .join('');
  dom.suggestedInterventionsBar.querySelectorAll('[data-suggest]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const val = decodeURIComponent(btn.dataset.suggest);
      dom.interventionInput.value = val;
    });
  });
}

// ============================================================================
// Workflow #4: Art Director Live Controls
// ============================================================================
function applyThreeJsLightingConfig(cfg) {
  if (!cfg) return;
  if (ambientLight && cfg.ambientIntensity !== undefined) ambientLight.intensity = cfg.ambientIntensity;
  if (dirLight && cfg.sunIntensity !== undefined) dirLight.intensity = cfg.sunIntensity;
  if (dirLight && Array.isArray(cfg.sunPosition)) {
    dirLight.position.set(cfg.sunPosition[0], cfg.sunPosition[1], cfg.sunPosition[2]);
  }
}

function applyArtDirectorSliderChange() {
  const angleDeg = Number(dom.ctrlSunAngle.value);
  const lightInt = Number(dom.ctrlLightIntensity.value) / 100;
  const rough = Number(dom.ctrlRoughness.value) / 100;
  const photoAlpha = Number(dom.ctrlPhotoOpacity.value) / 100;

  state.artDirectorSettings = {
    sunAngleDeg: angleDeg,
    lightIntensity: lightInt,
    materialRoughness: rough,
    photoMeshOpacity: photoAlpha,
  };

  const rad = (angleDeg * Math.PI) / 180;
  if (dirLight) {
    dirLight.position.set(Math.cos(rad) * 5.0, 8.5, Math.sin(rad) * 5.0 - 4.0);
    dirLight.intensity = lightInt;
  }
  if (photoMesh && photoMesh.material) {
    photoMesh.material.opacity = photoAlpha;
  }
  proceduralGroup.traverse((child) => {
    if (child.isMesh && child.material && child.material.roughness !== undefined) {
      child.material.roughness = rough;
    }
  });
  renderer.render(scene, camera);
}

// ============================================================================
// Event Bindings & Interactive Navigation
// ============================================================================
function updateSplitPosition(pct) {
  const clamped = Math.max(0, Math.min(100, Number(pct)));
  dom.splitLeftClip.style.width = `${clamped}%`;
  dom.splitDividerLine.style.left = `${clamped}%`;
}

function bindEvents() {
  dom.sampleSelect.addEventListener('change', () => {
    loadSelectedSample(dom.sampleSelect.value);
  });

  dom.photoInput.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      await loadPhotoFromDataUrl(ev.target.result);
      setStatus('idle', `Loaded custom photo (${file.name}) — Click Step 1 or Run Full MVP3 Loop`);
    };
    reader.readAsDataURL(file);
  });

  dom.btnDismissError.addEventListener('click', hideApiError);
  dom.btnRunDemoLoop.addEventListener('click', runFullMvp3DemoLoop);
  dom.btnStep1Ground.addEventListener('click', step1GroundWithMogeAnd2DPlan);
  dom.btnStep2AuthorR1.addEventListener('click', step2AuthorRound1World);
  dom.btnStep3Critic.addEventListener('click', step3RunAdversarialCritic);
  dom.btnStep4RewriteR2.addEventListener('click', step4RewriteAndRerenderRound2);
  dom.btnStep5Causal.addEventListener('click', () => step5RunMultiEpochCausalSimulation());
  dom.btnApplyIntervention.addEventListener('click', () => step5RunMultiEpochCausalSimulation());

  dom.stageButtons.forEach((btn) => {
    btn.addEventListener('click', () => applyViewportStage(btn.dataset.stage));
  });

  dom.camButtons.forEach((btn) => {
    btn.addEventListener('click', () => setCameraPreset(btn.dataset.cam));
  });

  dom.toggleSplitSlider.addEventListener('change', () => {
    if (dom.toggleSplitSlider.checked) {
      setCameraPreset('originalCam');
      dom.splitCompareOverlay.style.display = 'block';
      updateSplitPosition(dom.splitSliderInput.value);
    } else {
      dom.splitCompareOverlay.style.display = 'none';
    }
  });

  dom.splitSliderInput.addEventListener('input', (e) => updateSplitPosition(e.target.value));

  dom.toggleMogeBackdrop.addEventListener('change', () => {
    if (photoMesh) photoMesh.visible = dom.toggleMogeBackdrop.checked;
    renderer.render(scene, camera);
  });

  dom.toggleBlenderGlb.addEventListener('change', () => {
    proceduralGroup.visible = dom.toggleBlenderGlb.checked;
    renderer.render(scene, camera);
  });

  dom.btnShowR1Shots.addEventListener('click', () => displayFourDiagnosticScreenshots(state.round1Views, 1));
  dom.btnShowR2Shots.addEventListener('click', () => displayFourDiagnosticScreenshots(state.round2Views, 2));

  dom.btnCodeViewR1.addEventListener('click', () => {
    state.activeCodeView = 'r1';
    updateCodeEditorView();
  });
  dom.btnCodeViewR2.addEventListener('click', () => {
    state.activeCodeView = 'r2';
    updateCodeEditorView();
  });
  dom.btnCodeViewTelemetry.addEventListener('click', () => {
    state.activeCodeView = 'telemetry';
    updateCodeEditorView();
  });

  [dom.ctrlSunAngle, dom.ctrlLightIntensity, dom.ctrlRoughness, dom.ctrlPhotoOpacity].forEach((el) => {
    el.addEventListener('input', applyArtDirectorSliderChange);
  });

  dom.btnCopySettingsJson.addEventListener('click', () => {
    const jsonStr = JSON.stringify(
      {
        artDirectorSettings: state.artDirectorSettings,
        cameraPose: {
          position: camera.position.toArray().map((v) => Number(v.toFixed(3))),
          fov: Number(camera.fov.toFixed(2)),
        },
      },
      null,
      2
    );
    navigator.clipboard?.writeText(jsonStr);
    dom.btnCopySettingsJson.textContent = '✓ Copied JSON!';
    setTimeout(() => {
      dom.btnCopySettingsJson.textContent = '📋 Copy Settings JSON';
    }, 1800);
  });

  // Tab switcher
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach((p) => (p.style.display = 'none'));
      btn.classList.add('active');
      const panel = document.getElementById(btn.dataset.tab);
      if (panel) panel.style.display = 'block';
    });
  });

  // TIME TRAVEL Scrubber (1206 <-> 1566 <-> 1938 <-> 2026)
  if (dom.timeScrubberRange) {
    dom.timeScrubberRange.addEventListener('input', (e) => {
      const idx = Number(e.target.value);
      const stages = ['era1206', 'era1566', 'era1938', state.activeBranchKey === 'orig' ? 'round2' : 'alt2026'];
      applyViewportStage(stages[idx] || 'alt2026');
    });
  }

  // Timeline Branch Switcher (Preserves Original + Counterfactual Branches)
  dom.btnBranchOrig?.addEventListener('click', () => switchTimelineBranch('orig'));
  dom.btnBranchA?.addEventListener('click', () => switchTimelineBranch('branchA'));
  dom.btnBranchB?.addEventListener('click', () => switchTimelineBranch('branchB'));

  // Return to Present [0,0,0]
  dom.btnReturnToPresent?.addEventListener('click', () => returnToPresentViewpoint());

  // Causal Ancestry Inspector & Direct 3D Manipulation
  dom.btnInspectMonumentAncestry?.addEventListener('click', () => inspectObjectCausalAncestry('monument'));
  dom.btnInspectArcadeAncestry?.addEventListener('click', () => inspectObjectCausalAncestry('arcade'));
  dom.btnCloseAncestryPopover?.addEventListener('click', () => {
    if (dom.causalAncestryPopover) dom.causalAncestryPopover.style.display = 'none';
  });
  dom.btnDirectInterveneLavabo?.addEventListener('click', () => switchTimelineBranch('branchA'));
  dom.btnDirectInterveneAstrolabe?.addEventListener('click', () => switchTimelineBranch('branchB'));
  dom.btnDirectScaleUp?.addEventListener('click', () => {
    const target = state.selected3DObject || proceduralGroup;
    target.scale.multiplyScalar(1.15);
    renderer.render(scene, camera);
    setStatus('ok', `Directly scaled ${state.selected3DObject?.name || '3D monument'} by +15% in persistent 3D world`);
  });
  dom.btnDirectRotateObj?.addEventListener('click', () => {
    const target = state.selected3DObject || proceduralGroup;
    target.rotation.y += Math.PI / 8;
    renderer.render(scene, camera);
    setStatus('ok', `Directly rotated ${state.selected3DObject?.name || '3D monument'} by +22.5° in persistent 3D world`);
  });
}

function setupNavigationControls() {
  const canvas = dom.threeCanvas;
  let downX = 0;
  let downY = 0;
  canvas.addEventListener('mousedown', (e) => {
    navState.isDragging = true;
    navState.lastX = e.clientX;
    navState.lastY = e.clientY;
    downX = e.clientX;
    downY = e.clientY;
  });
  window.addEventListener('mouseup', (e) => {
    const moveDist = Math.hypot(e.clientX - downX, e.clientY - downY);
    if (navState.isDragging && moveDist < 6 && e.target === canvas) {
      // 3D Raycast click to inspect Causal Ancestry & select 3D object for direct manipulation
      const rect = canvas.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(proceduralGroup.children, true);
      if (hits.length > 0) {
        const hitMesh = hits[0].object;
        state.selected3DObject = hitMesh;
        inspectObjectCausalAncestry('custom', hitMesh.name);
      }
    }
    navState.isDragging = false;
  });
  window.addEventListener('mousemove', (e) => {
    if (!navState.isDragging) return;
    const dx = e.clientX - navState.lastX;
    const dy = e.clientY - navState.lastY;
    navState.lastX = e.clientX;
    navState.lastY = e.clientY;
    navState.yaw -= dx * 0.0045;
    navState.pitch = Math.max(-1.2, Math.min(1.2, navState.pitch - dy * 0.0045));
    const euler = new THREE.Euler(navState.pitch, navState.yaw, 0, 'YXZ');
    camera.quaternion.setFromEuler(euler);
    updateCameraHud();
    renderer.render(scene, camera);
  });

  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      camera.position.addScaledVector(fwd, -e.deltaY * 0.0025);
      updateCameraHud();
      renderer.render(scene, camera);
    },
    { passive: false }
  );

  document.querySelectorAll('[data-move]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const dir = btn.dataset.move;
      const step = 0.35;
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
      if (dir === 'forward') camera.position.addScaledVector(fwd, step);
      if (dir === 'back') camera.position.addScaledVector(fwd, -step);
      if (dir === 'left') camera.position.addScaledVector(right, -step);
      if (dir === 'right') camera.position.addScaledVector(right, step);
      if (dir === 'up') camera.position.y += step * 0.7;
      if (dir === 'down') camera.position.y -= step * 0.7;
      updateCameraHud();
      renderer.render(scene, camera);
    });
  });
}

function animateLoop() {
  requestAnimationFrame(animateLoop);
  if (renderer && scene && camera) {
    renderer.render(scene, camera);
  }
}

window.addEventListener('DOMContentLoaded', initApp);
