const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync, exec } = require('child_process');

const PORT = process.env.PORT || 3456;
const DEPTH_SERVICE_PORT = 3457;
const MODEL_ID = 'gemini-4-argon';
const CACHE_DIR = path.join(__dirname, '.cache');
const SAMPLES_DIR = path.join(__dirname, 'samples');
const PROGRESS_JSON = path.join(CACHE_DIR, 'mvp3_progress_milestones.json');
const BLENDER_BIN = '/Applications/Blender.app/Contents/MacOS/Blender';
const BLENDER_SCRIPT_MVP3 = path.join(__dirname, 'blender_toolchain.py');
const BLENDER_SCRIPT_MVP2 = path.join(__dirname, 'mvp2_blender_toolchain.py');

if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

const DEFAULT_TEXTURES = {
  limestone: path.join(SAMPLES_DIR, 'texture_limestone_ashlar.jpg'),
  pebble: path.join(SAMPLES_DIR, 'texture_pebble_courtyard.jpg'),
  walnut: path.join(SAMPLES_DIR, 'texture_walnut_pbr.jpg'),
};

// Shared job description for the MVP3 Blender toolchain. Both the synchronous runner
// (used by the original endpoints) and the async runner (used by the streaming causal
// endpoint) hash the exact same spec, so they share one GLB cache.
function prepareMvp3BlenderJob(specObj, prefix) {
  const hash = crypto.createHash('sha256').update(JSON.stringify(specObj)).digest('hex').slice(0, 20);
  const specPath = path.join(CACHE_DIR, `${prefix}_${hash}_spec.json`);
  const glbFilename = `${prefix}_${hash}.glb`;
  const glbPath = path.join(CACHE_DIR, glbFilename);
  const pyPath = path.join(CACHE_DIR, `${prefix}_${hash}.py`);
  const telPath = path.join(CACHE_DIR, `${prefix}_${hash}.telemetry.json`);
  return {
    t0: Date.now(),
    specPath,
    glbFilename,
    glbPath,
    pyPath,
    telPath,
    fullSpec: { ...specObj, textures: DEFAULT_TEXTURES },
    isCached: fs.existsSync(glbPath) && fs.existsSync(pyPath) && fs.existsSync(telPath),
    cmd: `"${BLENDER_BIN}" --background --factory-startup --python "${BLENDER_SCRIPT_MVP3}" -- "${specPath}" "${glbPath}" "${pyPath}" "${telPath}"`,
  };
}

function readMvp3BlenderResult(job, cached) {
  let telemetry = {};
  if (fs.existsSync(job.telPath)) {
    try {
      telemetry = JSON.parse(fs.readFileSync(job.telPath, 'utf8'));
    } catch (_) {}
  }
  return {
    glbUrl: `/.cache/${job.glbFilename}`,
    pythonScript: fs.existsSync(job.pyPath) ? fs.readFileSync(job.pyPath, 'utf8') : '',
    telemetry,
    blenderLatencyMs: Date.now() - job.t0,
    cached,
  };
}

function runBlenderMvp3Toolchain(specObj, prefix = 'mvp3_blender') {
  const job = prepareMvp3BlenderJob(specObj, prefix);
  if (job.isCached) return readMvp3BlenderResult(job, true);

  fs.writeFileSync(job.specPath, JSON.stringify(job.fullSpec, null, 2));
  execSync(job.cmd, { stdio: 'pipe', timeout: 45000 });
  return readMvp3BlenderResult(job, false);
}

// Non-blocking variant: identical spec/cache, but lets the event loop flush streamed
// progress events while Blender compiles an era.
function runBlenderMvp3ToolchainAsync(specObj, prefix = 'mvp3_blender') {
  const job = prepareMvp3BlenderJob(specObj, prefix);
  if (job.isCached) return Promise.resolve(readMvp3BlenderResult(job, true));

  fs.writeFileSync(job.specPath, JSON.stringify(job.fullSpec, null, 2));
  return new Promise((resolve, reject) => {
    exec(job.cmd, { timeout: 45000, maxBuffer: 64 * 1024 * 1024 }, (err) => {
      if (err) return reject(err);
      resolve(readMvp3BlenderResult(job, false));
    });
  });
}

// Legacy MVP1/MVP2 Blender runner preserved for /mvp1 and /mvp2 baseline routes
function runBlenderLegacyToolchain(specObj, prefix = 'blender') {
  const t0 = Date.now();
  const scriptToUse = fs.existsSync(BLENDER_SCRIPT_MVP2) ? BLENDER_SCRIPT_MVP2 : BLENDER_SCRIPT_MVP3;
  const hash = crypto.createHash('sha256').update(JSON.stringify(specObj)).digest('hex').slice(0, 20);
  const specPath = path.join(CACHE_DIR, `${prefix}_${hash}_spec.json`);
  const glbFilename = `${prefix}_${hash}.glb`;
  const glbPath = path.join(CACHE_DIR, glbFilename);
  const pyPath = path.join(CACHE_DIR, `${prefix}_${hash}.py`);

  if (fs.existsSync(glbPath) && fs.existsSync(pyPath)) {
    return {
      glbUrl: `/.cache/${glbFilename}`,
      pythonScript: fs.readFileSync(pyPath, 'utf8'),
      blenderLatencyMs: Date.now() - t0,
      cached: true,
    };
  }

  fs.writeFileSync(specPath, JSON.stringify(specObj, null, 2));
  execSync(
    `"${BLENDER_BIN}" --background --factory-startup --python "${scriptToUse}" -- "${specPath}" "${glbPath}" "${pyPath}"`,
    { stdio: 'pipe', timeout: 30000 }
  );

  return {
    glbUrl: `/.cache/${glbFilename}`,
    pythonScript: fs.existsSync(pyPath) ? fs.readFileSync(pyPath, 'utf8') : '',
    blenderLatencyMs: Date.now() - t0,
    cached: false,
  };
}

let cachedToken = null;
let cachedTokenTime = 0;
let cachedProject = null;

function getGcloudAuth() {
  const now = Date.now();
  if (!cachedProject) {
    cachedProject = (
      process.env.GOOGLE_CLOUD_PROJECT ||
      execSync('gcloud config get-value project', { encoding: 'utf8' })
    ).trim();
  }
  if (!cachedToken || now - cachedTokenTime > 40 * 60 * 1000) {
    cachedToken = execSync('gcloud auth print-access-token', { encoding: 'utf8' }).trim();
    cachedTokenTime = now;
  }
  return { token: cachedToken, project: cachedProject };
}

function getCacheKey(prefix, obj) {
  const hash = crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex').slice(0, 24);
  return path.join(CACHE_DIR, `${prefix}_${hash}.json`);
}

function readCache(cacheFile) {
  if (fs.existsSync(cacheFile)) {
    try {
      return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    } catch (_) {
      return null;
    }
  }
  return null;
}

function writeCache(cacheFile, data) {
  try {
    fs.writeFileSync(cacheFile, JSON.stringify(data, null, 2));
  } catch (_) {}
}

function callDepthService(payload) {
  return new Promise((resolve, reject) => {
    const bodyBuf = Buffer.from(JSON.stringify(payload), 'utf8');
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: DEPTH_SERVICE_PORT,
        path: '/estimate-depth',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': bodyBuf.length,
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            if (res.statusCode >= 200 && res.statusCode < 300 && parsed.ok) {
              resolve(parsed);
            } else {
              reject(new Error(parsed.error || `Depth service HTTP ${res.statusCode}`));
            }
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on('error', reject);
    req.write(bodyBuf);
    req.end();
  });
}

function normalizeUsage(u = {}) {
  return {
    promptTokens: u.promptTokenCount || 0,
    thoughtsTokens: u.thoughtsTokenCount || 0,
    outputTokens: u.candidatesTokenCount || 0,
    totalTokens: u.totalTokenCount || 0,
  };
}

function callGemini4Argon({ parts, systemInstruction, thinkingLevel = 'MEDIUM', temperature = 0.2 }) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    let auth;
    try {
      auth = getGcloudAuth();
    } catch (err) {
      return reject({
        status: 500,
        exactApiError: {
          source: 'gcloud_cli_auth',
          message: err.message,
        },
      });
    }

    const endpointUrl = `https://aiplatform.googleapis.com/v1/projects/${auth.project}/locations/global/publishers/google/models/${MODEL_ID}:generateContent`;

    const payload = {
      contents: [{ role: 'user', parts }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature,
        thinkingConfig: {
          thinkingLevel: thinkingLevel || 'MEDIUM',
        },
      },
    };

    if (systemInstruction) {
      payload.systemInstruction = {
        parts: [{ text: systemInstruction }],
      };
    }

    const bodyBuffer = Buffer.from(JSON.stringify(payload), 'utf8');
    const urlObj = new URL(endpointUrl);

    const req = https.request(
      {
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${auth.token}`,
          'Content-Type': 'application/json',
          'Content-Length': bodyBuffer.length,
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (d) => chunks.push(d));
        res.on('end', () => {
          const latencyMs = Date.now() - startTime;
          const rawText = Buffer.concat(chunks).toString('utf8');
          let parsed;
          try {
            parsed = JSON.parse(rawText);
          } catch (_) {
            return reject({
              status: res.statusCode || 502,
              latencyMs,
              endpointUrl,
              exactApiError: {
                message: 'Non-JSON response from Vertex AI endpoint',
                rawResponse: rawText.slice(0, 1500),
              },
            });
          }

          if (res.statusCode < 200 || res.statusCode >= 300 || parsed.error) {
            if (res.statusCode === 401) cachedToken = null;
            return reject({
              status: res.statusCode || 500,
              latencyMs,
              endpointUrl,
              exactApiError: parsed.error || parsed,
            });
          }

          const candidate = parsed.candidates && parsed.candidates[0];
          const textPart =
            candidate &&
            candidate.content &&
            candidate.content.parts &&
            candidate.content.parts.find((p) => typeof p.text === 'string');

          if (!textPart) {
            return reject({
              status: 500,
              latencyMs,
              endpointUrl,
              exactApiError: {
                message: 'No text part returned by gemini-4-argon',
                rawResponse: parsed,
              },
            });
          }

          let jsonResult;
          try {
            const cleaned = textPart.text
              .replace(/^```json\s*/i, '')
              .replace(/^```\s*/i, '')
              .replace(/\s*```$/, '')
              .trim();
            jsonResult = JSON.parse(cleaned);
          } catch (parseErr) {
            return reject({
              status: 500,
              latencyMs,
              endpointUrl,
              exactApiError: {
                message: `Failed to parse JSON output from ${MODEL_ID}: ${parseErr.message}`,
                modelOutputPreview: textPart.text.slice(0, 1500),
              },
            });
          }

          resolve({
            data: jsonResult,
            latencyMs,
            usage: normalizeUsage(parsed.usageMetadata),
            modelVersion: parsed.modelVersion || MODEL_ID,
          });
        });
      }
    );

    req.on('error', (err) => {
      reject({
        status: 502,
        latencyMs: Date.now() - startTime,
        endpointUrl,
        exactApiError: { message: err.message },
      });
    });

    req.write(bodyBuffer);
    req.end();
  });
}

const MVP3_SYSTEM_INSTRUCTION = `
You are Gemini 4 Argon (gemini-4-argon), operating under Google's Official 6-Workflow 3D Guide for MVP3: Autonomous 3D World Generation, Adversarial 4-View Critique, Closed-Loop Code Rewrite, and Multi-Decade Causal Simulation.

CRITICAL PRINCIPLES:
1. UNRESTRICTED SCENE-SPECIFIC 3D AUTHORING: Write real, scene-specific Blender Python (\`bpy\`) code tailored to the exact input photograph and its MoGe-2 metric 3D point cloud. Never rely on living-room templates when looking at a courtyard, street, or architectural scene.
2. DISTINGUISH OBSERVED VS INFERRED GEOMETRY: Clearly label which elements are observed directly in the MoGe-2 metric point cloud ("observed_moge2") vs inferred/extruded 3D architectural volumes ("inferred_3d_extrusion").
3. EXACT THREE.JS METRIC COORDINATES: All helper functions in \`blender_toolchain.py\` accept metric Three.js camera coordinates (X right in meters, Y up in meters, -Z forward in meters; camera is at [0, 0, 0]).
4. GENUINE ADVERSARIAL CRITIQUE & CLOSED-LOOP REWRITE: When acting as the Adversarial Critic, inspect all 4 rendered screenshots (Original Camera [0,0,0], 3/4 Overview, Low Ground Angle, and 3D Wireframe) plus 3D bounding-box/ground-elevation telemetry to identify real geometric, alignment, scale, or ground-contact deficiencies. When rewriting code in Round 2, write complete, improved \`bpyCode\` that resolves every identified deficiency.
`;

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function computeLineDiffSummary(codeA = '', codeB = '') {
  const linesA = codeA.trim().split('\n');
  const linesB = codeB.trim().split('\n');
  const setA = new Set(linesA.map((l) => l.trim()).filter(Boolean));
  const setB = new Set(linesB.map((l) => l.trim()).filter(Boolean));
  let added = 0;
  let removed = 0;
  setB.forEach((l) => {
    if (!setA.has(l)) added++;
  });
  setA.forEach((l) => {
    if (!setB.has(l)) removed++;
  });
  return {
    round1Lines: linesA.length,
    round2Lines: linesB.length,
    addedLines: added,
    removedLines: removed,
  };
}

function saveProgressMilestone(entry) {
  let list = [];
  if (fs.existsSync(PROGRESS_JSON)) {
    try {
      list = JSON.parse(fs.readFileSync(PROGRESS_JSON, 'utf8'));
    } catch (_) {
      list = [];
    }
  }
  const idx = list.findIndex((m) => m.id === entry.id);
  const record = {
    timestamp: new Date().toISOString(),
    ...entry,
  };
  if (idx >= 0) {
    list[idx] = record;
  } else {
    list.push(record);
  }
  fs.writeFileSync(PROGRESS_JSON, JSON.stringify(list, null, 2));
  return list;
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
};

// ============================================================================
// MVP3 STEP 5: Multi-epoch causal simulation (shared by the JSON and streaming routes).
// `emit(event)` receives real pipeline progress: Argon reasoning, then one event per
// era as its Blender GLB is compiled. Prompt + cache key are unchanged from MVP3.
// ============================================================================
async function runMvp3CausalSimulation(body, emit = () => {}, { asyncBlender = false } = {}) {
  const origPhoto = (body.originalImageDataUrl || '').replace(/^data:[^;]+;base64,/, '');
  const verifiedBpyCode = body.verifiedBpyCode || '';
  const interventionText =
    body.interventionText ||
    'In 1206 (Medieval Monastic Era), construct an octagonal Gothic bronze-and-limestone monastic lavabo fountain canopy over the central wellhead with four carved stone water basins and timber cloister roof beams.';
  const metricSummary = body.metricSummary || {};
  const groundYThree = Number(metricSummary.groundYThree ?? -1.72);
  const thinkingLevel = body.thinkingLevel || 'MEDIUM';

  const cacheFile = getCacheKey('mvp3_causal_v1', {
    origHead: origPhoto.slice(0, 300),
    interventionText,
    thinkingLevel,
  });

  const compileCausalEras = async (causalData) => {
    let totalBlenderMs = 0;
    const eras = [];
    const sourceEras = causalData.eras || [];
    emit({ phase: 'plan', eras: sourceEras.map((e) => ({ year: e.year, eraTitle: e.eraTitle, provenance: e.provenance })) });
    for (const era of sourceEras) {
      const code = era.eraBpyCode || verifiedBpyCode;
      let bOut = { glbUrl: null, pythonScript: '', telemetry: {}, blenderLatencyMs: 0 };
      emit({ phase: 'era_compile_start', year: era.year });
      try {
        const spec = { stage: `mvp3_era_${era.year}`, bpyCode: code, groundYThree };
        bOut = asyncBlender
          ? await runBlenderMvp3ToolchainAsync(spec, `mvp3_era_${era.year}`)
          : runBlenderMvp3Toolchain(spec, `mvp3_era_${era.year}`);
        totalBlenderMs += bOut.blenderLatencyMs || 0;
      } catch (e) {
        console.error(`[MVP3 Era ${era.year} Blender Error]`, e.message);
      }
      emit({
        phase: 'era_compiled',
        year: era.year,
        ok: Boolean(bOut.glbUrl),
        glbUrl: bOut.glbUrl,
        cached: Boolean(bOut.cached),
        objectCount: bOut.telemetry?.objectCount || 0,
        blenderLatencyMs: bOut.blenderLatencyMs || 0,
      });
      eras.push({
        ...era,
        blenderGlbUrl: bOut.glbUrl,
        blenderPythonScript: bOut.pythonScript,
        blenderTelemetry: bOut.telemetry,
        blenderLatencyMs: bOut.blenderLatencyMs,
      });
    }
    return {
      ...causalData,
      eras,
      totalBlenderLatencyMs: totalBlenderMs,
    };
  };

  const hit = readCache(cacheFile);
  if (hit && !body.forceUncached) {
    emit({ phase: 'argon_cached', latencyMs: hit.latencyMs });
    const compiled = await compileCausalEras(hit.data);
    return {
      ok: true,
      cached: true,
      latencyMs: hit.latencyMs,
      usage: hit.usage,
      causalSimulation: compiled,
    };
  }

  const causalPrompt = `
You are executing **Step 5 of MVP3: Multi-Epoch Causal Counterfactual World Simulation** on top of our verified Round 2 3D architectural scene.

Verified Present-Day Baseline Blender Python (\`verifiedBpyCode\`, with ground plane \`Y_ground = ${groundYThree}\`):
\`\`\`python
${verifiedBpyCode}
\`\`\`

User's Historical Intervention:
"${interventionText}"

Propagate this historical intervention forward across **4 distinct historical & counterfactual epochs** culminating in **Alternate 2026**:
1. **Epoch 1 (Origin Intervention Era, e.g. 1206 or 1926)**: The immediate construction of the historical intervention in the scene.
2. **Epoch 2 (Intermediate Historical State 1, e.g. 1566 or 1956)**: How the intervention aged, weathered, and influenced adjacent structures centuries/decades later.
3. **Epoch 3 (Intermediate Historical State 2, e.g. 1938 or 1986)**: Museum / architectural preservation, structural reinforcement, and lighting adaptation.
4. **Epoch 4 (Alternate Present 2026)**: The resulting counterfactual 2026 scene viewed from the exact original camera [0,0,0], preserving \`unaffectedStructures\` while exhibiting the surviving counterfactual 3D monument/structures.

For EACH of the 4 epochs, write a complete, self-contained \`eraBpyCode\` script that keeps the verified surrounding architectural colonnades/arcades anchored at their exact MoGe-2 3D coordinates while procedurally modeling the evolving counterfactual 3D structures for that epoch!

Return ONLY valid JSON matching this schema:
{
  "intervention": ${JSON.stringify(interventionText)},
  "directlyAffectedObjects": ["central_carved_wellhead", "terracotta_fern_cluster", "skylight_coffered_grid"],
  "unaffectedStructures": ["north_romanesque_arcade", "west_colonnade_arcade", "east_colonnade_arcade", "courtyard_pebble_floor"],
  "causalChainSummary": "2-sentence overview of how the past intervention reshaped the space across centuries/decades into Alternate 2026",
  "eras": [
    {
      "year": 1206,
      "eraTitle": "1206 Medieval Monastic Intervention",
      "provenance": "speculative_counterfactual",
      "narrative": "2-sentence causal description of this epoch",
      "causalTransitions": ["Key structural change #1", "Key material/spatial effect #2"],
      "grading": { "sepiaStrength": 0.34, "warmth": 0.18 },
      "eraBpyCode": "# Complete executable Blender Python code for this era"
    },
    {
      "year": 1566,
      "eraTitle": "1566 Renaissance Cloister Adaptation",
      "provenance": "speculative_counterfactual",
      "narrative": "2-sentence causal description of this intermediate epoch",
      "causalTransitions": ["Transition #1", "Transition #2"],
      "grading": { "sepiaStrength": 0.22, "warmth": 0.14 },
      "eraBpyCode": "# Complete executable Blender Python code for this era"
    },
    {
      "year": 1938,
      "eraTitle": "1938 Architectural Preservation & Reconstruction",
      "provenance": "speculative_counterfactual",
      "narrative": "2-sentence causal description of this intermediate epoch",
      "causalTransitions": ["Transition #1", "Transition #2"],
      "grading": { "sepiaStrength": 0.10, "warmth": 0.08 },
      "eraBpyCode": "# Complete executable Blender Python code for this era"
    },
    {
      "year": 2026,
      "eraTitle": "Alternate 2026 Present Counterfactual",
      "provenance": "speculative_counterfactual",
      "narrative": "2-sentence description of the Alternate 2026 state returned to camera [0,0,0]",
      "causalTransitions": ["1938 -> 2026 preservation outcome #1", "Outcome #2"],
      "grading": { "sepiaStrength": 0.0, "warmth": 0.04 },
      "eraBpyCode": "# Complete executable Blender Python code for Alternate 2026"
    }
  ]
}
`;

  emit({ phase: 'argon_start', thinkingLevel });
  const t0 = Date.now();
  const heartbeat = setInterval(() => emit({ phase: 'argon_thinking', elapsedMs: Date.now() - t0 }), 1000);
  let result;
  try {
    result = await callGemini4Argon({
      systemInstruction: MVP3_SYSTEM_INSTRUCTION,
      thinkingLevel,
      temperature: 0.25,
      parts: [
        { text: 'ORIGINAL PHOTOGRAPH:' },
        { inlineData: { mimeType: 'image/jpeg', data: origPhoto } },
        { text: causalPrompt },
      ],
    });
  } finally {
    clearInterval(heartbeat);
  }
  emit({ phase: 'argon_done', latencyMs: result.latencyMs, usage: result.usage });

  writeCache(cacheFile, result);
  const compiled = await compileCausalEras(result.data);

  return {
    ok: true,
    cached: false,
    latencyMs: result.latencyMs,
    usage: result.usage,
    causalSimulation: compiled,
  };
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;

  if (req.method === 'GET' && pathname === '/api/status') {
    try {
      const auth = getGcloudAuth();
      return sendJson(res, 200, {
        ok: true,
        milestone: 'MVP3: Autonomous 3D World Authoring, 4-View Adversarial Critic & Closed-Loop Code Rewrite',
        model: MODEL_ID,
        project: auth.project,
        geometryBackend: 'MoGe-2 (microsoft/MoGe via api.ai3d.dev/v2)',
        authoringBackend: 'Unrestricted Scene-Specific Headless Blender 4.1 (bpy -> GLB) + Nano Banana PBR',
        endpoint: `https://aiplatform.googleapis.com/v1/projects/${auth.project}/locations/global/publishers/google/models/${MODEL_ID}:generateContent`,
      });
    } catch (err) {
      return sendJson(res, 500, {
        ok: false,
        model: MODEL_ID,
        exactApiError: { message: err.message },
      });
    }
  }

  // Progress Gallery API (Workflow #4 & Requirement 7)
  if (req.method === 'GET' && pathname === '/api/progress') {
    let list = [];
    if (fs.existsSync(PROGRESS_JSON)) {
      try {
        list = JSON.parse(fs.readFileSync(PROGRESS_JSON, 'utf8'));
      } catch (_) {}
    }
    return sendJson(res, 200, { ok: true, milestones: list });
  }

  if (req.method === 'POST' && pathname === '/api/progress/save') {
    try {
      const body = await readJsonBody(req);
      const list = saveProgressMilestone(body);
      return sendJson(res, 200, { ok: true, count: list.length });
    } catch (err) {
      return sendJson(res, 500, { ok: false, message: err.message });
    }
  }

  // Step 1: MoGe-2 3D Geometry Reconstruction
  if (req.method === 'POST' && pathname === '/api/depth') {
    try {
      const body = await readJsonBody(req);
      const imageBase64 = body.imageDataUrl || body.imageBase64;
      const gridWidth = body.gridWidth || 192;
      const gridHeight = body.gridHeight || 168;
      if (!imageBase64) {
        return sendJson(res, 400, { ok: false, message: 'Missing imageDataUrl' });
      }

      const dRes = await callDepthService({ imageBase64, gridWidth, gridHeight });
      const ci = dRes.cameraIntrinsics || {};
      const minZ = dRes.depthMinMeters || 1.44;
      const maxZ = dRes.depthMaxMeters || 16.66;
      const meanZ = Number(((minZ + maxZ) * 0.4).toFixed(3));

      return sendJson(res, 200, {
        ok: true,
        cached: dRes.cached,
        sha256: dRes.sha256,
        latencyMs: dRes.processingLatencyMs || 0,
        backend: dRes.model || 'MoGe-2 (api.ai3d.dev/v2)',
        gridWidth: dRes.gridWidth,
        gridHeight: dRes.gridHeight,
        pointsGrid: dRes.pointsGrid,
        depthGrid: dRes.metricDepthGrid,
        confidenceGrid: dRes.confidenceGrid,
        depthVisualizationDataUrl: dRes.depthColorMapBase64,
        confidenceVisualizationDataUrl: dRes.confidenceMaskBase64,
        normalVisualizationDataUrl: dRes.normalMapBase64,
        meshGlbUrl: dRes.meshGlbPath,
        intrinsics: {
          fovYDeg: ci.fovYDeg || 60.0,
          fxNorm: Number(((ci.fx || 342.9) / (dRes.imageWidth || 600)).toFixed(4)),
          fyNorm: Number(((ci.fy || 342.9) / (dRes.imageHeight || 800)).toFixed(4)),
          cxNorm: Number(((ci.cx || 300) / (dRes.imageWidth || 600)).toFixed(4)),
          cyNorm: Number(((ci.cy || 400) / (dRes.imageHeight || 800)).toFixed(4)),
          minDepthMeters: minZ,
          maxDepthMeters: maxZ,
          meanDepthMeters: meanZ,
        },
      });
    } catch (err) {
      return sendJson(res, 500, {
        ok: false,
        phase: 'moge2_geometry',
        message: err.message || String(err),
      });
    }
  }

  // ==========================================================================
  // MVP3 STEP 2 (ROUND 1): UNRESTRICTED SCENE-SPECIFIC 3D WORLD AUTHORING
  // Generates Spatial WorldState + Observed vs Inferred Floorplan + Real Blender `bpyCode`
  // ==========================================================================
  if (req.method === 'POST' && pathname === '/api/argon/mvp3-author') {
    try {
      const body = await readJsonBody(req);
      const imgInput = body.imageDataUrl || '';
      const gridInput = body.gridOverlayDataUrl || '';
      const thinkingLevel = body.thinkingLevel || 'MEDIUM';
      const cleanPhoto = imgInput.replace(/^data:[^;]+;base64,/, '');
      const cleanGrid = gridInput.replace(/^data:[^;]+;base64,/, '');
      const metricSummary = body.metricSummary || {};
      const groundYThree = Number(metricSummary.groundYThree ?? -1.72);

      const cacheFile = getCacheKey('mvp3_author_v1', {
        imgHead: cleanPhoto.slice(0, 500),
        len: cleanPhoto.length,
        thinkingLevel,
      });

      const compileRound1 = (authorData) => {
        const bpyCode = authorData.bpyCode || '';
        const bOut = runBlenderMvp3Toolchain(
          {
            stage: 'mvp3_round1_initial',
            bpyCode,
            groundYThree,
          },
          'mvp3_r1'
        );
        return {
          ...authorData,
          groundYThree,
          blenderGlbUrl: bOut.glbUrl,
          blenderPythonScript: bOut.pythonScript,
          blenderTelemetry: bOut.telemetry,
          blenderLatencyMs: bOut.blenderLatencyMs,
        };
      };

      const hit = readCache(cacheFile);
      if (hit && !body.forceUncached) {
        const compiled = compileRound1(hit.data);
        return sendJson(res, 200, {
          ok: true,
          cached: true,
          latencyMs: hit.latencyMs,
          usage: hit.usage,
          round1: compiled,
        });
      }

      const prompt = `
Analyze the uploaded photograph (and annotated X/Y metric grid if provided) along with the MoGe-2 metric 3D point-cloud summary below:
${JSON.stringify(metricSummary, null, 2)}

You are executing **Round 1 of MVP3: Unrestricted Scene-Specific 3D World Authoring**.
DO NOT use any living-room templates. Write genuine, scene-specific Blender Python (\`bpyCode\`) for THIS exact architectural/street photograph.

AVAILABLE HELPER FUNCTIONS IN \`blender_toolchain.py\` (already imported in global scope):
- \`make_pbr_material(name, hex_color="#c8bca6", roughness=0.55, metallic=0.05, emission_hex=None, emission_strength=0.0, texture_path=None, uv_scale=1.0, alpha=1.0)\`
  - Available seamless Nano Banana PBR texture paths in \`TEXTURES\`:
    - \`TEXTURES.get("limestone")\` (Romanesque limestone ashlar masonry blocks)
    - \`TEXTURES.get("pebble")\` (Courtyard aggregate pebble paving)
    - \`TEXTURES.get("walnut")\` (Dark carved timber / wood grain)
- \`create_box_at_three(name, tx, ty, tz, sx, sy, sz, mat=None, bevel_width=0.006, rot_three=(0,0,0))\`
  - Creates a beveled 3D box centered at Three.js metric coordinates \`(tx, ty, tz)\` with dimensions \`(sx=width_X, sy=height_Y, sz=depth_Z)\`.
- \`create_cylinder_at_three(name, tx, ty, tz, radius_top, radius_bottom, height_y, mat=None, vertices=24, bevel_width=0.003, rot_three=(0,0,0))\`
  - Creates a vertical cylinder/column/planter/wellhead centered at Three.js \`(tx, ty, tz)\` with vertical height \`height_y\`.
  - NOTE: Since \`ty\` is the vertical CENTER of the cylinder/box, an object of height \`H\` resting on the ground plane \`Y_ground = ${groundYThree}\` needs center \`ty = Y_ground + H * 0.5\`.
- \`create_arch_at_three(name, tx, ty, tz, span_width, arch_thickness, depth_z, mat=None, segments=20, rot_y_deg=0.0)\`
  - Creates a 3D semicircular Romanesque stone arch ring centered at springing line \`(tx, ty, tz)\`. Use \`rot_y_deg=0\` for North/South walls (spanning X) and \`rot_y_deg=90\` for West/East colonnades (spanning Z).
- Full \`bpy\`, \`bmesh\`, \`math\`, \`Vector\`, \`three_to_blender(x, y, z)\` are also available in global scope.

Return ONLY valid JSON matching this schema:
{
  "sceneTitle": "Descriptive architectural title of the scene",
  "architecturalStyle": "Specific architectural period and style",
  "spatialSummary": "2-sentence summary of the 3D layout, camera FOV, and metric scale",
  "horizonAndCamera": {
    "horizonNormalizedY": 0.50,
    "cameraHeightAboveGroundMeters": ${Math.abs(groundYThree).toFixed(2)},
    "fovYDeg": ${metricSummary.fovYDeg || 98.8}
  },
  "objects": [
    {
      "id": "snake_case_id",
      "label": "Human readable name",
      "category": "arcade|colonnade|skylight|wellhead|foliage|wall|floor|architecture",
      "geometrySource": "observed_moge2 | inferred_3d_extrusion",
      "box2d": [ymin_0_to_1, xmin_0_to_1, ymax_0_to_1, xmax_0_to_1],
      "position3D": [x_meters, y_meters, z_meters],
      "size3D": [width_x, height_y, depth_z],
      "semanticDescription": "Detailed description of material and 3D structure"
    }
  ],
  "bpyCode": "# Complete executable Python code using make_pbr_material, create_box_at_three, create_cylinder_at_three, create_arch_at_three to construct at least 18-30 distinct 3D architectural elements (e.g., North arcade columns & semicircular arches, West & East colonnade columns & arches, cornice stringcourses, clerestory walls, 3x3 coffered skylight roof beams, central carved stone wellhead basin, and ring of terracotta planter pots).",
  "threeJsConfig": {
    "ambientIntensity": 0.78,
    "sunIntensity": 1.15,
    "sunPosition": [2.5, 8.5, -3.0],
    "skyLightColor": "#e0f2fe",
    "fogDensity": 0.012
  },
  "suggestedInterventions": [
    "In 1206 (Medieval Monastic Era), restore the central carved stone wellhead into a tiered Gothic bronze-and-limestone monastic cloister fountain with an octagonal water basin and timber cloister roof beams.",
    "In 1566 (Renaissance Adaptation), install an ornate carved marble balustrade and bronze astrolabe sundial monument in the central courtyard.",
    "In 1906 (Beaux-Arts Conservatory Era), erect a wrought-iron and stained-glass botanical conservatory dome over the central cloister garden."
  ]
}
Make sure \`bpyCode\` is syntactic, self-contained Python code (no markdown backticks inside the JSON string) that builds a rich, recognizable, multi-part 3D architectural scene.
`;

      const parts = [
        { text: 'UPLOADED ARCHITECTURAL PHOTOGRAPH:' },
        { inlineData: { mimeType: 'image/jpeg', data: cleanPhoto } },
      ];
      if (cleanGrid) {
        parts.push({ text: 'ANNOTATED NUMBERED X/Y METRIC GRID & HORIZON OVERLAY:' });
        parts.push({ inlineData: { mimeType: 'image/png', data: cleanGrid } });
      }
      parts.push({ text: prompt });

      const result = await callGemini4Argon({
        systemInstruction: MVP3_SYSTEM_INSTRUCTION,
        thinkingLevel,
        temperature: 0.25,
        parts,
      });

      writeCache(cacheFile, result);
      const compiled = compileRound1(result.data);

      return sendJson(res, 200, {
        ok: true,
        cached: false,
        latencyMs: result.latencyMs,
        usage: result.usage,
        round1: compiled,
      });
    } catch (err) {
      return sendJson(res, err.status || 500, {
        ok: false,
        phase: 'mvp3_author',
        exactApiError: err.exactApiError || { message: err.message || String(err) },
      });
    }
  }

  // ==========================================================================
  // MVP3 STEP 3: INDEPENDENT 4-VIEW ADVERSARIAL CRITIC
  // Inspects 4 actual rendered screenshots (Original Cam, 3/4 Overview, Low Angle, Wireframe)
  // + Original Photo + 3D Telemetry. NO scripted bugs or predetermined repair hints!
  // ==========================================================================
  if (req.method === 'POST' && pathname === '/api/argon/mvp3-critic') {
    try {
      const body = await readJsonBody(req);
      const origPhoto = (body.originalImageDataUrl || '').replace(/^data:[^;]+;base64,/, '');
      const targetRender = (body.targetRenderDataUrl || '').replace(/^data:[^;]+;base64,/, '');
      const views = body.fourViews || {};
      const vOrig = (views.originalCam || '').replace(/^data:[^;]+;base64,/, '');
      const v34 = (views.threeQuarter || '').replace(/^data:[^;]+;base64,/, '');
      const vLow = (views.lowAngle || '').replace(/^data:[^;]+;base64,/, '');
      const vWire = (views.wireframe || '').replace(/^data:[^;]+;base64,/, '');
      const roundNum = body.roundNumber || 1;
      const bpyCode = body.bpyCode || '';
      const telemetry = body.blenderTelemetry || {};
      const thinkingLevel = body.thinkingLevel || 'MEDIUM';

      const cacheFile = getCacheKey(`mvp3_critic_r${roundNum}`, {
        origHead: origPhoto.slice(0, 300),
        codeHash: crypto.createHash('sha256').update(bpyCode).digest('hex').slice(0, 16),
        roundNum,
        thinkingLevel,
      });

      const hit = readCache(cacheFile);
      if (hit && !body.forceUncached) {
        return sendJson(res, 200, {
          ok: true,
          cached: true,
          latencyMs: hit.latencyMs,
          usage: hit.usage,
          critique: hit.data,
        });
      }

      const criticPrompt = `
You are an independent **Adversarial Art Director & 3D Geometry Critic** evaluating **Round ${roundNum}** of an autonomous 3D architectural reconstruction.
You are given:
1. REFERENCE PHOTOGRAPH (and optional Nano Banana Photorealistic Target Render)
2. SCREENSHOT 1 — ORIGINAL CAMERA [0,0,0] RENDER (checks 1:1 perspective & alignment against the photograph)
3. SCREENSHOT 2 — 3/4 OVERVIEW RENDER (checks overall 3D spatial composition, arcade bays, skylight roof, and depth)
4. SCREENSHOT 3 — LOW GROUND-ANGLE RENDER (checks whether columns, arches, wellhead, and planters sit flush on the courtyard ground plane at Y = ${telemetry.groundYThreeMeters ?? -1.72}m without floating or sinking)
5. SCREENSHOT 4 — 3D WIREFRAME VIEW (checks clean 3D mesh topology, arch curvature, and object collisions)

Current Round ${roundNum} Blender Python (\`bpyCode\`):
\`\`\`python
${bpyCode}
\`\`\`

Measured Blender 3D Telemetry (Three.js metric bounding boxes & ground-contact elevation deltas):
${JSON.stringify(telemetry, null, 2)}

Perform a rigorous, unsparing critique of Round ${roundNum}:
- Inspect all 4 screenshots and the measured 3D bounding-box telemetry.
- Identify **at least 3 specific, genuine geometric, spatial, ground-contact, structural completeness, or material deficiencies** in the current 3D scene.
- Provide concrete, actionable instructions for how the Blender Python (\`bpyCode\`) and Three.js scene must be rewritten to fix each deficiency.

Return ONLY valid JSON matching this schema:
{
  "roundNumber": ${roundNum},
  "overallRatingOutOf10": 7.2,
  "passedThreshold": false,
  "executiveSummary": "2-sentence rigorous assessment of Round ${roundNum} across all 4 diagnostic views",
  "dimensionScoresOutOf10": {
    "cameraAlignment": 7.8,
    "architecturalProportions": 7.0,
    "groundContactAndCollisions": 6.5,
    "structuralCompleteness": 7.2,
    "materialAndLightingFidelity": 7.5
  },
  "deficiencies": [
    {
      "id": "def_1",
      "category": "ground_contact | architectural_proportions | missing_detail | camera_alignment | collision | material_uv",
      "severity": "high | medium | low",
      "observedInViews": ["lowAngle", "threeQuarter", "originalCam", "wireframe"],
      "targetObjects": ["object_or_mesh_names"],
      "diagnosis": "Specific visual and metric diagnosis citing coordinates/elevation deltas or missing architectural sub-elements visible in the 4 views",
      "requiredCodeFix": "Exact geometric/mathematical change required in the rewritten bpyCode"
    }
  ]
}
Include at least 3 detailed items in \`deficiencies\`.
`;

      const parts = [
        { text: 'REFERENCE PHOTOGRAPH:' },
        { inlineData: { mimeType: 'image/jpeg', data: origPhoto } },
      ];
      if (targetRender) {
        parts.push({ text: 'NANO BANANA PHOTOREALISTIC TARGET RENDER:' });
        parts.push({ inlineData: { mimeType: 'image/jpeg', data: targetRender } });
      }
      if (vOrig) {
        parts.push({ text: 'SCREENSHOT 1 — ORIGINAL CAMERA [0,0,0] 3D RENDER:' });
        parts.push({ inlineData: { mimeType: 'image/png', data: vOrig } });
      }
      if (v34) {
        parts.push({ text: 'SCREENSHOT 2 — 3/4 OVERVIEW 3D RENDER:' });
        parts.push({ inlineData: { mimeType: 'image/png', data: v34 } });
      }
      if (vLow) {
        parts.push({ text: 'SCREENSHOT 3 — LOW GROUND-ANGLE 3D RENDER:' });
        parts.push({ inlineData: { mimeType: 'image/png', data: vLow } });
      }
      if (vWire) {
        parts.push({ text: 'SCREENSHOT 4 — 3D WIREFRAME GEOMETRY VIEW:' });
        parts.push({ inlineData: { mimeType: 'image/png', data: vWire } });
      }
      parts.push({ text: criticPrompt });

      const result = await callGemini4Argon({
        systemInstruction: MVP3_SYSTEM_INSTRUCTION,
        thinkingLevel,
        temperature: 0.2,
        parts,
      });

      writeCache(cacheFile, result);
      return sendJson(res, 200, {
        ok: true,
        cached: false,
        latencyMs: result.latencyMs,
        usage: result.usage,
        critique: result.data,
      });
    } catch (err) {
      return sendJson(res, err.status || 500, {
        ok: false,
        phase: 'mvp3_critic',
        exactApiError: err.exactApiError || { message: err.message || String(err) },
      });
    }
  }

  // ==========================================================================
  // MVP3 STEP 4 (ROUND 2): CLOSED-LOOP AUTONOMOUS CODE REWRITE
  // Rewrites the actual `bpyCode` & Three.js parameters to fix all Critic deficiencies,
  // compiles the new .glb, and computes code diffs & telemetry improvements!
  // ==========================================================================
  if (req.method === 'POST' && pathname === '/api/argon/mvp3-rewrite') {
    try {
      const body = await readJsonBody(req);
      const origPhoto = (body.originalImageDataUrl || '').replace(/^data:[^;]+;base64,/, '');
      const targetRender = (body.targetRenderDataUrl || '').replace(/^data:[^;]+;base64,/, '');
      const views = body.fourViews || {};
      const vOrig = (views.originalCam || '').replace(/^data:[^;]+;base64,/, '');
      const vLow = (views.lowAngle || '').replace(/^data:[^;]+;base64,/, '');
      const round1Code = body.round1BpyCode || '';
      const round1Telemetry = body.round1Telemetry || {};
      const critique = body.critique || {};
      const metricSummary = body.metricSummary || {};
      const groundYThree = Number(metricSummary.groundYThree ?? round1Telemetry.groundYThreeMeters ?? -1.72);
      const thinkingLevel = body.thinkingLevel || 'MEDIUM';

      const cacheFile = getCacheKey('mvp3_rewrite_v1', {
        origHead: origPhoto.slice(0, 300),
        r1Hash: crypto.createHash('sha256').update(round1Code).digest('hex').slice(0, 16),
        critHash: crypto.createHash('sha256').update(JSON.stringify(critique.deficiencies || [])).digest('hex').slice(0, 16),
        thinkingLevel,
      });

      const compileRewrite = (rewriteData) => {
        const newBpyCode = rewriteData.rewrittenBpyCode || '';
        const bOut = runBlenderMvp3Toolchain(
          {
            stage: 'mvp3_round2_rewritten',
            bpyCode: newBpyCode,
            groundYThree,
          },
          'mvp3_r2'
        );
        const diffStats = computeLineDiffSummary(round1Code, newBpyCode);
        return {
          ...rewriteData,
          diffStats,
          blenderGlbUrl: bOut.glbUrl,
          blenderPythonScript: bOut.pythonScript,
          blenderTelemetry: bOut.telemetry,
          blenderLatencyMs: bOut.blenderLatencyMs,
        };
      };

      const hit = readCache(cacheFile);
      if (hit && !body.forceUncached) {
        const compiled = compileRewrite(hit.data);
        return sendJson(res, 200, {
          ok: true,
          cached: true,
          latencyMs: hit.latencyMs,
          usage: hit.usage,
          round2: compiled,
        });
      }

      const rewritePrompt = `
You are executing **Step 4 of MVP3: Closed-Loop Autonomous 3D Code Rewrite (Round 2)**.
The independent Adversarial Critic inspected your Round 1 3D scene across 4 camera views and identified the following genuine deficiencies:
${JSON.stringify(critique, null, 2)}

Round 1 Blender Python (\`bpyCode\`):
\`\`\`python
${round1Code}
\`\`\`

Round 1 Measured 3D Telemetry (groundYThreeMeters = ${groundYThree}):
${JSON.stringify(round1Telemetry, null, 2)}

REWRITE THE COMPLETE BLENDER PYTHON (\`rewrittenBpyCode\`) to resolve EVERY deficiency identified by the Adversarial Critic:
1. Fix all ground-contact elevation gaps so column plinths, parapet walls, the central carved wellhead base, and terracotta planters sit flush on the MoGe-2 ground plane (\`Y_ground = ${groundYThree}\`, meaning an object of height \`H\` has center \`ty = ${groundYThree} + H * 0.5\`).
2. Upgrade architectural detail and structural completeness: include paired/double columns with carved Romanesque cushion capitals and square abaci, stepped archivolts on the semicircular arches, continuous molded stone stringcourse cornices, upper clerestory slit window recesses, full 3x3 coffered skylight roof beams, and multi-tiered carved detail on the central wellhead and surrounding potted fern planters.
3. Bind seamless Nano Banana PBR textures (\`TEXTURES.get("limestone")\`, \`TEXTURES.get("pebble")\`, \`TEXTURES.get("walnut")\`) with appropriate \`uv_scale\` and realistic roughness/metallic values.

Return ONLY valid JSON matching this schema:
{
  "rewriteSummary": "2-sentence summary of how the rewritten Round 2 bpyCode resolves the Adversarial Critic's findings",
  "fixesApplied": [
    {
      "deficiencyId": "def_1",
      "codeChangeDescription": "Specific mathematical & geometric change made in rewrittenBpyCode",
      "measuredImpactExpected": "Expected improvement in ground contact, alignment, or architectural detail"
    }
  ],
  "rewrittenBpyCode": "# Complete, self-contained executable Python code for Round 2 (no markdown fences inside string)",
  "updatedThreeJsConfig": {
    "ambientIntensity": 0.82,
    "sunIntensity": 1.25,
    "sunPosition": [2.2, 8.8, -3.5],
    "skyLightColor": "#e0f2fe",
    "fogDensity": 0.010
  }
}
`;

      const parts = [
        { text: 'REFERENCE PHOTOGRAPH:' },
        { inlineData: { mimeType: 'image/jpeg', data: origPhoto } },
      ];
      if (targetRender) {
        parts.push({ text: 'NANO BANANA PHOTOREALISTIC TARGET RENDER:' });
        parts.push({ inlineData: { mimeType: 'image/jpeg', data: targetRender } });
      }
      if (vOrig) {
        parts.push({ text: 'ROUND 1 ORIGINAL CAMERA [0,0,0] RENDER:' });
        parts.push({ inlineData: { mimeType: 'image/png', data: vOrig } });
      }
      if (vLow) {
        parts.push({ text: 'ROUND 1 LOW GROUND-ANGLE RENDER:' });
        parts.push({ inlineData: { mimeType: 'image/png', data: vLow } });
      }
      parts.push({ text: rewritePrompt });

      const result = await callGemini4Argon({
        systemInstruction: MVP3_SYSTEM_INSTRUCTION,
        thinkingLevel,
        temperature: 0.2,
        parts,
      });

      writeCache(cacheFile, result);
      const compiled = compileRewrite(result.data);

      return sendJson(res, 200, {
        ok: true,
        cached: false,
        latencyMs: result.latencyMs,
        usage: result.usage,
        round2: compiled,
      });
    } catch (err) {
      return sendJson(res, err.status || 500, {
        ok: false,
        phase: 'mvp3_rewrite',
        exactApiError: err.exactApiError || { message: err.message || String(err) },
      });
    }
  }

  // ==========================================================================
  // MVP3 STEP 5: MULTI-DECADE CAUSAL SIMULATION WITH SCENE-SPECIFIC BPY CODE
  // Only after autonomous 3D authoring & verification succeeds, propagate a historical
  // intervention across multiple epochs with real scene-specific Blender `bpyCode`!
  // ==========================================================================
  if (req.method === 'POST' && pathname === '/api/argon/mvp3-causal') {
    try {
      const body = await readJsonBody(req);
      const payload = await runMvp3CausalSimulation(body);
      return sendJson(res, 200, payload);
    } catch (err) {
      return sendJson(res, err.status || 500, {
        ok: false,
        phase: 'mvp3_causal',
        exactApiError: err.exactApiError || { message: err.message || String(err) },
      });
    }
  }

  // Streaming variant (NDJSON): same simulation, but emits real progress events so the
  // timeline can show consequences propagating through each subsequent epoch.
  if (req.method === 'POST' && pathname === '/api/argon/mvp3-causal-stream') {
    let body;
    try {
      body = await readJsonBody(req);
    } catch (err) {
      return sendJson(res, 400, { ok: false, exactApiError: { message: err.message } });
    }
    res.writeHead(200, {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    });
    let closed = false;
    res.on('close', () => {
      closed = true;
    });
    const emit = (evt) => {
      if (!closed) res.write(JSON.stringify({ t: Date.now(), ...evt }) + '\n');
    };
    emit({ phase: 'accepted' });
    try {
      const payload = await runMvp3CausalSimulation(body, emit, { asyncBlender: true });
      emit({ phase: 'done', payload });
    } catch (err) {
      emit({
        phase: 'error',
        status: err.status || 500,
        exactApiError: err.exactApiError || { message: err.message || String(err) },
      });
    }
    return res.end();
  }

  // ==========================================================================
  // PRESERVED LEGACY ROUTES FOR MVP1 (/mvp1) AND MVP2 (/mvp2) BASELINES
  // ==========================================================================
  if (req.method === 'POST' && pathname === '/api/argon/worldstate') {
    try {
      const body = await readJsonBody(req);
      const imgInput = body.imageDataUrl || body.imageBase64 || '';
      const thinkingLevel = body.thinkingLevel || 'LOW';
      const cleanPhoto = imgInput.replace(/^data:[^;]+;base64,/, '');
      const cacheFile = getCacheKey('mvp1_ws', {
        imgHead: cleanPhoto.slice(0, 500),
        len: cleanPhoto.length,
        thinkingLevel,
      });
      const hit = readCache(cacheFile);
      if (hit) {
        return sendJson(res, 200, {
          ok: true,
          cached: true,
          latencyMs: hit.latencyMs,
          usage: hit.usage,
          worldState: hit.data,
        });
      }
      return sendJson(res, 404, { ok: false, message: 'Legacy cache miss' });
    } catch (err) {
      return sendJson(res, 500, { ok: false, message: err.message });
    }
  }

  // Static files (support /, /mvp3, /mvp2, /mvp1, /progress.html, and /.cache/)
  let safePath = pathname;
  if (safePath === '/' || safePath === '/mvp3' || safePath === '/mvp3/') {
    safePath = '/index.html';
  } else if (safePath === '/mvp2' || safePath === '/mvp2/') {
    safePath = '/mvp2.html';
  } else if (safePath === '/mvp1' || safePath === '/mvp1/') {
    safePath = '/mvp1.html';
  }
  const filePath = path.join(__dirname, path.normalize(safePath).replace(/^(\.\.[\/\\])+/, ''));

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    fs.createReadStream(filePath).pipe(res);
  } else {
    sendJson(res, 404, { error: `Not found: ${pathname}` });
  }
});

server.listen(PORT, () => {
  console.log(`TIME TRAVEL MVP3 Server running at http://localhost:${PORT} (baselines: /mvp1, /mvp2)`);
});
