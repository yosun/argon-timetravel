# External services needed for the TIME TRAVEL demo

The application and history UI stay in Codex Cloud. Blender geometry generation and GLB export already run on this host's CPU. No Mac process or external Blender service is needed for the three-minute procedural demonstration.

## 1. AI3D MoGe-2: required for real photograph reconstruction

In the Codex Cloud environment settings:

1. Supply `AI3D_API_KEY` through the saved secure secret requirement. Do not send its value in chat, a Git commit, or a document.
2. Allow `api.ai3d.dev` for HTTPS egress. This domain and the key requirement are saved in the environment draft; saving the draft does not apply it to this running machine. Review/save the settings and publish the environment when ready. Recheck runtime injection before claiming access.
3. Start/restart `npm run depth-service` after the binding is active. From another cloud shell, `curl -fsS http://127.0.0.1:3457/health` should show `apiKeyConfigured:true`. This checks presence only; a real job must still authenticate and succeed.
4. Run the real depth smoke below. If its returned artifact URLs use another host, add that actual HTTPS hostname to egress. Signed artifact hosts must not receive the API key.

The existing adapter expects the following AI3D v2 contract; confirm the production service matches it or send the actual schema so the adapter can be adjusted:

- `POST https://api.ai3d.dev/v2/uploads`: Bearer authentication, multipart `image` file; JSON response `{ "image_url": "..." }`.
- `POST /v2/jobs`: Bearer authentication, JSON `{ "model":"moge2", "image_url":"...", "input":{"max_size":800,"resolution_level":"High","apply_mask":true,"remove_edges":true} }`.
- Job response contains `id` and `status`. Poll `GET /v2/jobs/{id}` until `status` is `succeeded` or `failed`; failures contain `error`.
- Successful response contains `artifacts`, each `{ "name":"points.exr", "download_url":"https://..." }`. Required artifacts are `points.exr` (metric XYZ), `depth.exr`, and `image.png`. Recognized optional artifacts are `image-01.png` normals, `mask.png`, and `mesh.glb`.
- All downloads must be HTTPS. Bearer is sent only to `api.ai3d.dev`; third-party downloads should be signed URLs requiring no API bearer. The adapter derives the browser's camera/point-grid response from these artifacts. Confirm coordinate units and image/XYZ alignment in the production response.

Run from `/workspace/argon-timetravel` after the main server and depth service are running:

```sh
node scripts/smoke-live-depth.js
```

This submits the committed cloister photograph through the real application endpoint and prints only the outcome, timing, grid/intrinsic checks, and whether a mesh was returned. A pass verifies authenticated inference and usable geometry; health alone does not. The job may consume normal AI3D usage. No API key is printed.

## 2. Scene authoring and independent critic: external model access

These are already external API operations; no local GPU is required. The current adapter uses Vertex with `gemini-4-argon` through `gcloud auth print-access-token`. It needs a valid authorized project, authenticated cloud identity, and permission/access to that exact model. The present ADC binding was tested and is unusable, and no project is configured. GPU hardware will not fix this.

Choose one supported integration:

- Configure a valid authenticated `gcloud` identity plus `GOOGLE_CLOUD_PROJECT`, and confirm the requested model exists and is available to it.
- If AI3D offers scene authoring or multimodal critique, supply the documentation URL, API hostname, authentication-header convention, and request/response schema. Secrets go into environment settings, never chat. The app can then adapt to that documented service; merely setting an unsupported `GEMINI_API_KEY` will not activate the current Vertex adapter.

The authoring operation needs reference image(s), metric landmarks/intrinsics, and optionally parent Blender source, intervention/fork date, and prior critique. It must return complete Blender Python source as structured JSON. The critic consumes actual rendered viewpoints and returns explicit scores/deficiencies; those calls must be measured before any claim of independent reconstruction quality.

## 3. Optional remote Blender, only if CPU becomes a bottleneck

No action needed now: real cloud CPU compilation/export and error handling are verified. If external execution is later desired, a minimal asynchronous interface would be enough:

- Submit one versioned Blender job with `bpyCode`, `groundYThree`, pinned Blender/toolchain version, and references to required textures.
- Return a job ID; poll for `queued/running/succeeded/failed`.
- On success, provide signed GLB and telemetry URLs, with object/vertex/triangle counts and `execError:null`.
- On script errors or empty geometry, return `failed` plus diagnostics; do not publish a partial or empty GLB as success.
- Optionally return actual original/overview/ground/wireframe renders for the external critic.

This is a proposed contract, not an existing endpoint or dependency. Keep Python execution isolated with bounded CPU/memory/time; application credentials and unrelated files should not enter the worker. Navigation and causal-history storage remain in Codex Cloud.

## Current boundary

The three-minute procedural CPU demo works without external inference and is labeled accordingly. Live reconstruction still requires AI3D key/network access. Live autonomous source generation and critique additionally require model access. No live inference or critic scores are claimed from mocked tests or illustrative assets.
