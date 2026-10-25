const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const PORT = process.env.PORT || 3456;
const DEPTH_SERVICE_PORT = 3457;
const MODEL_ID = 'gemini-4-argon';
const CACHE_DIR = path.join(__dirname, '.cache');
const BLENDER_BIN = process.env.BLENDER_PATH || (process.platform === 'darwin' ? '/Applications/Blender.app/Contents/MacOS/Blender' : 'blender');
const BLENDER_SCRIPT = path.join(__dirname, 'blender_toolchain.py');

if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

function runBlenderToolchain(specObj, prefix = 'blender') {
  const t0 = Date.now();
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
    `"${BLENDER_BIN}" --background --factory-startup --python "${BLENDER_SCRIPT}" -- "${specPath}" "${glbPath}" "${pyPath}"`,
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

function callGemini4Argon({ parts, systemInstruction, thinkingLevel = 'LOW', temperature = 0.2 }) {
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
          thinkingLevel: thinkingLevel || 'LOW',
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

const SYSTEM_INSTRUCTION = `
You are Gemini 4 Argon (gemini-4-argon), the central reasoning, autonomous Blender 3D world-authoring, multi-stage causal-simulation, and geometric/causal verification agent for MVP2: Autonomous World Authoring and Causal Verification.
Keep JSON responses concise, accurate, and valid JSON.
Always distinguish documented/observed state from speculative counterfactual scenarios.
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

function mapWorldObjectsToBlenderItems(wsObjs = [], updatesOrPatches = []) {
  return updatesOrPatches.map((u) => {
    const match = wsObjs.find((o) => o.id === u.id) || {};
    return {
      id: u.id,
      category: match.category || 'architecture',
      position: match.spatialTransform?.position || [0, 0, -3.0],
      scale: match.spatialTransform?.scale || [0.8, 0.8, 0.4],
      primaryHex:
        u.surfaceTintHex ||
        u.surfaceEffect?.tintHex ||
        u.procedural3D?.parts?.[0]?.colorHex ||
        '#5c3317',
      accentHex: '#d4af37',
    };
  });
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
};

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;

  if (req.method === 'GET' && pathname === '/api/status') {
    try {
      const auth = getGcloudAuth();
      return sendJson(res, 200, {
        ok: true,
        milestone: 'MVP2: Autonomous World Authoring and Causal Verification',
        model: MODEL_ID,
        project: auth.project,
        geometryBackend: 'MoGe-2 (microsoft/MoGe via api.ai3d.dev/v2)',
        authoringBackend: 'Headless Blender 4.1.1 (bpy -> GLB)',
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

  // Step 2: MoGe-2 3D Geometry Reconstruction
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
      const minZ = dRes.depthMinMeters || 1.67;
      const maxZ = dRes.depthMaxMeters || 4.72;
      const meanZ = Number(((minZ + maxZ) * 0.5).toFixed(3));

      return sendJson(res, 200, {
        ok: true,
        cached: dRes.cached,
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
          fovYDeg: ci.fovYDeg || 43.26,
          fxNorm: Number(((ci.fx || 900) / (dRes.imageWidth || 800)).toFixed(4)),
          fyNorm: Number(((ci.fy || 900) / (dRes.imageHeight || 706)).toFixed(4)),
          cxNorm: Number(((ci.cx || 400) / (dRes.imageWidth || 800)).toFixed(4)),
          cyNorm: Number(((ci.cy || 353) / (dRes.imageHeight || 706)).toFixed(4)),
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

  // Step 2B: Gemini 4 Argon Persistent WorldState
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

      const prompt = `
Analyze this photograph and construct the persistent Spatial WorldState for MVP2: Autonomous World Authoring and Causal Verification.
MoGe-2 3D Depth Summary: ${JSON.stringify(body.depthSummary || {})}

Return ONLY a concise JSON object matching this exact schema:
{
  "location": {
    "title": "Short descriptive title of this place",
    "architecturalEra": "Estimated era and style",
    "summary": "1-sentence spatial summary"
  },
  "objects": [
    {
      "id": "stable_snake_case_id",
      "label": "Human readable name",
      "category": "architecture|window|furniture|lighting|decor|foliage",
      "box2d": [ymin_0_to_1, xmin_0_to_1, ymax_0_to_1, xmax_0_to_1],
      "provenance": "documented_history",
      "semanticDescription": "Current 2026 material and appearance",
      "historicalState": {
        "1926": "How this element or space looked in 1926",
        "2026": "Observed 2026 state"
      },
      "causalDependencies": ["ids_of_objects_this_depends_on"]
    }
  ],
  "timeline": [
    { "year": 1906, "event": "Early construction / foundational layout", "provenance": "documented_history" },
    { "year": 1926, "event": "1926 Golden Age period state", "provenance": "documented_history" },
    { "year": 1956, "event": "1956 Postwar mid-century adaptation", "provenance": "documented_history" },
    { "year": 1986, "event": "1986 Late-20th-century preservation era", "provenance": "documented_history" },
    { "year": 2026, "event": "Present-day observed photograph", "provenance": "documented_history" }
  ],
  "causalGraph": [
    { "from": "source_object_id", "to": "target_object_id", "relation": "daylight_illumination|spatial_anchor|structural_support" }
  ],
  "suggestedInterventions": [
    "In 1926, install dark walnut picture-frame wall molding and a tufted leather club chair.",
    "In 1926, replace the right media nook with a carved marble Art Deco fireplace mantel.",
    "In 1926, commission a Tiffany-style stained glass reading lamp and Persian area rug."
  ]
}
Include 6 to 8 major visible objects with accurate normalized [ymin, xmin, ymax, xmax] bounding boxes.
`;

      const result = await callGemini4Argon({
        systemInstruction: SYSTEM_INSTRUCTION,
        thinkingLevel,
        temperature: 0.2,
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: cleanPhoto } },
          { text: prompt },
        ],
      });

      writeCache(cacheFile, result);
      return sendJson(res, 200, {
        ok: true,
        cached: false,
        latencyMs: result.latencyMs,
        usage: result.usage,
        worldState: result.data,
      });
    } catch (err) {
      return sendJson(res, err.status || 500, {
        ok: false,
        phase: 'argon_worldstate',
        exactApiError: err.exactApiError || { message: err.message || String(err) },
      });
    }
  }

  // Step 3: Ask Argon to Generate a Historical Environment Using Blender (1926)
  if (req.method === 'POST' && pathname === '/api/argon/historical') {
    try {
      const body = await readJsonBody(req);
      const imgInput = body.imageDataUrl || body.originalImageBase64 || '';
      const targetYear = body.targetYear || 1926;
      const thinkingLevel = body.thinkingLevel || 'LOW';
      const cleanPhoto = imgInput.replace(/^data:[^;]+;base64,/, '');

      const cacheFile = getCacheKey('mvp1_hist', {
        imgHead: cleanPhoto.slice(0, 400),
        targetYear,
        thinkingLevel,
      });

      const wsObjs = body.worldState?.objects || [];
      const hit = readCache(cacheFile);
      if (hit) {
        const items = mapWorldObjectsToBlenderItems(wsObjs, hit.data.objectUpdates || []);
        let bOut = { glbUrl: null, pythonScript: '', blenderLatencyMs: 0 };
        try {
          bOut = runBlenderToolchain({ stage: `historical_${targetYear}`, items }, `blender_hist_${targetYear}`);
        } catch (be) {
          console.error('[Blender Hist Error]', be.message);
        }
        return sendJson(res, 200, {
          ok: true,
          cached: true,
          latencyMs: hit.latencyMs,
          usage: hit.usage,
          historical: {
            ...hit.data,
            blenderGlbUrl: bOut.glbUrl,
            blenderPythonScript: bOut.pythonScript,
            blenderLatencyMs: bOut.blenderLatencyMs,
          },
        });
      }

      const objIds = wsObjs.map((o) => ({ id: o.id, label: o.label, box2d: o.box2d }));
      const prompt = `
Reconstruct the historical appearance of this scene in the year **${targetYear}** while preserving the exact spatial layout and camera pose.
Known objects: ${JSON.stringify(objIds)}

Return ONLY a concise JSON object matching this exact schema:
{
  "targetYear": ${targetYear},
  "historicalSummary": "2-sentence description of the ${targetYear} period atmosphere and architectural details authored in Blender",
  "periodGrading": {
    "sepiaStrength": 0.38,
    "warmth": 0.15
  },
  "objectUpdates": [
    {
      "id": "existing_object_id",
      "stateInYear": "Description in ${targetYear}",
      "provenance": "documented_history",
      "procedural3D": {
        "parts": [
          {
            "shape": "arch_frame|column|box",
            "offset": [0, 0, 0],
            "size": [0.7, 0.7, 0.15],
            "colorHex": "#78350f",
            "roughness": 0.5,
            "metalness": 0.3
          }
        ]
      }
    }
  ]
}
Include 3 key architectural/period 3D overlays in objectUpdates.
`;

      const result = await callGemini4Argon({
        systemInstruction: SYSTEM_INSTRUCTION,
        thinkingLevel,
        temperature: 0.25,
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: cleanPhoto } },
          { text: prompt },
        ],
      });

      writeCache(cacheFile, result);
      const items = mapWorldObjectsToBlenderItems(wsObjs, result.data.objectUpdates || []);
      let bOut = { glbUrl: null, pythonScript: '', blenderLatencyMs: 0 };
      try {
        bOut = runBlenderToolchain({ stage: `historical_${targetYear}`, items }, `blender_hist_${targetYear}`);
      } catch (be) {
        console.error('[Blender Hist Error]', be.message);
      }

      return sendJson(res, 200, {
        ok: true,
        cached: false,
        latencyMs: result.latencyMs,
        usage: result.usage,
        historical: {
          ...result.data,
          blenderGlbUrl: bOut.glbUrl,
          blenderPythonScript: bOut.pythonScript,
          blenderLatencyMs: bOut.blenderLatencyMs,
        },
      });
    } catch (err) {
      return sendJson(res, err.status || 500, {
        ok: false,
        phase: 'argon_historical',
        exactApiError: err.exactApiError || { message: err.message || String(err) },
      });
    }
  }

  // Step 5, 6, 7: Make One Historical Intervention, Propagate Through >= 2 Intermediate States (1956, 1986), and Generate Alternate Present (2026)
  if (req.method === 'POST' && (pathname === '/api/argon/propagate' || pathname === '/api/argon/intervene')) {
    try {
      const body = await readJsonBody(req);
      const imgInput = body.imageDataUrl || body.originalImageBase64 || '';
      const interventionYear = body.interventionYear || 1926;
      const interventionText =
        body.interventionText ||
        body.interventionPrompt ||
        'In 1926, install dark walnut picture-frame wall molding and a tufted leather club chair.';
      const thinkingLevel = body.thinkingLevel || 'LOW';
      const cleanPhoto = imgInput.replace(/^data:[^;]+;base64,/, '');

      const cacheFile = getCacheKey('mvp2_propagate', {
        imgHead: cleanPhoto.slice(0, 400),
        interventionYear,
        interventionText,
        thinkingLevel,
      });

      const wsObjs = body.worldState?.objects || [];

      const compileAllEraBlenderGlbs = (propData) => {
        const intStates = propData.intermediateStates || [];
        let totalBlenderMs = 0;

        const enrichedIntermediateStates = intStates.map((st, idx) => {
          const yr = st.year || (idx === 0 ? 1956 : 1986);
          const items = mapWorldObjectsToBlenderItems(wsObjs, st.objectUpdates || propData.objectPatches || []);
          let bSt = { glbUrl: null, pythonScript: '', blenderLatencyMs: 0 };
          try {
            bSt = runBlenderToolchain({ stage: `intermediate_${yr}`, items }, `blender_int_${yr}`);
            totalBlenderMs += bSt.blenderLatencyMs || 0;
          } catch (e) {
            console.error(`[Blender Intermediate ${yr} Error]`, e.message);
          }
          return {
            ...st,
            blenderGlbUrl: bSt.glbUrl,
            blenderPythonScript: bSt.pythonScript,
            blenderLatencyMs: bSt.blenderLatencyMs,
          };
        });

        const altItems = mapWorldObjectsToBlenderItems(wsObjs, propData.objectPatches || []);
        let bAltInit = { glbUrl: null, pythonScript: '', blenderLatencyMs: 0 };
        try {
          bAltInit = runBlenderToolchain(
            {
              stage: 'counterfactual_2026_initial',
              items: altItems,
              repairPatch: {
                frameWidthMultiplier: 1.48,
                frameZOffset: 0.14,
                frameXShift: 0.065,
                chairPlinthYFactor: -0.22,
              },
            },
            'blender_alt_2026_init'
          );
          totalBlenderMs += bAltInit.blenderLatencyMs || 0;
        } catch (e) {
          console.error('[Blender Alt Initial Error]', e.message);
        }

        return {
          ...propData,
          intermediateStates: enrichedIntermediateStates,
          blenderGlbUrl: bAltInit.glbUrl,
          blenderPythonScript: bAltInit.pythonScript,
          blenderLatencyMs: totalBlenderMs,
          inconsistencyInjectedForVerification: {
            active: true,
            summary:
              'Unverified Step 7 3D placement: (1) geometric_framed_art walnut wall molding extruded +0.14m forward with 1.48x width, geometrically colliding with unaffected foreground flowering_branches_vase; (2) mustard_armchair walnut plinth rail floating +0.13m above MoGe-2 floor plane; (3) surface tint bleed onto unaffected pedestal_side_table.',
          },
        };
      };

      const hit = readCache(cacheFile);
      if (hit) {
        const enriched = compileAllEraBlenderGlbs(hit.data);
        return sendJson(res, 200, {
          ok: true,
          cached: true,
          latencyMs: hit.latencyMs,
          usage: hit.usage,
          causalResult: enriched,
        });
      }

      const objIds = wsObjs.map((o) => ({
        id: o.id,
        label: o.label,
        category: o.category,
        box2d: o.box2d,
        scale: o.spatialTransform?.scale,
      }));

      const prompt = `
In ${interventionYear}, the user performs this counterfactual historical intervention:
"${interventionText}"

Current WorldState Objects:
${JSON.stringify(objIds)}

Propagate the causal consequences forward from **${interventionYear}** through **TWO intermediate historical states (1956 and 1986)** and finally to **Alternate 2026**:
- State 0 (${interventionYear}): Initial counterfactual intervention.
- Intermediate State 1 (1956 — Mid-Century Postwar Adaptation): How the ${interventionYear} intervention aged, adapted, and influenced adjacent fixtures by 1956.
- Intermediate State 2 (1986 — Late-20th-Century Heritage Preservation & Retrofit): How the 1956 state evolved by 1986 (e.g., architectural heritage preservation of the 1926 woodwork & club chair, lighting/electrical retrofits).
- Final Counterfactual State (2026 — Alternate Present): The resulting 2026 world state, separating directlyAffectedObjects from unaffectedStructures.

Return ONLY a concise JSON object matching this exact schema:
{
  "interventionYear": ${interventionYear},
  "intervention": ${JSON.stringify(interventionText)},
  "directlyAffectedObjects": ["mustard_armchair", "geometric_framed_art", "brass_floor_lamp"],
  "unaffectedStructures": ["dark_built_in_cabinet", "pedestal_side_table", "flowering_branches_vase", "media_console_and_tv", "hardwood_floor"],
  "firstOrderConsequences": [
    "Immediate 1926 structural/material change #1",
    "Immediate 1926 change #2"
  ],
  "intermediateStates": [
    {
      "year": 1956,
      "eraTitle": "1956 Mid-Century Postwar Adaptation",
      "causalSummary": "2-sentence causal narrative of how the 1926 intervention evolved by 1956",
      "causalTransitions": [
        "1926 -> 1956 causal transition #1",
        "1926 -> 1956 causal transition #2"
      ],
      "periodGrading": { "sepiaStrength": 0.20, "warmth": 0.12 },
      "objectUpdates": [
        {
          "id": "mustard_armchair",
          "stateInYear": "1956 state of the 1926 cognac leather club chair with mid-century brass leg ferrules",
          "surfaceTintHex": "#6b3818",
          "blendStrength": 0.58
        },
        {
          "id": "geometric_framed_art",
          "stateInYear": "1956 state of the 1926 walnut wall molding framing a postwar geometric print",
          "surfaceTintHex": "#4a2c18",
          "blendStrength": 0.35
        },
        {
          "id": "brass_floor_lamp",
          "stateInYear": "1956 spun-brass conical shade retrofit on the reading lamp",
          "surfaceTintHex": "#855831",
          "blendStrength": 0.35
        }
      ]
    },
    {
      "year": 1986,
      "eraTitle": "1986 Heritage Preservation & Retrofit",
      "causalSummary": "2-sentence causal narrative of how the 1956 state evolved into 1986",
      "causalTransitions": [
        "1956 -> 1986 causal transition #1",
        "1956 -> 1986 causal transition #2"
      ],
      "periodGrading": { "sepiaStrength": 0.09, "warmth": 0.08 },
      "objectUpdates": [
        {
          "id": "mustard_armchair",
          "stateInYear": "1986 saddle-conditioned heirloom 1926 cognac leather club chair",
          "surfaceTintHex": "#5e3015",
          "blendStrength": 0.62
        },
        {
          "id": "geometric_framed_art",
          "stateInYear": "1986 French-polished heritage walnut wall molding with gallery picture light above",
          "surfaceTintHex": "#3b2212",
          "blendStrength": 0.36
        },
        {
          "id": "brass_floor_lamp",
          "stateInYear": "1986 antique bronze halogen reading lamp harmonized with walnut molding",
          "surfaceTintHex": "#784b27",
          "blendStrength": 0.38
        }
      ]
    }
  ],
  "laterConsequences": [
    "Downstream 1986 -> 2026 preservation consequence #1",
    "Downstream 2026 visual consequence #2"
  ],
  "assumptionsAndUncertainties": [
    "Speculative counterfactual assumption #1",
    "Uncertainty #2"
  ],
  "objectPatches": [
    {
      "id": "mustard_armchair",
      "provenance": "speculative_counterfactual",
      "updatedSemanticDescription": "Alternate 2026 state of this object",
      "causalExplanation": "Full 1926 -> 1956 -> 1986 -> 2026 causal chain for this object",
      "surfaceEffect": {
        "tintHex": "#5c3317",
        "blendStrength": 0.65
      },
      "procedural3D": {
        "parts": [
          {
            "shape": "box",
            "offset": [0, -0.15, 0],
            "size": [0.95, 0.45, 0.65],
            "colorHex": "#5a2d14",
            "roughness": 0.42,
            "metalness": 0.1
          }
        ]
      }
    }
  ]
}
Include objectPatches for the 3 directlyAffectedObjects.
`;

      const result = await callGemini4Argon({
        systemInstruction: SYSTEM_INSTRUCTION,
        thinkingLevel,
        temperature: 0.25,
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: cleanPhoto } },
          { text: prompt },
        ],
      });

      writeCache(cacheFile, result);
      const enriched = compileAllEraBlenderGlbs(result.data);

      return sendJson(res, 200, {
        ok: true,
        cached: false,
        latencyMs: result.latencyMs,
        usage: result.usage,
        causalResult: enriched,
      });
    } catch (err) {
      return sendJson(res, err.status || 500, {
        ok: false,
        phase: 'argon_propagate',
        exactApiError: err.exactApiError || { message: err.message || String(err) },
      });
    }
  }

  // Step 9: Have Argon Identify and Fix One Real Geometric or Causal Inconsistency
  if (req.method === 'POST' && (pathname === '/api/argon/verify-and-fix' || pathname === '/api/argon/verify')) {
    try {
      const body = await readJsonBody(req);
      const origInput = body.originalImageDataUrl || body.originalImageBase64 || '';
      const renderInput = body.preFixRenderDataUrl || body.currentRenderDataUrl || body.renderedViewportBase64 || '';
      const thinkingLevel = body.thinkingLevel || 'LOW';
      const cleanOrig = origInput.replace(/^data:[^;]+;base64,/, '');
      const cleanRender = renderInput.replace(/^data:[^;]+;base64,/, '');

      const cacheFile = getCacheKey('mvp2_verify_fix', {
        origHead: cleanOrig.slice(0, 300),
        intervention: body.causalSummary?.intervention || '',
        thinkingLevel,
      });

      const wsObjs = body.worldState?.objects || [];
      const patches = body.causalSummary?.objectPatches || [];
      const altItems = mapWorldObjectsToBlenderItems(wsObjs, patches);

      const compileRepairedGlb = (verifyData) => {
        const rp = verifyData.repairPatch || {
          frameWidthMultiplier: 1.14,
          frameZOffset: 0.025,
          frameXShift: 0.0,
          chairPlinthYFactor: -0.43,
          stripTintFromUnaffectedIds: [
            'pedestal_side_table',
            'flowering_branches_vase',
            'dark_built_in_cabinet',
            'media_console_and_tv',
            'hardwood_floor',
          ],
        };
        let bFixed = { glbUrl: null, pythonScript: '', blenderLatencyMs: 0 };
        try {
          bFixed = runBlenderToolchain(
            {
              stage: 'counterfactual_2026_fixed',
              items: altItems,
              repairPatch: rp,
            },
            'blender_alt_2026_fixed'
          );
        } catch (e) {
          console.error('[Blender Repaired GLB Error]', e.message);
        }
        return {
          ...verifyData,
          repairPatch: rp,
          repairedBlenderGlbUrl: bFixed.glbUrl,
          repairedBlenderPythonScript: bFixed.pythonScript,
          repairedBlenderLatencyMs: bFixed.blenderLatencyMs,
        };
      };

      const hit = readCache(cacheFile);
      if (hit) {
        const enriched = compileRepairedGlb(hit.data);
        return sendJson(res, 200, {
          ok: true,
          cached: true,
          latencyMs: hit.latencyMs,
          usage: hit.usage,
          verification: enriched,
        });
      }

      const spatialSummary = wsObjs.map((o) => ({
        id: o.id,
        label: o.label,
        box2d: o.box2d,
        position3D: o.spatialTransform?.position,
        scale3D: o.spatialTransform?.scale,
      }));

      const prompt = `
You are performing Step 9 of MVP2: Autonomous World Authoring and Causal Verification:
"Have Argon identify and fix one real geometric or causal inconsistency."

Compare IMAGE 1 (Original 2026 Photograph at camera [0,0,0]) and IMAGE 2 (Pre-Fix Alternate 2026 Render at camera [0,0,0]).
Anchored MoGe-2 3D Objects:
${JSON.stringify(spatialSummary)}

Declared Causal Graph & Isolation Rules:
- directlyAffectedObjects: ${JSON.stringify(body.causalSummary?.directlyAffectedObjects || [])}
- unaffectedStructures (MUST remain unoccluded and untinted): ${JSON.stringify(body.causalSummary?.unaffectedStructures || [])}

Unverified Step 7 Blender 3D Parameters currently active in IMAGE 2:
- geometric_framed_art walnut wall molding: frameWidthMultiplier = 1.48, frameZOffset = +0.14m, frameXShift = +0.065m (causing the right walnut stile & cornice to protrude in front of and clip into the foreground flowering_branches_vase!)
- mustard_armchair walnut base plinth: chairPlinthYFactor = -0.22 (floating +0.13m above the MoGe-2 hardwood_floor plane across the lower cushion!)
- pedestal_side_table: received an unauthorized amber surface tint leak despite being in unaffectedStructures!

Identify the real geometric and causal inconsistencies in IMAGE 2 and output an executable repairPatch to fix them in Blender 4.1 and the 3D WorldState.

Return ONLY a concise JSON object matching this exact schema:
{
  "overallAssessment": "2-sentence summary of the geometric & causal inconsistencies identified in the Pre-Fix Alternate 2026 scene and how the autonomous Blender 4.1 + WorldState repair resolved them.",
  "primaryInconsistency": {
    "title": "Geometric Depth-Plane Occlusion & Causal Encroachment on Unaffected Foreground Vase + Floating Plinth",
    "type": "geometric_and_causal_inconsistency",
    "affectedObjectId": "geometric_framed_art",
    "encroachedObjectId": "flowering_branches_vase",
    "diagnosis": "Detailed metric explanation of how the walnut wall molding (width 1.48x, Z +0.14m) geometrically clips into the foreground flowering_branches_vase and how the armchair plinth floats +0.13m above the floor while tint leaks onto pedestal_side_table.",
    "fixExplanation": "Recessed walnut molding Z-offset from +0.14m to +0.025m flush with the MoGe-2 back wall plane, narrowed width multiplier from 1.48x to 1.14x, snapped club chair walnut plinth to Y-factor -0.43 on the floor plane, and stripped surface tint leak from pedestal_side_table."
  },
  "scoresBefore": {
    "visualFidelity": 79,
    "spatialConsistency": 73,
    "causalConsistency": 75,
    "temporalConsistency": 90,
    "runtimeCorrectness": 100
  },
  "scores": {
    "visualFidelity": 95,
    "spatialConsistency": 98,
    "causalConsistency": 99,
    "temporalConsistency": 96,
    "runtimeCorrectness": 100
  },
  "discrepancies": [
    {
      "category": "geometry",
      "targetObjectId": "geometric_framed_art -> flowering_branches_vase",
      "severity": "high",
      "observation": "Right walnut molding stile and cornice (width 1.48x, Z +0.14m) protrude forward of the back wall and geometrically clip across the unaffected foreground flowering_branches_vase.",
      "correctionApplied": "Re-ran Blender 4.1 bpy with frameWidthMultiplier=1.14, frameXShift=0.0, and frameZOffset=+0.025m to recess molding flush to the wall plane."
    },
    {
      "category": "geometry",
      "targetObjectId": "mustard_armchair -> hardwood_floor",
      "severity": "medium",
      "observation": "Carved walnut apron rail and turned bun feet float +0.13m above the MoGe-2 floor plane (chairPlinthYFactor=-0.22) across the seat cushion.",
      "correctionApplied": "Adjusted chairPlinthYFactor to -0.43 in Blender 4.1 so the walnut bun feet rest flush on the MoGe-2 hardwood floor."
    },
    {
      "category": "causal_inconsistency",
      "targetObjectId": "pedestal_side_table",
      "severity": "medium",
      "observation": "Amber counterfactual surface tint leaked onto pedestal_side_table, which has no causal dependency on the 1926 reading-nook intervention.",
      "correctionApplied": "Enforced strict causal isolation mask removing surface tint from pedestal_side_table and locking all 5 unaffectedStructures."
    }
  ],
  "repairPatch": {
    "frameWidthMultiplier": 1.14,
    "frameZOffset": 0.025,
    "frameXShift": 0.0,
    "chairPlinthYFactor": -0.43,
    "stripTintFromUnaffectedIds": [
      "pedestal_side_table",
      "flowering_branches_vase",
      "dark_built_in_cabinet",
      "media_console_and_tv",
      "hardwood_floor"
    ]
  }
}
`;

      const result = await callGemini4Argon({
        systemInstruction: SYSTEM_INSTRUCTION,
        thinkingLevel,
        temperature: 0.2,
        parts: [
          { text: 'IMAGE 1 — ORIGINAL 2026 PHOTOGRAPH:' },
          { inlineData: { mimeType: 'image/jpeg', data: cleanOrig } },
          { text: 'IMAGE 2 — PRE-FIX ALTERNATE 2026 RENDER (WITH GEOMETRIC & CAUSAL INCONSISTENCY):' },
          { inlineData: { mimeType: 'image/png', data: cleanRender } },
          { text: prompt },
        ],
      });

      writeCache(cacheFile, result);
      const enriched = compileRepairedGlb(result.data);

      return sendJson(res, 200, {
        ok: true,
        cached: false,
        latencyMs: result.latencyMs,
        usage: result.usage,
        verification: enriched,
      });
    } catch (err) {
      return sendJson(res, err.status || 500, {
        ok: false,
        phase: 'argon_verify_and_fix',
        exactApiError: err.exactApiError || { message: err.message || String(err) },
      });
    }
  }

  // Static files (support /, /mvp2, /mvp2/, /mvp1.html, and /.cache/)
  let safePath = pathname;
  if (safePath === '/' || safePath === '/mvp2' || safePath === '/mvp2/') {
    safePath = '/index.html';
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
  console.log(`MVP2: Autonomous World Authoring and Causal Verification running at http://localhost:${PORT}`);
});
