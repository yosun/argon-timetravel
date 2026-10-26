/**
 * TIME TRAVEL — Cinematic Multi-Epoch 3D World, Draggable Timeline,
 * Closed-Loop Verification & Multi-Century Causal Simulator.
 *
 * Implements:
 *   1. Full-viewport interactive 3D world primary canvas
 *   2. Minimal translucent glassmorphism chrome & Instrument Serif typography
 *   3. Signature continuous draggable timeline spanning viewport bottom (1206 <-> 1566 <-> 1938 <-> 2026)
 *   4. Historical Intervention object interaction ("What would you change?")
 *   5. Signature RETURN TO PRESENT sequence (sequential era warp, camera restore to [0,0,0], comparison slider reveal)
 *   6. Visual Causal Ancestry step trail
 *   7. Collapsible Developer Mode drawer preserving all verification metrics, critic views, code diffs & logs
 */

const state = {
  samplePath: 'samples/cloister_courtyard.jpg',
  photoDataUrl: null,
  photoWidth: 1024,
  photoHeight: 1365,
  photoImgElement: null,
  gridOverlayDataUrl: null,
  floorplanSvgDataUrl: null,
  targetRenderDataUrl: null,

  // Step 1: MoGe-2 Metric 3D Data
  mogeData: null,
  metricSummary: null,

  // Step 2: Round 1 Authoring
  round1: null,
  round1Views: null,

  // Step 3: Adversarial Critique
  critiqueR1: null,
  critiqueR2: null,

  // Step 4: Round 2 Rewritten Code & Rerender
  round2: null,
  round2Views: null,

  // Step 5: Multi-Epoch Causal Simulation & Branching World States
  causalSimulation: null,
  branches: {},
  historyContexts: {},
  historyPersistenceBlocked: false,
  loadedContextId: null,
  pendingUpload: null,
  isReconstructingImage: false,
  isInitializing: true,
  activeBranchKey: 'orig',
  selected3DObject: null,
  eraRenders: {},

  // Active Viewport & Timeline State
  activeStage: 'alt2026', // 'round1' | 'round2' | 'era1206' | 'era1566' | 'era1938' | 'alt2026'
  activeYear: 2026,
  activeCamPreset: 'originalCam',
  showingShotRound: 2,
  activeCodeView: 'r2',
  isDevDrawerOpen: false,
  isReturnWarpActive: false,

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

// Camera Navigation & Cinematic Tween State
const navState = {
  isDragging: false,
  lastX: 0,
  lastY: 0,
  yaw: 0,
  pitch: 0,
  isTweening: false,
  tweenStartPos: new THREE.Vector3(),
  tweenTargetPos: new THREE.Vector3(),
  tweenStartQuat: new THREE.Quaternion(),
  tweenTargetQuat: new THREE.Quaternion(),
  tweenStartFov: 75,
  tweenTargetFov: 75,
  tweenProgress: 1,
  tweenDurationMs: 800,
  tweenStartTime: 0,
};

// Year-to-Timeline layout constants (timeline rail spans 1100 to 2030)
const TIMELINE_MIN_YEAR = 1100;
const TIMELINE_MAX_YEAR = 2030;
const KEYFRAME_YEARS = [1206, 1566, 1938, 2026];

// DOM references
let dom = {};

function cacheDomElements() {
  dom = {
    // Top chrome
    activeSceneTitle: document.getElementById('activeSceneTitle'),
    camButtons: document.querySelectorAll('#camViewSwitcher .cam-pill-btn'),
    toggleSplitSlider: document.getElementById('toggleSplitSlider'),
    btnToggleDevMode: document.getElementById('btnToggleDevMode'),

    // Hero Era Watermark
    eraHeroOverlay: document.getElementById('eraHeroOverlay'),
    heroYearNumber: document.getElementById('heroYearNumber'),
    heroYearSuffix: document.getElementById('heroYearSuffix'),
    heroEraName: document.getElementById('heroEraName'),
    heroEraProvenance: document.getElementById('heroEraProvenance'),
    objectHoverHud: document.getElementById('objectHoverHud'),
    hoverObjectName: document.getElementById('hoverObjectName'),
    cinematicToast: document.getElementById('cinematicToast'),
    cinematicToastText: document.getElementById('cinematicToastText'),

    // Signature Bottom Timeline
    cinematicTimelineBar: document.getElementById('cinematicTimelineBar'),
    btnBranchOrig: document.getElementById('btnBranchOrig'),
    btnBranchA: document.getElementById('btnBranchA'),
    btnBranchB: document.getElementById('btnBranchB'),
    btnOpenInterveneModal: document.getElementById('btnOpenInterveneModal'),
    btnReturnToPresent: document.getElementById('btnReturnToPresent'),

    timelineTrackWrap: document.getElementById('timelineTrackWrap'),
    timelineRail: document.getElementById('timelineRail'),
    timelineFill: document.getElementById('timelineFill'),
    timelineScrubHandle: document.getElementById('timelineScrubHandle'),
    scrubFloatingBadge: document.getElementById('scrubFloatingBadge'),
    timeScrubberRange: document.getElementById('timeScrubberRange'),
    timeScrubberLabel: document.getElementById('timeScrubberLabel'),

    keyframeNodes: {
      1206: document.getElementById('node1206'),
      1566: document.getElementById('node1566'),
      1938: document.getElementById('node1938'),
      2026: document.getElementById('node2026'),
    },

    // Viewport & 3D
    viewportContainer: document.getElementById('viewportContainer'),
    threeCanvas: document.getElementById('threeCanvas'),
    splitCompareOverlay: document.getElementById('splitCompareOverlay'),
    splitLeftClip: document.getElementById('splitLeftClip'),
    splitOriginalImg: document.getElementById('splitOriginalImg'),
    splitDividerLine: document.getElementById('splitDividerLine'),
    splitSliderInput: document.getElementById('splitSliderInput'),

    // Contextual Intervention Card ("What would you change?")
    interventionModalCard: document.getElementById('interventionModalCard'),
    interveneObjTag: document.getElementById('interveneObjTag'),
    interveneObjName: document.getElementById('interveneObjName'),
    interventionInput: document.getElementById('interventionInput'),
    suggestedInterventionsBar: document.getElementById('suggestedInterventionsBar'),
    btnCancelIntervene: document.getElementById('btnCancelIntervene'),
    btnCloseInterveneModal: document.getElementById('btnCloseInterveneModal'),
    btnApplyIntervention: document.getElementById('btnApplyIntervention'),
    propagationProgressBox: document.getElementById('propagationProgressBox'),
    propagationStatusText: document.getElementById('propagationStatusText'),

    // Causal Ancestry Card
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

    // Developer Mode Drawer
    devDrawerBackdrop: document.getElementById('devDrawerBackdrop'),
    devDrawerPanel: document.getElementById('devDrawerPanel'),
    btnCloseDevDrawer: document.getElementById('btnCloseDevDrawer'),

    sampleSelect: document.getElementById('sampleSelect'),
    photoInput: document.getElementById('photoInput'),
    btnUploadImage: document.getElementById('btnUploadImage'),
    liveImagePanel: document.getElementById('liveImagePanel'),
    uploadedImagePreview: document.getElementById('uploadedImagePreview'),
    uploadedImageName: document.getElementById('uploadedImageName'),
    liveImageStatus: document.getElementById('liveImageStatus'),
    btnReconstructImage: document.getElementById('btnReconstructImage'),
    btnCancelImage: document.getElementById('btnCancelImage'),
    thinkingLevelSelect: document.getElementById('thinkingLevelSelect'),
    btnRunDemoLoop: document.getElementById('btnRunDemoLoop'),
    btnStep1Ground: document.getElementById('btnStep1Ground'),
    btnStep2AuthorR1: document.getElementById('btnStep2AuthorR1'),
    btnStep3Critic: document.getElementById('btnStep3Critic'),
    btnStep4RewriteR2: document.getElementById('btnStep4RewriteR2'),
    btnStep5Causal: document.getElementById('btnStep5Causal'),

    stageButtons: document.querySelectorAll('#stageSwitcher .btn-dev'),
    activeStageLabel: document.getElementById('activeStageLabel'),
    toggleMogeBackdrop: document.getElementById('toggleMogeBackdrop'),
    toggleBlenderGlb: document.getElementById('toggleBlenderGlb'),

    apiErrorBanner: document.getElementById('apiErrorBanner'),
    apiErrorText: document.getElementById('apiErrorText'),
    btnDismissError: document.getElementById('btnDismissError'),
    statusBadge: document.getElementById('statusBadge'),
    modelMetaInfo: document.getElementById('modelMetaInfo'),

    // Metrics
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

    // 4-View Critic Shots
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

    // Spatial Grounding
    imgGridOverlay: document.getElementById('imgGridOverlay'),
    metaGridOverlay: document.getElementById('metaGridOverlay'),
    imgFloorplanSvg: document.getElementById('imgFloorplanSvg'),
    metaFloorplan: document.getElementById('metaFloorplan'),
    imgDepthMap: document.getElementById('imgDepthMap'),
    emptyDepthMap: document.getElementById('emptyDepthMap'),
    depthRangeMeta: document.getElementById('depthRangeMeta'),
    imgNanoTarget: document.getElementById('imgNanoTarget'),
    metaNanoTarget: document.getElementById('metaNanoTarget'),

    // Tabs
    criticReportContainer: document.getElementById('criticReportContainer'),
    sceneCodeEditor: document.getElementById('sceneCodeEditor'),
    btnCodeViewR1: document.getElementById('btnCodeViewR1'),
    btnCodeViewR2: document.getElementById('btnCodeViewR2'),
    btnCodeViewTelemetry: document.getElementById('btnCodeViewTelemetry'),
    causalGraphContainer: document.getElementById('causalGraphContainer'),
    callLogsList: document.getElementById('callLogsList'),

    // Art Director
    ctrlSunAngle: document.getElementById('ctrlSunAngle'),
    ctrlLightIntensity: document.getElementById('ctrlLightIntensity'),
    ctrlRoughness: document.getElementById('ctrlRoughness'),
    ctrlPhotoOpacity: document.getElementById('ctrlPhotoOpacity'),
    btnCopySettingsJson: document.getElementById('btnCopySettingsJson'),

    // Hidden backward compat
    hudCameraPose: document.getElementById('hudCameraPose'),
    hudGeometryInfo: document.getElementById('hudGeometryInfo'),
    hudTimelineState: document.getElementById('hudTimelineState'),
    btnInspectMonumentAncestry: document.getElementById('btnInspectMonumentAncestry'),
    btnInspectArcadeAncestry: document.getElementById('btnInspectArcadeAncestry'),
  };
}

// ============================================================================
// Initialization
// ============================================================================
async function initApp() {
  cacheDomElements();
  initThreeViewport();
  bindEvents();
  checkBackendStatus();
  setupTimelineScrubber();
  animateLoop();
  try {
    await loadSelectedSample(dom.sampleSelect ? dom.sampleSelect.value : 'samples/cloister_courtyard.jpg');
    await loadDemoHistory();
  } catch (err) { showApiError(err.message); }
  finally {
    state.isInitializing = false;
    if (dom.btnReconstructImage && state.pendingUpload?.image) dom.btnReconstructImage.disabled = false;
  }
}

async function checkBackendStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    if (data.ok) {
      if (dom.modelMetaInfo) {
        dom.modelMetaInfo.textContent = data.liveGenerationAvailable ? `${authoringProviderName(data)} | ${data.model || 'configured model'}` : `CPU procedural demo available · ${authoringReadinessMessage(data)}`;
      }
    } else {
      showApiError(data);
    }
  } catch (err) {
    showApiError({ message: `Backend unreachable: ${err.message}` });
  }
}

function setStatus(type, text) {
  if (dom.statusBadge) {
    dom.statusBadge.className = `status-pill status-${type}`;
    dom.statusBadge.textContent = text;
  }
}

let toastTimeout = null;
let toastKind = null;
function showToast(text, durationMs = 2800, kind = 'info') {
  if (!dom.cinematicToast) return;
  toastKind = kind;
  if (toastTimeout) clearTimeout(toastTimeout);
  dom.cinematicToastText.textContent = text;
  dom.cinematicToast.classList.add('show');
  toastTimeout = setTimeout(() => {
    dom.cinematicToast.classList.remove('show');
    toastTimeout = null;
  }, durationMs);
}

function dismissToast() {
  toastKind = null;
  if (!dom.cinematicToast) return;
  if (toastTimeout) {
    clearTimeout(toastTimeout);
    toastTimeout = null;
  }
  dom.cinematicToast.classList.remove('show');
}

function showApiError(errObj) {
  if (!dom.apiErrorBanner) return;
  dom.apiErrorBanner.style.display = 'block';
  dom.apiErrorText.textContent = typeof errObj === 'string' ? errObj : JSON.stringify(errObj, null, 2);
  setStatus('err', 'API Error');
}

function hideApiError() {
  if (dom.apiErrorBanner) dom.apiErrorBanner.style.display = 'none';
}

function addCallLog(entry) {
  state.callLogs.unshift({
    timestamp: new Date().toISOString().split('T')[1].replace('Z', ''),
    ...entry,
  });
  renderCallLogs();
}

function renderCallLogs() {
  if (!dom.callLogsList) return;
  if (!state.callLogs.length) {
    dom.callLogsList.innerHTML = '<div class="empty-placeholder">No model or toolchain calls logged yet.</div>';
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
// Full-Viewport Three.js Setup & Camera Tweening
// ============================================================================
function initThreeViewport() {
  const w = window.innerWidth;
  const h = window.innerHeight;

  renderer = new THREE.WebGLRenderer({
    canvas: dom.threeCanvas,
    antialias: true,
    preserveDrawingBuffer: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(w, h, false);
  renderer.outputEncoding = THREE.sRGBEncoding;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0c111c);
  scene.fog = new THREE.FogExp2(0x0c111c, 0.007);

  camera = new THREE.PerspectiveCamera(75, w / h, 0.05, 120);
  camera.position.set(0, 0, 0);
  camera.lookAt(0, 0, -1);

  ambientLight = new THREE.AmbientLight(0xffffff, 0.84);
  scene.add(ambientLight);

  hemiLight = new THREE.HemisphereLight(0xe0f2fe, 0x443c30, 0.55);
  scene.add(hemiLight);

  dirLight = new THREE.DirectionalLight(0xfffbeb, 1.26);
  dirLight.position.set(2.2, 8.8, -3.5);
  scene.add(dirLight);

  proceduralGroup = new THREE.Group();
  scene.add(proceduralGroup);

  setupNavigationControls();
  window.addEventListener('resize', onWindowResize);
}

function onWindowResize() {
  if (!renderer || !camera) return;
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

function startCameraTween(targetPos, targetLookAt, targetFov = null, durationMs = 850) {
  navState.isTweening = true;
  navState.tweenStartTime = performance.now();
  navState.tweenDurationMs = durationMs;
  navState.tweenStartPos.copy(camera.position);
  navState.tweenTargetPos.copy(targetPos);

  navState.tweenStartQuat.copy(camera.quaternion);
  const m = new THREE.Matrix4().lookAt(targetPos, targetLookAt, new THREE.Vector3(0, 1, 0));
  navState.tweenTargetQuat.setFromRotationMatrix(m);

  navState.tweenStartFov = camera.fov;
  navState.tweenTargetFov = targetFov !== null ? targetFov : (state.mogeData?.intrinsics?.fovYDeg || 75.0);
}

function setCameraPreset(presetName, animate = true) {
  state.activeCamPreset = presetName;
  dom.camButtons.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.cam === presetName);
  });

  const baseFov = state.mogeData?.intrinsics?.fovYDeg || 75.0;
  const groundY = state.metricSummary?.groundYThree ?? -1.72;
  const midZ = -6.2;

  if (wireframeMesh) wireframeMesh.visible = presetName === 'wireframe';
  proceduralGroup.traverse((child) => {
    if (child.isMesh && child.material) {
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach((m) => {
        m.wireframe = presetName === 'wireframe';
      });
    }
  });

  let targetPos = new THREE.Vector3(0, 0, 0);
  let targetLookAt = new THREE.Vector3(0, 0, -1);
  let targetFov = baseFov;

  if (presetName === 'originalCam') {
    targetPos.set(0, 0, 0);
    targetLookAt.set(0, 0, -1);
    targetFov = baseFov;
    if (photoMesh && fullIndexAttr) photoMesh.geometry.setIndex(fullIndexAttr);
    if (photoMesh) photoMesh.material.opacity = state.artDirectorSettings.photoMeshOpacity;
    updateCameraHud('Cam 1: ORIGINAL [0.00, 0.00, 0.00]');
  } else if (presetName === 'threeQuarter') {
    targetPos.set(2.35, 2.15, -0.85);
    targetLookAt.set(0, -0.35, midZ);
    targetFov = Math.min(72, baseFov * 0.78);
    if (photoMesh && displacedIndexAttr) photoMesh.geometry.setIndex(displacedIndexAttr);
    if (photoMesh) photoMesh.material.opacity = 0.55;
    updateCameraHud('Cam 2: 3/4 OVERVIEW');
  } else if (presetName === 'lowAngle') {
    targetPos.set(0.95, groundY + 0.34, -1.35);
    targetLookAt.set(0, groundY + 0.25, -5.8);
    targetFov = Math.min(68, baseFov * 0.75);
    if (photoMesh && displacedIndexAttr) photoMesh.geometry.setIndex(displacedIndexAttr);
    if (photoMesh) photoMesh.material.opacity = 0.62;
    updateCameraHud('Cam 3: LOW GROUND');
  } else if (presetName === 'wireframe') {
    targetPos.set(-1.95, 1.55, -0.9);
    targetLookAt.set(0, -0.3, midZ);
    targetFov = Math.min(72, baseFov * 0.78);
    if (photoMesh && displacedIndexAttr) photoMesh.geometry.setIndex(displacedIndexAttr);
    if (photoMesh) photoMesh.material.opacity = 0.22;
    updateCameraHud('Cam 4: WIREFRAME');
  }

  if (animate) {
    startCameraTween(targetPos, targetLookAt, targetFov, 750);
  } else {
    camera.position.copy(targetPos);
    camera.lookAt(targetLookAt);
    camera.fov = targetFov;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  }
}

function updateCameraHud(labelOverride) {
  if (!dom.hudCameraPose) return;
  const p = camera.position;
  const poseStr = labelOverride || `[${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}]`;
  dom.hudCameraPose.textContent = `${poseStr} | FOV: ${camera.fov.toFixed(1)}°`;
}

/**
 * Captures 4 diagnostic screenshots for the Adversarial Critic.
 * Temporarily switches to calibrated 640x480 resolution to preserve critic cache keys.
 */
async function captureFourDiagnosticScreenshots() {
  const prevW = window.innerWidth;
  const prevH = window.innerHeight;
  const prevPreset = state.activeCamPreset;

  // Temporarily hide overlays
  if (dom.eraHeroOverlay) dom.eraHeroOverlay.style.visibility = 'hidden';
  if (dom.cinematicTimelineBar) dom.cinematicTimelineBar.style.visibility = 'hidden';
  if (dom.causalAncestryPopover) dom.causalAncestryPopover.style.display = 'none';

  // Fixed 640x480 for critic consistency
  renderer.setSize(640, 480, false);
  camera.aspect = 640 / 480;
  camera.updateProjectionMatrix();

  const shots = {};
  for (const preset of ['originalCam', 'threeQuarter', 'lowAngle', 'wireframe']) {
    setCameraPreset(preset, false);
    renderer.render(scene, camera);
    shots[preset] = dom.threeCanvas.toDataURL('image/png');
  }

  // Restore full viewport dimensions
  renderer.setSize(prevW, prevH, false);
  camera.aspect = prevW / prevH;
  camera.updateProjectionMatrix();

  if (dom.eraHeroOverlay) dom.eraHeroOverlay.style.visibility = 'visible';
  if (dom.cinematicTimelineBar) dom.cinematicTimelineBar.style.visibility = 'visible';
  setCameraPreset(prevPreset || 'originalCam', false);

  return shots;
}

function displayFourDiagnosticScreenshots(viewsObj, roundNum) {
  if (!viewsObj) return;
  state.showingShotRound = roundNum;
  if (dom.btnShowR1Shots) dom.btnShowR1Shots.classList.toggle('active', roundNum === 1);
  if (dom.btnShowR2Shots) dom.btnShowR2Shots.classList.toggle('active', roundNum === 2);

  const pairs = [
    [dom.imgViewOrig, dom.emptyViewOrig, dom.metaViewOrig, viewsObj.originalCam, `R${roundNum} [0,0,0]`],
    [dom.imgView34, dom.emptyView34, dom.metaView34, viewsObj.threeQuarter, `R${roundNum} 3/4 View`],
    [dom.imgViewLow, dom.emptyViewLow, dom.metaViewLow, viewsObj.lowAngle, `R${roundNum} Ground`],
    [dom.imgViewWire, dom.emptyViewWire, dom.metaViewWire, viewsObj.wireframe, `R${roundNum} Wireframe`],
  ];

  pairs.forEach(([imgEl, emptyEl, metaEl, src, label]) => {
    if (imgEl && src) {
      imgEl.src = src;
      imgEl.style.display = 'block';
      if (emptyEl) emptyEl.style.display = 'none';
      if (metaEl) metaEl.textContent = label;
    }
  });
}

// ============================================================================
// Sample Loading & MoGe-2 3D Point Cloud Mesh Generation
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
    if (dom.activeSceneTitle) dom.activeSceneTitle.textContent = 'The Cloisters · Romanesque Courtyard';
    if (dom.imgGridOverlay) dom.imgGridOverlay.src = 'samples/cloister_grid_overlay.png';
    if (dom.imgFloorplanSvg) dom.imgFloorplanSvg.src = 'samples/cloister_floorplan.svg';
    if (dom.imgNanoTarget) dom.imgNanoTarget.src = 'samples/cloister_target_render.jpg';
    state.gridOverlayDataUrl = await fetchImageAsDataUrl('samples/cloister_grid_overlay.png');
    state.targetRenderDataUrl = await fetchImageAsDataUrl('samples/cloister_target_render.jpg');
    if (dom.interventionInput) {
      dom.interventionInput.value =
        'In 1206 (Medieval Monastic Era), construct an octagonal Gothic bronze-and-limestone monastic lavabo fountain canopy over the central wellhead with four carved stone water basins and timber cloister roof beams.';
    }
  } else {
    if (dom.activeSceneTitle) dom.activeSceneTitle.textContent = 'Historic Architectural Interior';
    if (dom.imgNanoTarget) dom.imgNanoTarget.src = 'samples/target_1926_historical.jpg';
    state.targetRenderDataUrl = await fetchImageAsDataUrl('samples/target_1926_historical.jpg');
    if (dom.interventionInput) {
      dom.interventionInput.value =
        'In 1926, install carved dark walnut picture-frame wall molding, an heirloom cognac leather club chair, and an antique bronze reading lamp.';
    }
  }
}

async function loadPhotoFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      state.loadedContextId = null;
      state.mogeData = null; state.metricSummary = null;
      state.round1 = null; state.round2 = null; state.critiqueR1 = null; state.critiqueR2 = null;
      state.gridOverlayDataUrl = null; state.floorplanSvgDataUrl = null; state.targetRenderDataUrl = null;
      state.metrics = {r1SameCamSim:null,r2SameCamSim:null,r1GroundErrorMeters:null,r2GroundErrorMeters:null};
      state.latencies = {mogeMs:0,authorR1Ms:0,blenderR1Ms:0,criticR1Ms:0,rewriteR2Ms:0,blenderR2Ms:0,criticR2Ms:0,causalMs:0};
      state.photoDataUrl = dataUrl;
      state.photoWidth = img.naturalWidth || img.width;
      state.photoHeight = img.naturalHeight || img.height;
      state.photoImgElement = img;

      if (dom.splitOriginalImg) dom.splitOriginalImg.src = dataUrl;
      resolve(img);
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

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
  photoMesh.visible = dom.toggleMogeBackdrop ? dom.toggleMogeBackdrop.checked : true;
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
  camera.updateProjectionMatrix();

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

  setCameraPreset('originalCam', false);
}

// ============================================================================
// Load Compiled Blender GLBs into Three.js
// ============================================================================
function clearProceduralGroup() {
  while (proceduralGroup.children.length > 0) {
    const child = proceduralGroup.children[0];
    proceduralGroup.remove(child);
  }
}

function disposeWorld(world) {
  world.traverse(obj => {
    obj.geometry?.dispose();
    const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
    materials.filter(Boolean).forEach(m => { Object.values(m).forEach(v => { if (v?.isTexture) v.dispose(); }); m.dispose(); });
  });
}
const navigateWorld = WorldNavigation.createNavigator(
  url => new Promise((resolve, reject) => new THREE.GLTFLoader().load(url, gltf => {
    let hasGeometry = false;
    gltf.scene?.traverse(object => { if (object.isMesh && object.geometry?.attributes?.position?.count > 0) hasGeometry = true; });
    if (!hasGeometry) {
      if (gltf.scene) disposeWorld(gltf.scene);
      reject(new Error('World contains no renderable geometry'));
      return;
    }
    resolve(gltf.scene);
  }, undefined, reject)),
  world => {
    [...proceduralGroup.children].forEach(child => { proceduralGroup.remove(child); disposeWorld(child); });
    proceduralGroup.add(world);
    proceduralGroup.visible = true;
    if (dom.toggleBlenderGlb) dom.toggleBlenderGlb.checked = true;
    renderer.render(scene, camera);
  }, disposeWorld
);
async function loadBlenderGlbIntoScene(url) {
  const ok = await navigateWorld(url);
  if (!ok) console.info('World unchanged: load failed or superseded', url);
  return ok;
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

// ============================================================================
// Signature Bottom Timeline & Keyframe Scrubber Engine
// ============================================================================
function yearToTimelinePercent(year) {
  const clamped = Math.max(TIMELINE_MIN_YEAR, Math.min(TIMELINE_MAX_YEAR, year));
  return ((clamped - TIMELINE_MIN_YEAR) / (TIMELINE_MAX_YEAR - TIMELINE_MIN_YEAR)) * 100;
}

function percentToYear(pct) {
  const norm = Math.max(0, Math.min(100, pct)) / 100;
  return Math.round(TIMELINE_MIN_YEAR + norm * (TIMELINE_MAX_YEAR - TIMELINE_MIN_YEAR));
}

function updateTimelineUI(year, snapKeyframe = true) {
  state.activeYear = year;
  const pct = yearToTimelinePercent(year);

  // Position scrub handle and fill rail
  if (dom.timelineScrubHandle) {
    dom.timelineScrubHandle.style.left = `${pct}%`;
  }
  if (dom.timelineFill) {
    dom.timelineFill.style.width = `${pct}%`;
  }
  if (dom.scrubFloatingBadge) {
    dom.scrubFloatingBadge.textContent = `${year} AD`;
  }

  // Update keyframe nodes active state
  let closestKey = KEYFRAME_YEARS[0];
  let minDiff = Infinity;
  KEYFRAME_YEARS.forEach((ky) => {
    const diff = Math.abs(ky - year);
    if (diff < minDiff) {
      minDiff = diff;
      closestKey = ky;
    }
    const nodeEl = dom.keyframeNodes[ky];
    if (nodeEl) nodeEl.classList.toggle('active', ky === year);
  });

  if (dom.timeScrubberRange) {
    const idx = KEYFRAME_YEARS.indexOf(closestKey);
    dom.timeScrubberRange.value = String(idx >= 0 ? idx : 3);
  }
  if (dom.timeScrubberLabel) {
    dom.timeScrubberLabel.textContent = `${year} (Present Viewpoint)`;
  }
}

function setupTimelineScrubber() {
  const rail = dom.timelineRail;
  const handle = dom.timelineScrubHandle;
  const trackWrap = dom.timelineTrackWrap;

  let isDraggingScrubber = false;

  function onScrubberMove(clientX) {
    dismissToast();
    const rect = rail.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const pct = (x / rect.width) * 100;
    const rawYear = percentToYear(pct);

    // Snap to major keyframe if within 30 years
    let targetYear = rawYear;
    for (const ky of KEYFRAME_YEARS) {
      if (Math.abs(ky - rawYear) < 32) {
        targetYear = ky;
        break;
      }
    }

    syncWorldToYear(targetYear);
  }

  trackWrap.addEventListener('mousedown', (e) => {
    isDraggingScrubber = true;
    onScrubberMove(e.clientX);
  });

  window.addEventListener('mousemove', (e) => {
    if (isDraggingScrubber) {
      onScrubberMove(e.clientX);
    }
  });

  window.addEventListener('mouseup', () => {
    isDraggingScrubber = false;
  });

  // Touch support for mobile / touchpads
  trackWrap.addEventListener('touchstart', (e) => {
    if (e.touches && e.touches[0]) {
      isDraggingScrubber = true;
      onScrubberMove(e.touches[0].clientX);
    }
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    if (isDraggingScrubber && e.touches && e.touches[0]) {
      onScrubberMove(e.touches[0].clientX);
    }
  }, { passive: true });

  window.addEventListener('touchend', () => {
    isDraggingScrubber = false;
  });

  // Direct click on keyframe nodes
  KEYFRAME_YEARS.forEach((ky) => {
    const nodeEl = dom.keyframeNodes[ky];
    if (nodeEl) {
      nodeEl.addEventListener('click', (e) => {
        e.stopPropagation();
        jumpToKeyframe(ky);
      });
    }
  });

  // Accessible keyboard slider
  if (dom.timeScrubberRange) {
    dom.timeScrubberRange.addEventListener('input', (e) => {
      const idx = Number(e.target.value);
      const ky = KEYFRAME_YEARS[idx] || 2026;
      jumpToKeyframe(ky);
    });
  }

  // Global keyboard shortcuts (Left/Right arrows, 1..4 keys)
  window.addEventListener('keydown', (e) => {
    // Skip if typing in an input or textarea
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if (e.key === 'ArrowLeft') {
      scrubToAdjacentKeyframe(-1);
    } else if (e.key === 'ArrowRight') {
      scrubToAdjacentKeyframe(1);
    } else if (e.key === '1') {
      jumpToKeyframe(1206);
    } else if (e.key === '2') {
      jumpToKeyframe(1566);
    } else if (e.key === '3') {
      jumpToKeyframe(1938);
    } else if (e.key === '4') {
      jumpToKeyframe(2026);
    } else if (e.key === 'd' || e.key === 'D') {
      toggleDevDrawer();
    } else if (e.key === 'Escape') {
      closeAllPopovers();
    }
  });
}

function scrubToAdjacentKeyframe(direction) {
  dismissToast();
  const currentYear = state.activeYear;
  let idx = KEYFRAME_YEARS.indexOf(currentYear);
  if (idx < 0) {
    idx = direction > 0 ? 0 : KEYFRAME_YEARS.length - 1;
  } else {
    idx = Math.max(0, Math.min(KEYFRAME_YEARS.length - 1, idx + direction));
  }
  jumpToKeyframe(KEYFRAME_YEARS[idx]);
}

async function jumpToKeyframe(year) {
  dismissToast();
  return syncWorldToYear(year);
}

let worldSelectionVersion = 0;
/** Commit geometry, selected history, provenance and source context together. */
async function syncWorldToYear(requestedYear, branchId = state.activeBranchKey, options = {}) {
  if ((state.isGeneratingHistory || state.isReturnWarpActive) && !options.internal) return false;
  const version = ++worldSelectionVersion;
  navigateWorld(null); // Cancel older loads before preparing another reference photograph.
  const branch = state.branches[branchId];
  const era = CausalHistory.eraAt(branch?.eras || [], requestedYear);
  if (!era?.blenderGlbUrl) {
    await navigateWorld(null); // Invalidate an older pending world.
    if (version === worldSelectionVersion) setStatus('err', 'No world is available at this date. Current world retained.');
    return false;
  }
  let prepared;
  try { prepared = await prepareHistoryContext(branch); }
  catch (error) {
    await navigateWorld(null);
    if (version === worldSelectionVersion) setStatus('err', `Cannot load source context: ${error.message}`);
    return false;
  }
  if (version !== worldSelectionVersion) return false;
  const loaded = await loadBlenderGlbIntoScene(era.blenderGlbUrl);
  if (version !== worldSelectionVersion) return false;
  if (!loaded) {
    setStatus('err', 'World load failed. Current world and history retained.');
    showToast('World unavailable · previous world retained', 4500, 'world-error');
    return false;
  }
  if (toastKind === 'world-error') dismissToast();
  applyHistoryContext(branch, prepared);
  state.selected3DObject = null;
  state.activeBranchKey = branchId;
  state.causalSimulation = branch;
  state.displayedWorld = {branchId, year:Number(era.year), url:era.blenderGlbUrl};
  state.activeStage = Number(era.year) === 1206 ? 'era1206' : Number(era.year) === 1566 ? 'era1566' : Number(era.year) === 1938 ? 'era1938' : branch.parentId ? 'alt2026' : 'round2';
  updateTimelineUI(requestedYear, true);
  syncStageButtons(); syncBranchButtons(); renderHistoryNavigator();
  if (requestedYear < 2026 && dom.splitCompareOverlay) {
    dom.splitCompareOverlay.style.display = 'none';
    if (dom.toggleSplitSlider) dom.toggleSplitSlider.checked = false;
  }
  const illustrative = Boolean(branch.demo);
  const provenance = era.narrative || era.provenance || branch.provenance || (branch.parentId ? 'Generated counterfactual world.' : 'Generated reconstruction.');
  const dateNote = Number(era.year) === Number(requestedYear) ? '' : `Requested ${requestedYear}; showing available ${era.year} geometry. `;
  if (dom.heroYearNumber) dom.heroYearNumber.textContent = String(era.year);
  if (dom.heroYearSuffix) dom.heroYearSuffix.textContent = illustrative ? 'ILLUSTRATIVE CPU DEMO' : branch.parentId ? 'COUNTERFACTUAL HISTORY' : 'RECONSTRUCTED PRESENT';
  if (dom.heroEraName) dom.heroEraName.textContent = era.eraTitle || `${era.year} · ${branch.branchTitle || 'World'}`;
  if (dom.heroEraProvenance) dom.heroEraProvenance.textContent = `${dateNote}${provenance}${illustrative ? ' Procedural demonstration; no AI reconstruction or critic score is claimed.' : ''}`;
  if (dom.interventionInput && branch.intervention) dom.interventionInput.value = branch.intervention;
  applyPhotoGrading(era.grading?.sepiaStrength || 0, era.grading?.warmth || 0);
  setStatus('ok', `${illustrative ? 'CPU demo' : 'World ready'} · ${era.year}${dateNote ? ` (requested ${requestedYear})` : ''}`);
  renderer.render(scene, camera);
  return true;
}

// ============================================================================
// Signature RETURN TO PRESENT Action (Cinematic Sequence)
// ============================================================================
async function executeCinematicReturnToPresent(options = {}) {
  if (state.isReturnWarpActive || (state.isGeneratingHistory && !options.internal)) return;
  state.isReturnWarpActive = true;
  renderHistoryNavigator();
  try {
    closeAllPopovers();

    showToast('WARPING THROUGH CENTURIES...', 1800);

    // 1. Sequentially animate forward through alternate keyframes
    const seq = [1206, 1566, 1938, 2026];
    for (let i = 0; i < seq.length; i++) {
      const yr = seq[i];
      if (!await syncWorldToYear(yr, state.activeBranchKey, {internal:true})) return false;
      // Subtle pause per era so user watches the world transform
      await new Promise((r) => setTimeout(r, 680));
    }

    // 2. Smoothly restore exact original camera pose [0,0,0], lookAt [0,0,-1], and original FOV
    const baseFov = state.mogeData?.intrinsics?.fovYDeg || 75.0;
    startCameraTween(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1), baseFov, 900);
    await new Promise((r) => setTimeout(r, 920));

    setCameraPreset('originalCam', false);

    // 3. Reveal the Alternate Present with comparison slider
    showToast('ALTERNATE PRESENT · 2026 REVEALED', 3200);

    const comparePhotograph = !state.branches[state.activeBranchKey]?.demo;
    if (dom.toggleSplitSlider) dom.toggleSplitSlider.checked = comparePhotograph;
    if (dom.splitCompareOverlay) dom.splitCompareOverlay.style.display = comparePhotograph ? 'block' : 'none';
    if (comparePhotograph) animateSplitSliderWipe(50, 750);

    // 4. Reveal concise causal ancestry card for the transformed monument
    setTimeout(() => {
      inspectObjectCausalAncestry('monument');
    }, 350);

    return true;
  } finally {
    state.isReturnWarpActive = false;
    renderHistoryNavigator();
  }
}

function animateSplitSliderWipe(targetPct = 50, durationMs = 700) {
  const startPct = 0;
  const startTime = performance.now();

  function step(now) {
    const elapsed = now - startTime;
    const progress = Math.min(1, elapsed / durationMs);
    const ease = 1 - Math.pow(1 - progress, 3); // cubic ease-out
    const current = startPct + (targetPct - startPct) * ease;
    updateSplitPosition(current);
    if (dom.splitSliderInput) dom.splitSliderInput.value = String(current);
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function updateSplitPosition(pct) {
  const clamped = Math.max(0, Math.min(100, Number(pct)));
  if (dom.splitLeftClip) dom.splitLeftClip.style.width = `${clamped}%`;
  if (dom.splitDividerLine) dom.splitDividerLine.style.left = `${clamped}%`;
}

// ============================================================================
// Timeline Branch Switching (Branch 0, Branch A, Branch B)
// ============================================================================
function syncBranchButtons() {
  if (dom.btnBranchOrig) dom.btnBranchOrig.classList.toggle('active', state.activeBranchKey === 'orig');
  if (dom.btnBranchA) dom.btnBranchA.classList.toggle('active', state.activeBranchKey === 'branchA');
  if (dom.btnBranchB) dom.btnBranchB.classList.toggle('active', state.activeBranchKey === 'branchB');

  // Update beacon pulse markers on timeline
  if (dom.keyframeNodes[1206]) {
    dom.keyframeNodes[1206].classList.toggle('intervention-beacon', state.activeBranchKey === 'branchA');
  }
  if (dom.keyframeNodes[1566]) {
    dom.keyframeNodes[1566].classList.toggle('intervention-beacon', state.activeBranchKey === 'branchB');
    const pulse = dom.keyframeNodes[1566].querySelector('.keyframe-beacon-pulse');
    if (pulse) pulse.style.display = state.activeBranchKey === 'branchB' ? 'block' : 'none';
  }
}

async function switchTimelineBranch(branchKey) {
  if (state.isGeneratingHistory || state.isReturnWarpActive) return false;
  if (!state.branches[branchKey]) {
    if (branchKey !== 'branchA' && branchKey !== 'branchB') return false;
    const forkYear = branchKey === 'branchB' ? 1566 : 1206;
    const prompt = branchKey === 'branchB'
      ? 'In 1566, install an ornate marble balustrade and bronze astrolabe sundial in the courtyard.'
      : 'In 1206, construct a Gothic bronze-and-limestone lavabo fountain canopy over the central wellhead.';
    return step5RunMultiEpochCausalSimulation(prompt, {forkYear});
  }
  const ok = await syncWorldToYear(2026, branchKey);
  if (ok) renderCausalInspector();
  return ok;
}

// ============================================================================
// Historical Intervention ("What would you change?")
// ============================================================================
function openInterventionModal(objectName = 'Central Carved Wellhead Basin') {
  if (!dom.interventionModalCard) return;
  closeAllPopovers();

  if (dom.interveneObjName) dom.interveneObjName.textContent = objectName;
  if (dom.interveneObjTag) dom.interveneObjTag.textContent = 'Active 3D Target';
  dom.interventionModalCard.classList.add('visible');
}

function closeInterventionModal() {
  if (dom.interventionModalCard) {
    dom.interventionModalCard.classList.remove('visible');
  }
  if (dom.propagationProgressBox) {
    dom.propagationProgressBox.style.display = 'none';
  }
}

// ============================================================================
// Causal Ancestry Step Trail Visualization
// ============================================================================
function inspectObjectCausalAncestry(targetKey = 'monument', clickedMeshName = null) {
  if (!dom.causalAncestryPopover) return;
  const cs = state.causalSimulation;
  const ancestryMap = cs?.causalAncestryByObject || {};

  let entry = null;
  if (clickedMeshName && ancestryMap[clickedMeshName]) {
    entry = ancestryMap[clickedMeshName];
  } else if (clickedMeshName && /^(Lavabo|Astrolabe|Marble_Balust|Wellhead|Medieval_Well)/i.test(clickedMeshName)) {
    entry =
      ancestryMap.Lavabo_Central_Bronze_Pillar ||
      ancestryMap.Astrolabe_Celestial_Gnomon_Spire ||
      ancestryMap.Lavabo_Canopy_Pitched_Roof;
  } else if (clickedMeshName && /^(Terracotta|Fern|Pot_|Monastic_|Renaissance_Boxwood)/i.test(clickedMeshName)) {
    entry = ancestryMap.Terracotta_Pot_0;
  } else if (targetKey === 'arcade' || (clickedMeshName && /^(North_|West_|East_)/i.test(clickedMeshName))) {
    entry = ancestryMap.North_Arch_2 || {
      persistentObjectId: 'north_romanesque_arcade',
      title: 'North Romanesque Double-Column Colonnade',
      status: 'SPATIALLY INVARIANT ANCHOR',
      triggeringIntervention: 'Load-bearing medieval abbey colonnade anchored to MoGe-2 3D point cloud coordinates.',
      evolutionTimeline: [
        '1206: Carved by Romanesque stonemasons with paired cushion-capital limestone colonnettes.',
        '1566: Preserved through secularization.',
        '1938: Dismantled stone-by-stone at Saint-Guilhem and re-erected in New York.',
        '2026: Anchors the courtyard with 1:1 perspective registration at camera [0,0,0].',
      ],
      assumptions: 'Courtyard interventions preserve the surrounding load-bearing Romanesque colonnades.',
    };
  } else {
    entry =
      ancestryMap.Lavabo_Central_Bronze_Pillar ||
      ancestryMap.Astrolabe_Celestial_Gnomon_Spire || {
        persistentObjectId: 'central_carved_wellhead',
        title: 'Central Cloister Monument (ID: central_carved_wellhead)',
        status: state.activeBranchKey === 'orig' ? 'ORIGINAL 2026 BASELINE OBJECT' : 'CAUSALLY TRANSFORMED MONUMENT',
        triggeringIntervention:
          cs?.intervention ||
          'Original Romanesque carved stone wellhead drum at MoGe-2 coordinates (X=0.02m, Z=-5.38m).',
        evolutionTimeline: [
          '1206: Constructed as the monastic cistern wellhead (or transformed into the Gothic Lavabo in Branch A).',
          '1566: Weathered across centuries (or replaced by the Carrara Marble Astrolabe in Branch B).',
          '1938: Reconstructed on the museum floor plane (Y = -1.72m).',
          '2026: Survives at exact registered coordinates viewed from camera [0,0,0].',
        ],
        assumptions: 'Tracks causal transformations at (X=0.02m, Z=-5.38m) across 820 years.',
      };
  }

  if (!Object.values(ancestryMap).includes(entry)) {
    entry = {
      persistentObjectId: clickedMeshName || 'scene-object', title: clickedMeshName || cs?.branchTitle || 'Selected world',
      status: cs?.demo ? 'ILLUSTRATIVE CPU GEOMETRY' : 'GENERATED WORLD · UNVERIFIED ANCESTRY',
      triggeringIntervention: cs?.intervention || 'Original source world; no intervention recorded.',
      evolutionTimeline: (cs?.eras || []).map(era => `${era.year}: ${era.narrative || era.eraTitle || era.provenance || 'Available generated state'}`),
      assumptions: cs?.demo ? 'Procedural demonstration. Historical accuracy and critic scores have not been independently verified.' : 'Only recorded world states are shown; causal claims require independent verification.'
    };
  }
  const isInvariant = entry.status.includes('INVARIANT') || entry.status.includes('ORIGINAL');
  dom.ancestryStatusBadge.textContent = entry.status;
  dom.ancestryStatusBadge.style.background = isInvariant ? 'rgba(56,189,248,0.18)' : 'rgba(16,185,129,0.18)';
  dom.ancestryStatusBadge.style.color = isInvariant ? '#7dd3fc' : '#6ee7b7';
  dom.ancestryObjectTitle.textContent = entry.title;
  dom.ancestryPersistentId.textContent = `Mesh: ${clickedMeshName || 'Monument'} · Persistent ID: ${entry.persistentObjectId}`;
  dom.ancestryInterventionText.textContent = entry.triggeringIntervention;

  // Render visual step trail with clickable jump-to-era actions
  const years = [1206, 1566, 1938, 2026];
  const items = (entry.evolutionTimeline || []).map((line, idx) => {
    const yr = years[idx] || 2026;
    return `
      <div class="ancestry-step-item" onclick="jumpToKeyframe(${yr})" title="Click to view this era in 3D">
        <div class="ancestry-step-dot"></div>
        <div class="ancestry-step-year">
          <span>${yr} AD</span>
          <span style="font-size:9px;color:var(--text-tertiary);font-weight:400;">(Click to Warp)</span>
        </div>
        <div class="ancestry-step-text">${line.replace(/^[0-9–]+:\s*/, '')}</div>
      </div>
    `;
  }).join('');

  dom.ancestryEvolutionList.innerHTML = items;
  dom.ancestryAssumptionsText.textContent = entry.assumptions || '';
  dom.causalAncestryPopover.style.display = 'flex';
}

function closeAllPopovers() {
  if (dom.causalAncestryPopover) dom.causalAncestryPopover.style.display = 'none';
  closeInterventionModal();
  if (dom.devDrawerPanel && state.isDevDrawerOpen) toggleDevDrawer();
}

// ============================================================================
// Collapsible Developer Mode Drawer
// ============================================================================
function toggleDevDrawer() {
  dismissToast();
  state.isDevDrawerOpen = !state.isDevDrawerOpen;
  if (dom.devDrawerPanel) {
    dom.devDrawerPanel.classList.toggle('open', state.isDevDrawerOpen);
  }
  if (dom.devDrawerBackdrop) {
    dom.devDrawerBackdrop.classList.toggle('open', state.isDevDrawerOpen);
  }
  if (dom.btnToggleDevMode) {
    dom.btnToggleDevMode.classList.toggle('active', state.isDevDrawerOpen);
  }
}

// ============================================================================
// Core MVP3 Pipeline Execution (Steps 1 to 5)
// ============================================================================
async function step1GroundWithMogeAnd2DPlan() {
  if (!state.photoDataUrl) {
    await loadSelectedSample(dom.sampleSelect ? dom.sampleSelect.value : state.samplePath);
  }
  hideApiError();
  setStatus('busy', 'Step 1: MoGe-2 Grounding...');

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

  if (dom.imgDepthMap) {
    dom.imgDepthMap.src = data.depthVisualizationDataUrl;
    dom.imgDepthMap.style.display = 'block';
    if (dom.emptyDepthMap) dom.emptyDepthMap.style.display = 'none';
    if (dom.depthRangeMeta) {
      dom.depthRangeMeta.textContent = `${data.intrinsics.minDepthMeters}m–${data.intrinsics.maxDepthMeters}m | FOV ${data.intrinsics.fovYDeg}°`;
    }
  }

  buildMoge3DMeshAndExtractSummary(data, state.photoImgElement);

  addCallLog({
    stage: 'Step 1: MoGe-2 Grounding',
    latencyMs: data.latencyMs,
    cached: data.cached,
    backend: data.backend,
    summary: `FOV ${data.intrinsics.fovYDeg}°, floor Y=${state.metricSummary.groundYThree}m`,
  });

  if (dom.btnStep2AuthorR1) dom.btnStep2AuthorR1.disabled = false;
  setStatus('ok', 'Step 1 Complete: MoGe-2 Calibrated');
}

async function step2AuthorRound1World() {
  if (!state.mogeData) await step1GroundWithMogeAnd2DPlan();
  hideApiError();
  setStatus('busy', 'Step 2: Argon Authoring Round 1 bpy...');

  const res = await fetch('/api/argon/mvp3-author', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageDataUrl: state.photoDataUrl,
      gridOverlayDataUrl: state.gridOverlayDataUrl,
      metricSummary: state.metricSummary,
      thinkingLevel: dom.thinkingLevelSelect ? dom.thinkingLevelSelect.value : 'MEDIUM',
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

  state.round1Views = await captureFourDiagnosticScreenshots();
  displayFourDiagnosticScreenshots(state.round1Views, 1);

  state.metrics.r1SameCamSim = await computeImageSimilarityMetrics(state.photoDataUrl, state.round1Views.originalCam);
  state.metrics.r1GroundErrorMeters = computeAverageGroundElevationError(data.round1.blenderTelemetry);

  state.activeCodeView = 'r1';
  updateCodeEditorView();
  updateMetricsDisplay();

  addCallLog({
    stage: 'Step 2: Argon Round 1 Authoring',
    latencyMs: data.latencyMs,
    cached: data.cached,
    usage: data.usage,
    summary: `Authored ${data.round1.bpyCode?.split('\n').length || 0} lines bpy -> ${data.round1.blenderTelemetry?.objectCount || 0} objects`,
  });

  if (dom.btnStep3Critic) dom.btnStep3Critic.disabled = false;
  setStatus('ok', 'Step 2 Complete: Round 1 Authored');
}

async function step3RunAdversarialCritic() {
  if (!state.round1 || !state.round1Views) await step2AuthorRound1World();
  hideApiError();
  setStatus('busy', 'Step 3: Adversarial Critic Inspecting 4 Views...');

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
      thinkingLevel: dom.thinkingLevelSelect ? dom.thinkingLevelSelect.value : 'MEDIUM',
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) {
    showApiError(data);
    throw new Error(data.exactApiError?.message || 'Adversarial Critic failed');
  }

  state.critiqueR1 = data.critique;
  state.latencies.criticR1Ms = data.latencyMs || 0;

  renderCriticInspector();
  updateMetricsDisplay();

  addCallLog({
    stage: 'Step 3: 4-View Critic (Round 1)',
    latencyMs: data.latencyMs,
    cached: data.cached,
    usage: data.usage,
    summary: `Score ${state.critiqueR1.overallRatingOutOf10}/10 — ${(state.critiqueR1.deficiencies || []).length} deficiencies identified`,
  });

  if (dom.btnStep4RewriteR2) dom.btnStep4RewriteR2.disabled = false;
  setStatus('ok', `Step 3 Complete: Critic Score ${state.critiqueR1.overallRatingOutOf10}/10`);
}

async function step4RewriteAndRerenderRound2(options = {}) {
  if (!state.critiqueR1) await step3RunAdversarialCritic();
  hideApiError();
  setStatus('busy', 'Step 4: Argon Rewriting bpy Code (Round 2)...');

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
      thinkingLevel: dom.thinkingLevelSelect ? dom.thinkingLevelSelect.value : 'MEDIUM',
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) {
    showApiError(data);
    throw new Error(data.exactApiError?.message || 'Round 2 code rewrite failed');
  }

  state.round2 = data.round2;
  const reconstructionId = crypto.randomUUID();
  state.branches[reconstructionId] = CausalHistory.freeze({
    id: reconstructionId, parentId: null, forkYear: null,
    branchTitle: state.isReconstructingImage && state.pendingUpload ? `Reconstructed · ${state.pendingUpload.name}` : 'Reconstructed present', contextId: captureHistoryContext(),
    eras: [{ year: 2026, eraTitle: 'Reconstructed present', provenance: 'AI-authored geometry; critic results are shown separately.', eraBpyCode: data.round2.rewrittenBpyCode, blenderGlbUrl: data.round2.blenderGlbUrl }]
  });
  await persistHistories();
  renderHistoryNavigator();
  state.latencies.rewriteR2Ms = data.latencyMs || 0;
  state.latencies.blenderR2Ms = data.round2.blenderLatencyMs || 0;

  if (data.round2.updatedThreeJsConfig) {
    applyThreeJsLightingConfig(data.round2.updatedThreeJsConfig);
  }

  if (!await syncWorldToYear(2026, reconstructionId, {internal:Boolean(options.internal)})) throw new Error('Reconstruction GLB failed to load');
  state.activeStage = 'round2';
  syncStageButtons();

  state.round2Views = await captureFourDiagnosticScreenshots();
  displayFourDiagnosticScreenshots(state.round2Views, 2);

  state.metrics.r2SameCamSim = await computeImageSimilarityMetrics(state.photoDataUrl, state.round2Views.originalCam);
  state.metrics.r2GroundErrorMeters = computeAverageGroundElevationError(data.round2.blenderTelemetry);

  // Evaluate Round 2 with Critic
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
      thinkingLevel: dom.thinkingLevelSelect ? dom.thinkingLevelSelect.value : 'MEDIUM',
    }),
  });
  const crit2Data = await crit2Res.json();
  if (crit2Res.ok && crit2Data.ok) {
    state.critiqueR2 = crit2Data.critique;
    state.latencies.criticR2Ms = crit2Data.latencyMs || 0;
  }

  state.activeCodeView = 'r2';
  updateCodeEditorView();
  renderCriticInspector();
  updateMetricsDisplay();

  const r1Score = state.critiqueR1?.overallRatingOutOf10 ?? 'unavailable';
  const r2Score = state.critiqueR2?.overallRatingOutOf10 ?? 'unavailable';

  addCallLog({
    stage: 'Step 4: Closed-Loop Rewrite (Round 2)',
    latencyMs: data.latencyMs + (state.latencies.criticR2Ms || 0),
    cached: data.cached,
    usage: data.usage,
    summary: `Critic improved ${r1Score} -> ${r2Score}/10 | ${data.round2.blenderTelemetry?.objectCount || 0} meshes`,
  });

  if (dom.btnStep5Causal) dom.btnStep5Causal.disabled = false;
  setStatus('ok', `Step 4 Complete: Critic scores (${r1Score} → ${r2Score}/10)`);
}

/**
 * Step 5: Multi-Epoch Causal Simulation with live streaming progress
 */
const disabledGenerationControls = new Map();
function setHistoryGenerationBusy(busy) {
  state.isGeneratingHistory = busy;
  if (busy) {
    const controls = Object.entries(dom).filter(([key, value]) => value && /^(btnBranch|btnApplyIntervention|btnStep|btnRun|btnReturnToPresent|btnDirect|btnOpenIntervene|sampleSelect|photoInput|timeScrubberRange|btnUploadImage|btnReconstructImage|btnCancelImage)/.test(key)).map(([,value]) => value);
    controls.push(...(dom.stageButtons || []), ...(dom.camButtons || []));
    const demoButton = globalThis.document?.getElementById('btnThreeMinuteDemo');
    if (demoButton) controls.push(demoButton);
    for (const control of controls) {
      if (!('disabled' in control)) continue;
      disabledGenerationControls.set(control, control.disabled);
      control.disabled = true;
    }
  } else {
    for (const [control, wasDisabled] of disabledGenerationControls) control.disabled = wasDisabled;
    disabledGenerationControls.clear();
  }
  renderHistoryNavigator();
}
async function step5RunMultiEpochCausalSimulation(customIntervention, options = {}) {
  if (state.pendingUpload && !state.isReconstructingImage) {
    setLiveImageStatus('Reconstruct or cancel the selected image before changing its history.', 'blocked');
    return false;
  }
  if (state.isGeneratingHistory || state.isReturnWarpActive) return false;
  setHistoryGenerationBusy(true);
  try { return await performCausalHistoryGeneration(customIntervention, options); }
  catch (error) { showApiError(error.message); throw error; }
  finally { setHistoryGenerationBusy(false); }
}
async function performCausalHistoryGeneration(customIntervention, options = {}) {
  const interventionTextInput = customIntervention || dom.interventionInput?.value.trim() || 'In 1206, construct a Gothic lavabo fountain canopy.';
  const forkYear = CausalHistory.interventionYear(interventionTextInput, options.forkYear, state.activeYear);
  let parentId = state.activeBranchKey;
  let parentEra = CausalHistory.eraAt(state.branches[parentId]?.eras || [], forkYear);
  if (!parentEra?.eraBpyCode && !state.branches[parentId]?.demo) {
    await step4RewriteAndRerenderRound2({internal:true});
    parentId = state.activeBranchKey;
    parentEra = CausalHistory.eraAt(state.branches[parentId]?.eras || [], forkYear);
  }
  const parent = state.branches[parentId];
  const preparedContext = await prepareHistoryContext(parent);
  if (!parent?.contextId || !state.historyContexts[parent.contextId]) throw new Error('This history has no saved source context. Reconstruct it before continuing.');
  applyHistoryContext(parent, preparedContext);

  const interventionText =
    interventionTextInput;

  if (dom.interventionInput) dom.interventionInput.value = interventionText;
  hideApiError();

  // Show streaming progress strip
  if (dom.propagationProgressBox) {
    dom.propagationProgressBox.style.display = 'flex';
    dom.propagationStatusText.textContent = parent.demo ? 'CPU Blender compiling procedural causal worlds…' : 'Gemini reasoning through the multi-century causal chain…';
  }
  if (dom.btnApplyIntervention) dom.btnApplyIntervention.disabled = true;

  setStatus('busy', parent.demo ? 'CPU Blender: generating procedural history…' : 'Step 5: Propagating causal history…');

  try {
    const payloadBody = {
      originalImageDataUrl: state.photoDataUrl,
      verifiedBpyCode: parentEra?.eraBpyCode || state.round2?.rewrittenBpyCode || '',
      parentId, forkYear, demo: Boolean(parent.demo), interventionPrompt:interventionText,
      interventionText: `Fork from ${forkYear}. Parent history: ${JSON.stringify(state.branches[parentId]?.causalChainSummary || "Original baseline")}. Preserve all pre-fork history. ${interventionText}`,
      metricSummary: state.metricSummary,
      thinkingLevel: dom.thinkingLevelSelect ? dom.thinkingLevelSelect.value : 'MEDIUM',
    };

    let causalData = null;
    if (parent.demo) {
      const response = await fetch('/api/demo/causal', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payloadBody)});
      causalData = await response.json();
      if (!response.ok || !causalData.ok) throw new Error(causalData.error || causalData.exactApiError?.message || 'CPU demo generation failed');
    }

    // Attempt streaming endpoint for live timeline progress
    if (!causalData) try {
      const streamRes = await fetch('/api/argon/mvp3-causal-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadBody),
      });

      if (streamRes.ok && streamRes.body) {
        const reader = streamRes.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop();

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const evt = JSON.parse(line);
              if (evt.phase === 'era_compile_start') {
                dom.propagationStatusText.textContent = `Compiling ${evt.year} era Blender architecture...`;
              } else if (evt.phase === 'era_compiled') {
                dom.propagationStatusText.textContent = `Era ${evt.year} complete (${evt.objectCount} meshes)`;
              } else if (evt.phase === 'done' && evt.payload) {
                causalData = evt.payload;
              }
            } catch (_) {}
          }
        }
      }
    } catch (e) {
      console.warn('[Causal Stream Fallback]', e);
    }

    // Fallback to standard endpoint if streaming didn't return
    if (!causalData) {
      const res = await fetch('/api/argon/mvp3-causal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadBody),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        showApiError(json);
        throw new Error(json.exactApiError?.message || 'Causal simulation failed');
      }
      causalData = json;
    }

    state.latencies.causalMs = causalData.latencyMs || 0;

    const branchKey = crypto.randomUUID();
    state.branches[branchKey] = CausalHistory.fork(state.branches, parentId, forkYear, {...causalData.causalSimulation, intervention:interventionText}, branchKey);
    await persistHistories();
    if (!await syncWorldToYear(2026, branchKey, {internal:true})) throw new Error('Generated history is saved, but its world could not be loaded.');
    state.causalSimulation = state.branches[branchKey];
    renderHistoryNavigator();
    syncBranchButtons();

    // Cache era screenshots for gallery
    const eraShots = [];
    const eras = state.causalSimulation.eras || [];
    for (let i = 0; i < eras.length; i++) {
      const era = eras[i];
      const stageKey = i === 0 ? 'era1206' : i === 1 ? 'era1566' : i === 2 ? 'era1938' : 'alt2026';
      if (!await syncWorldToYear(era.year, branchKey, {internal:true})) throw new Error(`Cannot capture unavailable ${era.year} world`);
      const shot = dom.threeCanvas.toDataURL('image/png');
      state.eraRenders[stageKey] = shot;
      eraShots.push({
        title: `${era.year}: ${era.eraTitle}`,
        meta: `${era.blenderTelemetry?.objectCount || 0} meshes`,
        dataUrl: shot,
      });
    }

    renderCausalInspector();
    updateMetricsDisplay();

    closeInterventionModal();

    // Trigger signature Return to Present warp!
    await executeCinematicReturnToPresent({internal:true});

    addCallLog({
      stage: 'Step 5: Multi-Epoch Causal 3D Simulation',
      latencyMs: causalData.latencyMs + (state.causalSimulation.totalBlenderLatencyMs || 0),
      cached: causalData.cached,
      summary: `${parent.demo ? 'CPU procedural demo' : 'Generated history'}: ${eras.length} eras (${eras.map((e) => e.year).join(' → ')})`,
    });

    await saveMilestoneToGallery({
      id: `milestone_5_causal_${state.activeBranchKey}`,
      stageBadge: `CAUSAL BRANCH (${state.activeBranchKey.toUpperCase()})`,
      title: `History: ${state.causalSimulation.branchTitle || 'Causal simulation'}`,
      description: state.causalSimulation.causalChainSummary || interventionText,
      metricsSummary: `${eras.length} era worlds | ${parent.demo ? 'Procedural CPU demonstration' : 'AI generation'}`,
      screenshots: eraShots,
    });

    setStatus('ok', `${parent.demo ? 'CPU procedural history ready' : 'Causal history ready'} · ${eras.length} eras`);
    return branchKey;
  } finally {
    if (dom.btnApplyIntervention) dom.btnApplyIntervention.disabled = false;
    if (dom.propagationProgressBox) dom.propagationProgressBox.style.display = 'none';
  }
}

async function runFullMvp3DemoLoop() {
  try {
    if (dom.btnRunDemoLoop) dom.btnRunDemoLoop.disabled = true;
    await step1GroundWithMogeAnd2DPlan();
    await step2AuthorRound1World();
    await step3RunAdversarialCritic();
    await step4RewriteAndRerenderRound2();
    await step5RunMultiEpochCausalSimulation();
  } catch (err) {
    console.error('[MVP3 Demo Loop Error]', err);
  } finally {
    if (dom.btnRunDemoLoop) dom.btnRunDemoLoop.disabled = false;
  }
}

// ============================================================================
// Sync UI Inspectors (Critic Report, Code Diff, Causal Chain, Metrics)
// ============================================================================
function syncStageButtons() {
  dom.stageButtons.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.stage === state.activeStage);
  });
  if (dom.activeStageLabel) {
    dom.activeStageLabel.textContent = `Stage: ${state.activeStage}`;
  }
}

function renderCriticInspector() {
  if (!dom.criticReportContainer || !state.critiqueR1) return;
  const c1 = state.critiqueR1;
  const c2 = state.critiqueR2;
  const fixes = state.round2?.fixesApplied || [];

  const scoreBanner = c2
    ? `<div style="background:rgba(16,185,129,0.14);border:1px solid #10b981;border-radius:8px;padding:12px;margin-bottom:12px;">
         <div style="display:flex;justify-content:space-between;align-items:center;">
           <strong style="color:#34d399;font-size:12px;">ROUND 2 CRITIQUE</strong>
           <span style="font-family:var(--font-mono);font-size:13px;font-weight:700;color:#f8fafc;">${c1.overallRatingOutOf10} → ${c2.overallRatingOutOf10} / 10</span>
         </div>
         <p style="margin:6px 0 0;font-size:11px;color:#cbd5e1;">${state.round2?.rewriteSummary || c2.executiveSummary || ''}</p>
       </div>`
    : `<div style="background:rgba(245,158,11,0.14);border:1px solid #f59e0b;border-radius:8px;padding:12px;margin-bottom:12px;">
         <div style="display:flex;justify-content:space-between;align-items:center;">
           <strong style="color:#fbbf24;font-size:12px;">ROUND 1 CRITIQUE (Pre-Rewrite)</strong>
           <span style="font-family:var(--font-mono);font-size:13px;font-weight:700;color:#fde68a;">${c1.overallRatingOutOf10} / 10</span>
         </div>
         <p style="margin:6px 0 0;font-size:11px;color:#cbd5e1;">${c1.executiveSummary || ''}</p>
       </div>`;

  const defCards = (c1.deficiencies || [])
    .map((d, idx) => {
      const matchingFix = fixes.find((f) => f.deficiencyId === d.id) || fixes[idx];
      return `
      <div style="margin-bottom:10px;padding:10px;background:rgba(255,255,255,0.02);border:1px solid var(--border-subtle);border-left:3px solid ${matchingFix ? '#10b981' : '#f59e0b'};border-radius:6px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
          <strong style="color:#f8fafc;font-size:11px;">[${d.id || idx + 1}] ${d.category?.toUpperCase()}</strong>
          <span style="font-size:9px;font-weight:700;padding:2px 6px;border-radius:3px;background:${matchingFix ? '#059669' : '#b45309'};color:#fff;">${matchingFix ? 'APPLIED IN R2' : d.severity}</span>
        </div>
        <div style="font-size:11px;color:#cbd5e1;margin-bottom:4px;"><strong>Critic Diagnosis:</strong> ${d.diagnosis}</div>
        <div style="font-size:11px;color:#fde68a;"><strong>Required Fix:</strong> ${d.requiredCodeFix}</div>
        ${matchingFix ? `<div style="margin-top:6px;padding-top:4px;border-top:1px solid rgba(255,255,255,0.08);font-size:10px;color:#6ee7b7;">Applied: ${matchingFix.codeChangeDescription}</div>` : ''}
      </div>`;
    })
    .join('');

  dom.criticReportContainer.innerHTML = scoreBanner + defCards;
}

function updateCodeEditorView() {
  if (!dom.sceneCodeEditor) return;
  if (dom.btnCodeViewR1) dom.btnCodeViewR1.classList.toggle('active', state.activeCodeView === 'r1');
  if (dom.btnCodeViewR2) dom.btnCodeViewR2.classList.toggle('active', state.activeCodeView === 'r2');
  if (dom.btnCodeViewTelemetry) dom.btnCodeViewTelemetry.classList.toggle('active', state.activeCodeView === 'telemetry');

  if (state.activeCodeView === 'r1') {
    dom.sceneCodeEditor.value = state.round1?.blenderPythonScript || state.round1?.bpyCode || '# Run Step 2 to author Round 1 bpy code...';
  } else if (state.activeCodeView === 'r2') {
    dom.sceneCodeEditor.value = state.round2?.blenderPythonScript || state.round2?.rewrittenBpyCode || '# Run Step 4 to rewrite Round 2 bpy code...';
  } else {
    dom.sceneCodeEditor.value = JSON.stringify({
      metricSummary: state.metricSummary,
      round1Telemetry: state.round1?.blenderTelemetry,
      round2Telemetry: state.round2?.blenderTelemetry,
      diffStats: state.round2?.diffStats,
    }, null, 2);
  }
}

function renderCausalInspector() {
  if (!dom.causalGraphContainer || !state.causalSimulation) return;
  const cs = state.causalSimulation;
  const erasHtml = (cs.eras || [])
    .map((era) => `
      <div style="margin-bottom:10px;padding:10px;background:rgba(255,255,255,0.02);border:1px solid var(--border-subtle);border-radius:6px;cursor:pointer;" onclick="jumpToKeyframe(${era.year})">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
          <strong style="color:#fbbf24;font-size:12px;">${era.year} — ${era.eraTitle}</strong>
          <span style="font-family:var(--font-mono);font-size:10px;color:var(--text-secondary);">${era.blenderTelemetry?.objectCount || 0} meshes</span>
        </div>
        <p style="margin:4px 0;font-size:11px;color:#cbd5e1;">${era.narrative}</p>
        <div style="font-size:10px;color:#93c5fd;">${(era.causalTransitions || []).map((t) => `• ${t}`).join('<br/>')}</div>
      </div>
    `)
    .join('');

  dom.causalGraphContainer.innerHTML = `
    <div style="margin-bottom:10px;padding:10px;background:#0b0f17;border:1px solid var(--border-subtle);border-radius:6px;">
      <div style="font-size:11px;color:#f8fafc;"><strong>Intervention:</strong> ${cs.intervention}</div>
      <div style="font-size:10px;color:#34d399;margin-top:4px;"><strong>Unaffected Anchors Preserved:</strong> ${(cs.unaffectedStructures || []).join(', ')}</div>
    </div>
    ${erasHtml}
  `;
}

function updateMetricsDisplay() {
  if (state.critiqueR1 && state.critiqueR2) {
    if (dom.metricCriticScore) dom.metricCriticScore.textContent = `${state.critiqueR1.overallRatingOutOf10} → ${state.critiqueR2.overallRatingOutOf10} / 10`;
    if (dom.metricCriticSub) dom.metricCriticSub.textContent = `+${(state.critiqueR2.overallRatingOutOf10 - state.critiqueR1.overallRatingOutOf10).toFixed(1)} pt improvement`;
  } else if (state.critiqueR1) {
    if (dom.metricCriticScore) dom.metricCriticScore.textContent = `${state.critiqueR1.overallRatingOutOf10} / 10`;
    if (dom.metricCriticSub) dom.metricCriticSub.textContent = `${(state.critiqueR1.deficiencies || []).length} deficiencies`;
  }

  const t1 = state.round1?.blenderTelemetry;
  const t2 = state.round2?.blenderTelemetry;
  if (t1 && t2) {
    if (dom.metricMeshComplexity) dom.metricMeshComplexity.textContent = `${t1.objectCount} → ${t2.objectCount} meshes`;
    if (dom.metricMeshSub) dom.metricMeshSub.textContent = `${t1.totalTriangles.toLocaleString()} → ${t2.totalTriangles.toLocaleString()} tris`;
  } else if (t1) {
    if (dom.metricMeshComplexity) dom.metricMeshComplexity.textContent = `${t1.objectCount} meshes`;
    if (dom.metricMeshSub) dom.metricMeshSub.textContent = `${t1.totalTriangles.toLocaleString()} tris`;
  }

  if (state.metrics.r1GroundErrorMeters !== null && state.metrics.r2GroundErrorMeters !== null) {
    if (dom.metricGroundContact) dom.metricGroundContact.textContent = `${state.metrics.r1GroundErrorMeters}m → ${state.metrics.r2GroundErrorMeters}m`;
  }

  const sim = state.metrics.r2SameCamSim || state.metrics.r1SameCamSim;
  if (sim) {
    if (dom.metricVisualFidelity) dom.metricVisualFidelity.textContent = `SSIM ${sim.ssim}`;
    if (dom.metricVisualSub) dom.metricVisualSub.textContent = `PSNR ${sim.psnr} dB | MAE ${sim.mae}`;
  }

  if (state.round2?.diffStats) {
    const ds = state.round2.diffStats;
    if (dom.metricCodeDelta) dom.metricCodeDelta.textContent = `+${ds.addedLines} / -${ds.removedLines} lines`;
    if (dom.metricCodeSub) dom.metricCodeSub.textContent = `R1: ${ds.round1Lines} → R2: ${ds.round2Lines} lines`;
  }

  const L = state.latencies;
  const totalArgon = L.authorR1Ms + L.criticR1Ms + L.rewriteR2Ms + L.criticR2Ms + L.causalMs;
  const totalBlender = L.blenderR1Ms + L.blenderR2Ms;
  if (dom.metricLatencies) dom.metricLatencies.textContent = `Blender ${totalBlender}ms | Argon ${totalArgon}ms`;
}

function computeAverageGroundElevationError(telemetry) {
  if (!telemetry || !Array.isArray(telemetry.objects) || !telemetry.objects.length) return 0;
  const floorStanding = telemetry.objects.filter((o) => Math.abs(o.groundElevationDeltaMeters || 0) < 1.35);
  const list = floorStanding.length ? floorStanding : telemetry.objects;
  const sumAbs = list.reduce((acc, o) => acc + Math.abs(o.supportGapMeters || o.groundElevationDeltaMeters || 0), 0);
  return Number((sumAbs / list.length).toFixed(3));
}

function computeImageSimilarityMetrics(imgDataUrlA, imgDataUrlB) {
  return new Promise((resolve) => {
    const imgA = new Image();
    const imgB = new Image();
    let loaded = 0;
    const onBoth = () => {
      loaded++;
      if (loaded < 2) return;
      const w = 256, h = 192;
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
          const va = dA[i + c], vb = dB[i + c];
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
      const meanA = sumA / n, meanB = sumB / n;
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
      varA /= n; varB /= n; cov /= n;
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
function bindEvents() {
  // Top chrome controls
  if (dom.btnToggleDevMode) dom.btnToggleDevMode.addEventListener('click', toggleDevDrawer);
  if (dom.btnCloseDevDrawer) dom.btnCloseDevDrawer.addEventListener('click', toggleDevDrawer);
  if (dom.devDrawerBackdrop) dom.devDrawerBackdrop.addEventListener('click', toggleDevDrawer);

  dom.camButtons.forEach((btn) => {
    btn.addEventListener('click', () => setCameraPreset(btn.dataset.cam, true));
  });

  if (dom.toggleSplitSlider) {
    dom.toggleSplitSlider.addEventListener('change', () => {
      if (dom.toggleSplitSlider.checked) {
        setCameraPreset('originalCam', true);
        dom.splitCompareOverlay.style.display = 'block';
        updateSplitPosition(dom.splitSliderInput ? dom.splitSliderInput.value : 50);
      } else {
        dom.splitCompareOverlay.style.display = 'none';
      }
    });
  }

  if (dom.splitSliderInput) {
    dom.splitSliderInput.addEventListener('input', (e) => updateSplitPosition(e.target.value));
  }

  // Timeline Branch buttons
  if (dom.btnBranchOrig) dom.btnBranchOrig.addEventListener('click', () => switchTimelineBranch('orig').catch(err => showApiError(err.message)));
  if (dom.btnBranchA) dom.btnBranchA.addEventListener('click', () => switchTimelineBranch('branchA').catch(err => showApiError(err.message)));
  if (dom.btnBranchB) dom.btnBranchB.addEventListener('click', () => switchTimelineBranch('branchB').catch(err => showApiError(err.message)));
  if (dom.btnOpenInterveneModal) dom.btnOpenInterveneModal.addEventListener('click', () => openInterventionModal('Central Courtyard Monument'));

  // Signature RETURN TO PRESENT action
  if (dom.btnReturnToPresent) dom.btnReturnToPresent.addEventListener('click', executeCinematicReturnToPresent);

  // Intervention modal
  if (dom.btnCloseInterveneModal) dom.btnCloseInterveneModal.addEventListener('click', closeInterventionModal);
  if (dom.btnCancelIntervene) dom.btnCancelIntervene.addEventListener('click', closeInterventionModal);
  if (dom.btnApplyIntervention) dom.btnApplyIntervention.addEventListener('click', () => step5RunMultiEpochCausalSimulation().catch(err => showApiError(err.message)));

  document.querySelectorAll('.preset-idea-pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idea = btn.dataset.idea;
      if (dom.interventionInput && idea) dom.interventionInput.value = idea;
    });
  });

  // Causal popover
  if (dom.btnCloseAncestryPopover) dom.btnCloseAncestryPopover.addEventListener('click', () => {
    dom.causalAncestryPopover.style.display = 'none';
  });
  if (dom.btnDirectInterveneLavabo) dom.btnDirectInterveneLavabo.addEventListener('click', () => switchTimelineBranch('branchA').catch(err => showApiError(err.message)));
  if (dom.btnDirectInterveneAstrolabe) dom.btnDirectInterveneAstrolabe.addEventListener('click', () => switchTimelineBranch('branchB').catch(err => showApiError(err.message)));
  if (dom.btnDirectScaleUp) dom.btnDirectScaleUp.addEventListener('click', () => {
    const target = state.selected3DObject || proceduralGroup;
    target.scale.multiplyScalar(1.15);
    renderer.render(scene, camera);
    showToast('Scaled selected 3D object +15%');
  });
  if (dom.btnDirectRotateObj) dom.btnDirectRotateObj.addEventListener('click', () => {
    const target = state.selected3DObject || proceduralGroup;
    target.rotation.y += Math.PI / 8;
    renderer.render(scene, camera);
    showToast('Rotated selected 3D object +22.5°');
  });

  // Developer mode pipeline actions
  if (dom.btnRunDemoLoop) dom.btnRunDemoLoop.addEventListener('click', runFullMvp3DemoLoop);
  if (dom.btnStep1Ground) dom.btnStep1Ground.addEventListener('click', step1GroundWithMogeAnd2DPlan);
  if (dom.btnStep2AuthorR1) dom.btnStep2AuthorR1.addEventListener('click', step2AuthorRound1World);
  if (dom.btnStep3Critic) dom.btnStep3Critic.addEventListener('click', step3RunAdversarialCritic);
  if (dom.btnStep4RewriteR2) dom.btnStep4RewriteR2.addEventListener('click', step4RewriteAndRerenderRound2);
  if (dom.btnStep5Causal) dom.btnStep5Causal.addEventListener('click', () => step5RunMultiEpochCausalSimulation().catch(err => showApiError(err.message)));

  if (dom.sampleSelect) {
    dom.sampleSelect.addEventListener('change', () => loadSelectedSample(dom.sampleSelect.value));
  }
  if (dom.btnUploadImage) dom.btnUploadImage.addEventListener('click', () => {
    if (!state.isGeneratingHistory && !state.isReturnWarpActive) dom.photoInput?.click();
  });
  if (dom.photoInput) dom.photoInput.addEventListener('change', event => {
    const file = event.target.files?.[0];
    event.target.value = ''; // Selecting the same file again must emit change.
    if (file) selectUploadedImage(file).catch(error => setLiveImageStatus(error.message, 'error'));
  });
  if (dom.btnReconstructImage) dom.btnReconstructImage.addEventListener('click', () => reconstructUploadedImage().catch(error => showApiError(error.message)));
  if (dom.btnCancelImage) dom.btnCancelImage.addEventListener('click', () => cancelUploadedImage().catch(error => showApiError(error.message)));

  dom.stageButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const st = btn.dataset.stage;
      if (st === 'era1206') jumpToKeyframe(1206);
      else if (st === 'era1566') jumpToKeyframe(1566);
      else if (st === 'era1938') jumpToKeyframe(1938);
      else if (st === 'alt2026' || st === 'round2') jumpToKeyframe(2026);
    });
  });

  if (dom.toggleMogeBackdrop) {
    dom.toggleMogeBackdrop.addEventListener('change', () => {
      if (photoMesh) photoMesh.visible = dom.toggleMogeBackdrop.checked;
      renderer.render(scene, camera);
    });
  }
  if (dom.toggleBlenderGlb) {
    dom.toggleBlenderGlb.addEventListener('change', () => {
      proceduralGroup.visible = dom.toggleBlenderGlb.checked;
      renderer.render(scene, camera);
    });
  }

  if (dom.btnShowR1Shots) dom.btnShowR1Shots.addEventListener('click', () => displayFourDiagnosticScreenshots(state.round1Views, 1));
  if (dom.btnShowR2Shots) dom.btnShowR2Shots.addEventListener('click', () => displayFourDiagnosticScreenshots(state.round2Views, 2));

  // Drawer Tabs
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach((p) => (p.style.display = 'none'));
      btn.classList.add('active');
      const panel = document.getElementById(btn.dataset.tab);
      if (panel) panel.style.display = 'block';
    });
  });

  if (dom.btnCodeViewR1) dom.btnCodeViewR1.addEventListener('click', () => { state.activeCodeView = 'r1'; updateCodeEditorView(); });
  if (dom.btnCodeViewR2) dom.btnCodeViewR2.addEventListener('click', () => { state.activeCodeView = 'r2'; updateCodeEditorView(); });
  if (dom.btnCodeViewTelemetry) dom.btnCodeViewTelemetry.addEventListener('click', () => { state.activeCodeView = 'telemetry'; updateCodeEditorView(); });

  [dom.ctrlSunAngle, dom.ctrlLightIntensity, dom.ctrlRoughness, dom.ctrlPhotoOpacity].forEach((el) => {
    if (el) el.addEventListener('input', applyArtDirectorSliderChange);
  });

  if (dom.btnDismissError) dom.btnDismissError.addEventListener('click', hideApiError);
}

function setupNavigationControls() {
  const canvas = dom.threeCanvas;
  let downX = 0, downY = 0;

  canvas.addEventListener('mousedown', (e) => {
    navState.isDragging = true;
    navState.lastX = e.clientX;
    navState.lastY = e.clientY;
    downX = e.clientX;
    downY = e.clientY;
  });

  // Raycast hover tracking for hover indicator HUD
  canvas.addEventListener('mousemove', (e) => {
    if (navState.isDragging) {
      const dx = e.clientX - navState.lastX;
      const dy = e.clientY - navState.lastY;
      navState.lastX = e.clientX;
      navState.lastY = e.clientY;
      navState.yaw -= dx * 0.0035;
      navState.pitch = Math.max(-1.2, Math.min(1.2, navState.pitch - dy * 0.0035));
      const euler = new THREE.Euler(navState.pitch, navState.yaw, 0, 'YXZ');
      camera.quaternion.setFromEuler(euler);
      updateCameraHud();
      renderer.render(scene, camera);
      return;
    }

    // Passive raycast hover check
    const rect = canvas.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(proceduralGroup.children, true);

    if (hits.length > 0 && dom.objectHoverHud) {
      const hitObj = hits[0].object;
      const cleanName = hitObj.name.replace(/_\d+$/, '').replace(/_/g, ' ');
      dom.hoverObjectName.textContent = cleanName;
      dom.objectHoverHud.classList.add('visible');
    } else if (dom.objectHoverHud) {
      dom.objectHoverHud.classList.remove('visible');
    }
  });

  // Click on 3D object to open contextual intervention card or inspect causal ancestry
  window.addEventListener('mouseup', (e) => {
    const moveDist = Math.hypot(e.clientX - downX, e.clientY - downY);
    if (navState.isDragging && moveDist < 6 && e.target === canvas) {
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
        const cleanName = hitMesh.name.replace(/_\d+$/, '').replace(/_/g, ' ');

        // If the clicked object is a transformed monument and causal data exists, show its ancestry
        if (state.causalSimulation && /^(Lavabo|Astrolabe|Marble_Balust|Wellhead)/i.test(hitMesh.name)) {
          inspectObjectCausalAncestry('custom', hitMesh.name);
        } else {
          // Otherwise open the natural language historical intervention card
          openInterventionModal(cleanName);
        }
      }
    }
    navState.isDragging = false;
  });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    camera.position.addScaledVector(fwd, -e.deltaY * 0.002);
    updateCameraHud();
    renderer.render(scene, camera);
  }, { passive: false });
}

// ============================================================================
// Render & Cinematic Animation Loop
// ============================================================================
function animateLoop() {
  requestAnimationFrame(animateLoop);

  // Handle smooth cinematic camera tweening
  if (navState.isTweening) {
    const elapsed = performance.now() - navState.tweenStartTime;
    const progress = Math.min(1, elapsed / navState.tweenDurationMs);
    const ease = 1 - Math.pow(1 - progress, 3); // cubic ease-out

    camera.position.lerpVectors(navState.tweenStartPos, navState.tweenTargetPos, ease);
    camera.quaternion.slerpQuaternions(navState.tweenStartQuat, navState.tweenTargetQuat, ease);
    camera.fov = navState.tweenStartFov + (navState.tweenTargetFov - navState.tweenStartFov) * ease;
    camera.updateProjectionMatrix();

    if (progress >= 1) {
      navState.isTweening = false;
      const euler = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
      navState.yaw = euler.y;
      navState.pitch = euler.x;
    }
  }

  if (renderer && scene && camera) {
    renderer.render(scene, camera);
  }
}

window.addEventListener('DOMContentLoaded', initApp);

function renderHistoryNavigator() {
  let panel = document.getElementById('historyNavigator');
  if (!panel) {
    panel = document.createElement('nav'); panel.id = 'historyNavigator'; panel.setAttribute('aria-label', 'Causal histories'); document.body.append(panel);
  }
  panel.replaceChildren();
  for (const branch of Object.values(state.branches)) {
    const button = document.createElement('button');
    button.className = branch.id === state.activeBranchKey ? 'selected' : '';
    button.textContent = branch.id === 'orig' ? 'Original · illustrative world' : branch.parentId ? `${branch.branchTitle || 'Alternate history'} · fork ${branch.forkYear}` : branch.branchTitle;
    button.title = branch.parentId ? `Parent: ${branch.parentId} · Fork: ${branch.forkYear}` : branch.demo ? 'Root history · procedural demonstration, not an AI reconstruction' : 'Root history · generated reconstruction';
    button.disabled = Boolean(state.isGeneratingHistory || state.isReturnWarpActive);
    button.onclick = () => switchTimelineBranch(branch.id).catch(err => showApiError(err.message));
    panel.append(button);
    if (branch.parentId) {
      const relation = document.createElement('small'); relation.textContent = `↳ ${branch.parentId.slice(0,8)} → ${branch.forkYear}`; panel.append(relation);
    }
  }
}
const HISTORY_STORAGE_KEY = 'timetravel.histories.v2';
function captureHistoryContext() {
  const contextId = crypto.randomUUID();
  state.historyContexts[contextId] = CausalHistory.freeze(JSON.parse(JSON.stringify({
    photoDataUrl:state.photoDataUrl, samplePath:state.samplePath, photoWidth:state.photoWidth, photoHeight:state.photoHeight,
    metricSummary:state.metricSummary, gridOverlayDataUrl:state.gridOverlayDataUrl,
    floorplanSvgDataUrl:state.floorplanSvgDataUrl, targetRenderDataUrl:state.targetRenderDataUrl
  })));
  state.loadedContextId = contextId;
  return contextId;
}
async function persistHistories() {
  if (state.historyPersistenceBlocked) {
    showApiError('Earlier saved histories could not be restored. Their records are retained; new histories remain in this session until browser storage is restored.');
    return false;
  }
  try {
    const envelope = {branches:state.branches,contexts:state.historyContexts};
    if (globalThis.HistoryStorage) await HistoryStorage.create({storage:localStorage}).save(HISTORY_STORAGE_KEY,envelope);
    else localStorage.setItem(HISTORY_STORAGE_KEY,JSON.stringify(envelope));
    return true;
  } catch (_) {
    const message = 'History retained in this session; browser storage could not save it. Earlier saved histories are unchanged.';
    showToast(message,6000);showApiError(message);
    return false;
  }
}
async function prepareHistoryContext(branch) {
  const context = state.historyContexts[branch?.contextId];
  if (!context?.photoDataUrl || state.loadedContextId === branch.contextId) return null;
  const image = await new Promise((resolve,reject) => {
    const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error('Saved reference photograph unavailable')); img.src = context.photoDataUrl;
  });
  return {context,image};
}
function applyHistoryContext(branch, prepared) {
  const context = state.historyContexts[branch?.contextId];
  if (!context || state.loadedContextId === branch.contextId) return;
  state.samplePath = context.samplePath;
  state.photoDataUrl = context.photoDataUrl;
  state.photoWidth = context.photoWidth;
  state.photoHeight = context.photoHeight;
  state.metricSummary = context.metricSummary;
  state.gridOverlayDataUrl = context.gridOverlayDataUrl;
  state.floorplanSvgDataUrl = context.floorplanSvgDataUrl;
  state.targetRenderDataUrl = context.targetRenderDataUrl;
  state.photoImgElement = prepared?.image || state.photoImgElement;
  if (dom.splitOriginalImg) dom.splitOriginalImg.src = context.photoDataUrl;
  if (photoMesh) {scene.remove(photoMesh); photoMesh = null;}
  if (wireframeMesh) {scene.remove(wireframeMesh); wireframeMesh = null;}
  if (dynamicPhotoTexture) dynamicPhotoTexture.dispose();
  dynamicPhotoTexture = null; basePhotoCanvas = null; dynamicTextureCanvas = null;
  state.mogeData = null;
  state.round1 = null; state.round2 = null; state.critiqueR1 = null; state.critiqueR2 = null;
  if (context.metricSummary?.fovYDeg) {camera.fov = context.metricSummary.fovYDeg;camera.updateProjectionMatrix();}
  state.loadedContextId = branch.contextId;
}
async function loadDemoHistory() {
  const response = await fetch('/samples/worlds/manifest.json');
  if (!response.ok) throw new Error('Demo worlds missing: run bash scripts/setup-cloud.sh');
  const manifest = await response.json();
  let savedHistoryReadFailed = false;
  try {
    const saved = globalThis.HistoryStorage ? await HistoryStorage.create({storage:localStorage}).load(HISTORY_STORAGE_KEY) : JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY) || '{}');
    for (const [id, context] of Object.entries(saved.contexts || {})) state.historyContexts[id] = CausalHistory.freeze(context);
    for (const [id, branch] of Object.entries(saved.branches || {})) {
      if (branch.id === id && Array.isArray(branch.eras)) state.branches[id] = CausalHistory.freeze(branch);
    }
  } catch (_) {
    savedHistoryReadFailed = true;
    state.historyPersistenceBlocked = true;
    showToast('Saved histories could not be restored. Their stored records have been retained; the demo remains available.',6000);
  }
  if (!state.branches.orig) state.branches.orig = CausalHistory.freeze({
    id:'orig', parentId:null, forkYear:null, branchTitle:'Original illustrative world', demo:true,
    provenance:manifest.provenance, contextId:captureHistoryContext(), eras:manifest.eras
  });
  if (!savedHistoryReadFailed) await persistHistories();
  renderHistoryNavigator(); syncBranchButtons();
  await syncWorldToYear(state.activeYear, 'orig');
  const demoButton = document.getElementById('btnThreeMinuteDemo');
  if (demoButton) demoButton.addEventListener('click', () => runThreeMinuteDemo().catch(err => showApiError(err.message)));
  if (!savedHistoryReadFailed) showToast('CPU PROCEDURAL DEMO · No AI reconstruction or critic score claimed', 6000);
}
async function runThreeMinuteDemo() {
  if (state.pendingUpload) {
    setLiveImageStatus('Cancel the selected image to run the illustrative demo, or reconstruct it to create your own world.', 'blocked');
    return false;
  }
  const button = document.getElementById('btnThreeMinuteDemo');
  if (button) button.disabled = true;
  try {
    if (!await switchTimelineBranch('orig')) throw new Error('Baseline world unavailable');
    await jumpToKeyframe(1206);
    const first = await step5RunMultiEpochCausalSimulation('In 1206, construct a Gothic bronze-and-limestone lavabo fountain canopy.', {forkYear:1206});
    await switchTimelineBranch('orig');
    await switchTimelineBranch(first);
    const second = await step5RunMultiEpochCausalSimulation('In 1566, add a marble balustrade and bronze astrolabe sundial.', {forkYear:1566});
    showToast('Two preserved causal histories · select any parent or era to compare',6000);
    return {first,second};
  } finally {if (button) button.disabled = false;}
}


const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
const UPLOAD_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
let uploadSelectionVersion = 0;
function setLiveImageStatus(message, phase = 'selected') {
  if (dom.liveImagePanel) dom.liveImagePanel.hidden = false;
  if (dom.liveImageStatus) {
    dom.liveImageStatus.textContent = message;
    if (dom.liveImageStatus.dataset) dom.liveImageStatus.dataset.state = phase;
  }
  if (dom.btnReconstructImage) dom.btnReconstructImage.disabled = state.isInitializing || state.isReconstructingImage || !state.pendingUpload?.image;
  if (dom.btnCancelImage) dom.btnCancelImage.disabled = state.isReconstructingImage;
}
function currentHistorySelection() {
  return state.branches[state.activeBranchKey] ? {branchId:state.activeBranchKey,year:state.activeYear} : null;
}
async function selectUploadedImage(file) {
  if (state.isGeneratingHistory || state.isReturnWarpActive) return false;
  if (!UPLOAD_IMAGE_TYPES.has(file.type)) {
    setLiveImageStatus('Choose a JPEG, PNG, or WebP image.', 'error');
    throw new Error('Choose a JPEG, PNG, or WebP image.');
  }
  if (!file.size || file.size > MAX_UPLOAD_BYTES) {
    setLiveImageStatus('Choose a nonempty image no larger than 12 MiB.', 'error');
    throw new Error('Choose a nonempty image no larger than 12 MiB.');
  }
  const selection = ++uploadSelectionVersion;
  const previous = state.pendingUpload;
  const pending = {id:crypto.randomUUID(),name:file.name || 'Uploaded image',phase:'reading',dataUrl:null,image:null,
    returnSelection:currentHistorySelection() || previous?.returnSelection || null};
  state.pendingUpload = pending;
  if (dom.uploadedImageName) dom.uploadedImageName.textContent = pending.name;
  if (dom.uploadedImagePreview) dom.uploadedImagePreview.hidden = true;
  setLiveImageStatus('Reading image. The displayed world is unchanged.', 'reading');
  try {
    const dataUrl = await new Promise((resolve,reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('The image could not be read. Choose it again.'));
      reader.onabort = () => reject(new Error('Image reading was cancelled.'));
      reader.readAsDataURL(file);
    });
    if (selection !== uploadSelectionVersion) return false;
    if (dom.uploadedImagePreview) {dom.uploadedImagePreview.src = dataUrl;dom.uploadedImagePreview.hidden = false;}
    const image = await new Promise((resolve,reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('This file is not a decodable image. Choose another JPEG, PNG, or WebP.'));
      img.src = dataUrl;
    });
    if (selection !== uploadSelectionVersion) return false;
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (!width || !height || width * height > 40_000_000) throw new Error('Choose an image with at most 40 million pixels.');
    Object.assign(pending,{dataUrl,image,width,height,phase:'selected'});
    setLiveImageStatus(`${width} × ${height}. Ready to reconstruct. No generation request has been sent.`, 'selected');
    return true;
  } catch (error) {
    if (selection !== uploadSelectionVersion) return false;
    pending.phase = 'error';pending.image = null;
    if (dom.uploadedImagePreview) dom.uploadedImagePreview.hidden = true;
    setLiveImageStatus(error.message, 'error');
    throw error;
  }
}
function authoringProviderName(status = {}) {
  return status.authoringProvider === 'vertex' ? 'Vertex AI' : 'Gemini API';
}
function authoringReadinessMessage(status = {}) {
  if (status.authoringProvider === 'vertex') return 'Vertex AI authentication and model configuration are required to generate architecture and run the critic.';
  const error = typeof status.readinessError === 'string' ? status.readinessError : `${status.readinessError?.code || ''} ${status.readinessError?.message || ''}`;
  if (/model/i.test(error) && !/key|credential/i.test(error)) return 'Choose an accessible GEMINI_MODEL in cloud environment settings to generate architecture and run the critic.';
  if (/key|credential|auth/i.test(error)) return 'Configure GEMINI_API_KEY securely and select an accessible GEMINI_MODEL in cloud environment settings to generate architecture and run the critic.';
  return 'Configure GEMINI_API_KEY and an accessible GEMINI_MODEL in cloud environment settings to generate architecture and run the critic.';
}
async function readLiveServiceStatus(url) {
  try {
    const response = await fetch(url);
    const data = await response.json();
    return {available:response.ok,...data};
  } catch (error) { return {available:false,message:error.message}; }
}
const SOURCE_STATE_KEYS = ['samplePath','photoDataUrl','photoWidth','photoHeight','photoImgElement','gridOverlayDataUrl','floorplanSvgDataUrl','targetRenderDataUrl','mogeData','metricSummary','round1','round2','round1Views','round2Views','critiqueR1','critiqueR2','metrics','latencies','loadedContextId'];
function uploadedDepthPreview(pending) {
  proceduralGroup.visible = false;
  if (dom.toggleBlenderGlb) dom.toggleBlenderGlb.checked = false;
  state.activeBranchKey = null;state.causalSimulation = null;state.activeStage = 'depth';
  state.displayedWorld = {branchId:null,year:null,url:null,kind:'depth',uploadId:pending.id};
  state.selected3DObject = null;
  syncStageButtons();syncBranchButtons();renderHistoryNavigator();
  if (dom.heroYearNumber) dom.heroYearNumber.textContent = '3D';
  if (dom.heroYearSuffix) dom.heroYearSuffix.textContent = 'UPLOADED IMAGE · METRIC DEPTH';
  if (dom.heroEraName) dom.heroEraName.textContent = pending.name;
  if (dom.heroEraProvenance) dom.heroEraProvenance.textContent = 'Metric depth recovered from your image. Architectural authoring and critic verification have not completed.';
  if (dom.splitCompareOverlay) dom.splitCompareOverlay.style.display = 'none';
  if (dom.toggleSplitSlider) dom.toggleSplitSlider.checked = false;
  renderer.render(scene,camera);
}
async function reconstructUploadedImage() {
  if (state.isInitializing) {
    setLiveImageStatus('The cloud workbench is starting. Your selected image is retained; reconstruct it when startup finishes.', 'reading');
    return false;
  }
  const pending = state.pendingUpload;
  if (!pending?.image) {setLiveImageStatus('Choose a valid image before reconstructing.', 'error');return false;}
  if (state.isGeneratingHistory || state.isReturnWarpActive) return false;
  const sourceBefore = Object.fromEntries(SOURCE_STATE_KEYS.map(key=>[key,state[key]]));
  pending.returnSelection = currentHistorySelection() || pending.returnSelection;
  let depthReady = false;
  state.isReconstructingImage = true;
  setHistoryGenerationBusy(true);
  closeAllPopovers();hideApiError();
  try {
    setLiveImageStatus('Checking cloud reconstruction services…', 'busy');
    const [authoring,depth] = await Promise.all([readLiveServiceStatus('/api/status'),readLiveServiceStatus('/api/depth-status')]);
    if (depth.available && depth.depthAvailable === false) throw new Error(depth.message || 'The AI3D depth service is not running. Start it in the cloud before reconstructing.');
    await loadPhotoFromDataUrl(pending.dataUrl);
    state.samplePath = `upload:${pending.name}`;
    pending.phase = 'grounding';
    setLiveImageStatus(depth.apiKeyConfigured === false ? '1/4 · Recovering metric depth. Checking for an existing result; a key is required for a new live request.' : '1/4 · Recovering metric depth from your image…', 'busy');
    await step1GroundWithMogeAnd2DPlan();
    depthReady = true;pending.phase = 'depth-ready';
    uploadedDepthPreview(pending);
    if (!authoring.available || !authoring.liveGenerationAvailable) {
      const message = `Depth ready; ${authoringReadinessMessage(authoring)} No reconstructed history has been created.`;
      pending.phase = 'blocked';setLiveImageStatus(message,'blocked');setStatus('busy',`Depth ready · ${authoringProviderName(authoring)} setup required`);
      const error = typeof authoring.readinessError === 'string' ? authoring.readinessError : authoring.readinessError?.code || '';
      return {ok:false,depthReady:true,blocker:/model/i.test(error)?'configuration':'credentials',phase:'depth-ready'};
    }
    pending.phase = 'authoring';setLiveImageStatus('2/4 · Generating architecture from the uploaded image…', 'busy');
    await step2AuthorRound1World();
    pending.phase = 'critic';setLiveImageStatus('3/4 · Checking the generated world from four views…', 'busy');
    await step3RunAdversarialCritic();
    pending.phase = 'rewrite';setLiveImageStatus('4/4 · Applying critic corrections and exporting the reconstructed world…', 'busy');
    await step4RewriteAndRerenderRound2({internal:true});
    const rootId = state.activeBranchKey;
    state.pendingUpload = null;
    if (dom.liveImagePanel) dom.liveImagePanel.hidden = true;
    if (dom.activeSceneTitle) dom.activeSceneTitle.textContent = pending.name;
    setStatus('ok', state.critiqueR2 ? 'Uploaded image reconstructed · critic results available' : 'Uploaded image world generated · final critic unavailable');
    showToast('Your reconstructed world is ready. Earlier histories are preserved.',5000);
    return {ok:true,rootId,depthReady:true,criticAvailable:Boolean(state.critiqueR2)};
  } catch (error) {
    pending.phase = 'error';
    if (!depthReady) {
      Object.assign(state,sourceBefore);
      if (dom.splitOriginalImg) dom.splitOriginalImg.src = state.photoDataUrl || '';
    }
    const message = depthReady ? `Depth recovered; reconstruction stopped: ${error.message}` : `Image reconstruction could not start: ${error.message}`;
    setLiveImageStatus(message,'error');showApiError(message);
    return {ok:false,depthReady,phase:depthReady?'generation-failed':'depth-failed',message};
  } finally {
    state.isReconstructingImage = false;
    setHistoryGenerationBusy(false);
    if (state.pendingUpload && dom.btnReconstructImage) dom.btnReconstructImage.disabled = !state.pendingUpload.image;
    if (dom.btnCancelImage) dom.btnCancelImage.disabled = false;
  }
}
async function cancelUploadedImage() {
  if (state.isReconstructingImage || state.isGeneratingHistory) return false;
  const pending = state.pendingUpload;
  state.pendingUpload = null;++uploadSelectionVersion;
  if (dom.liveImagePanel) dom.liveImagePanel.hidden = true;
  if (dom.uploadedImagePreview) {dom.uploadedImagePreview.removeAttribute('src');dom.uploadedImagePreview.hidden = true;}
  if (pending?.returnSelection && state.activeBranchKey === null) {
    return syncWorldToYear(pending.returnSelection.year,pending.returnSelection.branchId);
  }
  return true;
}
