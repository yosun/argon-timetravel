# Cloud development

All commands run in the cloud checkout; no Mac process, local cache, or machine is needed.
Use Node 18+, Python 3.10+, and Blender 4.1+ on PATH. The onboarding host was tested with Node 24.19, Python 3.12, and Blender 4.3.2. Override the Blender executable with BLENDER_PATH when needed. Use the existing isolated checkout rather than creating a worktree.

```sh
cd /workspace/argon-timetravel
bash scripts/setup-cloud.sh
node server.js
# Optional live-depth process, in another cloud shell:
npm run depth-service
```

The setup script checks Node/Python/Blender versions, creates a Python environment outside the checkout, installs pinned depth dependencies, regenerates the four illustrative GLBs under samples/worlds, and runs regression tests. It preserves Blender failure exit codes. The default virtual environment is `/workspace/argon-venv`; set `ARGON_VENV_DIR` for a different location in both setup and startup. `npm run depth-service` uses that environment automatically (or a checkout `.venv`), rather than system Python. `ARGON_PYTHON` explicitly selects an interpreter, and `DEPTH_SERVICE_PORT` overrides port 3457. These GLBs are also committed so a clean checkout has an initial world. They are procedural demonstrations, not reconstructions or critic-verified historical evidence. No ignored .cache files are required for startup. Generated AI artifacts still use .cache and must be retained separately to reopen those histories in a new cloud machine.

The server and depth process must restart after environment publication or a fresh task. The environment draft records installation and startup instructions. Only the product UI can publish the prepared environment; saving a draft does not publish it.

## Validation

```sh
node --test tests/*.test.js
curl -fsS http://127.0.0.1:3456/api/status
curl -fsS http://127.0.0.1:3457/health
```

For browser validation, install Playwright in a temporary tools directory (no application dependencies required):

```sh
npm_config_cache=/tmp/npm-cache npm install --prefix /tmp/browser-tools playwright@1.64.1
NODE_PATH=/tmp/browser-tools/node_modules node tests/browser-smoke.cjs
NODE_PATH=/tmp/browser-tools/node_modules node tests/browser-demo.cjs
NODE_PATH=/tmp/browser-tools/node_modules node tests/browser-upload.cjs
NODE_PATH=/tmp/browser-tools/node_modules node tests/browser-diagnostics.cjs
```

The browser check uses /usr/bin/chromium and cloud-internal HTTP. It verifies actual WebGL startup, intermediate-year selection, rapid navigation, and browser history persistence. It calls the real CPU Blender demo endpoint, verifies geometry names and source inheritance through nested histories, reloads a saved history, and checks failed-asset retention. No generation or depth response is mocked in this browser run; the procedural demo does not call AI3D or Gemini. It writes /tmp/cloud-workbench-verified.png. Set TEST_BASE_URL to target another cloud-internal server port. Separate Node workflow tests mock model responses explicitly; backend HTTP tests seed AI plan fixtures but execute real Blender.

The diagnostic browser check renders the committed GLB at 1280×960, checks that source-photo/depth/debug geometry cannot contaminate critic images, and checks exact viewport restoration after success and capture failure. It makes no AI calls and does not establish visual quality. Incoming visual artifacts, exported-GLB reimport rendering, independent 9/10 acceptance, and prepared-example intake are described in [PREPARED_EXAMPLES.md](PREPARED_EXAMPLES.md).

## Live reconstruction architecture and prerequisites

The live pipeline is fixed: **AI3D MoGe-2 supplies photograph depth/calibration; Gemini Developer API authors, critiques, and repairs scene source; cloud CPU Blender generates geometry and exports GLB worlds.** No Mac process, local model backend, or external Blender worker is needed.


Live depth requires `AI3D_API_KEY` securely supplied to the depth process. Live scene authoring, independent critique, repair, and causal planning use the direct Gemini Developer API. Configure `GEMINI_API_KEY` securely for HTTPS requests to `generativelanguage.googleapis.com`, and set `GEMINI_MODEL` after listing models available to that key. The historical repository label `gemini-4-argon` is not verified on this API. A gcloud installation, Vertex identity, and Google Cloud project are not prerequisites for the direct route.

The app reports `authoringProvider:'gemini'`, the configured model, and `modelVerified` separately; a configured key alone does not verify model access. Credential failures, model-access errors, and other API failures should stop that operation with a precise error; they do not trigger automatic provider fallback. Run `node scripts/check-gemini.js` after key configuration to list available models without content generation; select the model through `GEMINI_MODEL`. `node scripts/check-gemini.js --generate` explicitly requests a minimal JSON generation smoke. See [API_REQUIREMENTS.md](API_REQUIREMENTS.md) for secure configuration and evidence limits.

After environment publication, `AI3D_API_KEY` is securely bound and a real uncached MoGe-2 request completed in 29.7 seconds. The live upload UI also displayed the cached metric-depth result as a textured 3D mesh. `GEMINI_API_KEY` is not configured, so direct Gemini authoring/critique and the historical model ID remain unverified. The handoff's 71→92 critic scores were not independently reproduced; the user-reported 4.2→8.6 records were not available in this checkout either.

## History semantics

Each intervention appends a unique immutable node with parentId and forkYear. States earlier than the fork are inherited from the parent; generated post-fork states replace only the descendant's future. Siblings remain independently navigable in the history panel. A scrubbed date displays the latest preceding available epoch (the earliest available epoch before the first), with no claim that intervening geometry was simulated. Histories and deduplicated source photographs/calibration persist in browser storage; large source contexts fall back to IndexedDB when local storage fills, and reconstruction roots save immediately. A failed restoration cannot overwrite older saved records. This is not server-side multi-user persistence. Generation inputs include the selected parent epoch's source when available, and causal caches include the full image hash, source hash, and metric configuration.

Existing MVP1 and MVP2 pages remain available. Live AI authoring, full critic/rewrite acceptance, and legacy credential-dependent workflows remain unrun in this cloud host. This change does not establish their handoff claims.

## Three-minute demo

Click **3-minute demo** in the top bar to generate a 1206 fountain canopy and a nested 1566 astrolabe history on CPU. These are real Blender mesh/GLB exports driven by curated procedural rules, not model-generated reconstructions. Select any saved history to compare its parent and descendants. Canonical eras and exact fork dates remain separately navigable; no previous branch is overwritten. Supported procedural interventions are canopy/fountain, astrolabe/sundial, and garden; arbitrary natural-language synthesis uses the separate live AI workflow.

MoGe-2 remains exclusively on the AI3D API as requested. The external GPU boundary is the AI3D photograph-to-depth/points operation. AI3D needs the secure AI3D_API_KEY binding and api.ai3d.dev network access; returned artifact hosts may need additional egress after their actual URLs are known. No application migration or local GPU is required. See HARDWARE.md for measured CPU/CUDA evidence and the limits of GPU product-support verification.

## Uploaded photograph workflow

Use **Upload image** in the top toolbar to select and preview a photograph. Selection does not automatically send paid inference requests. Press **Reconstruct image** to run real AI3D MoGe-2 depth, Gemini Developer API authoring and rendered-view critique/repair, then CPU Blender export. This is separate from the curated procedural demo.

Existing histories are retained when selecting another image. A completed reconstruction saves its own source photograph and metric context for later interventions. Missing AI3D credentials/network access or Gemini API-key/model access should be reported for that precise service. A healthy process or available procedural demo does not establish that live reconstruction works. See [API_REQUIREMENTS.md](API_REQUIREMENTS.md) for secure setup and the real depth smoke check.

## Latest live AI3D verification

The first authenticated, uncached cloister job returned a 192×168 metric grid, 98.79° vertical FOV and a mesh GLB in 29.7 seconds. Artifacts use HTTPS on api.ai3d.dev. No additional artifact host was required.

`NODE_PATH=/tmp/browser-tools/node_modules node tests/browser-live-depth.cjs` checks the actual upload/reconstruct flow against those cached artifacts. It refuses to run without the existing cache, preventing accidental new paid jobs. The browser displayed a real textured depth mesh (32,256 vertices and 63,794 triangles), explicitly stopped before Gemini authoring, and restored the original history on cancel. The separate browser-upload missing-credentials case now uses explicitly labeled error fixtures and never sends its dining-room image to a paid service.

The depth HTTP server handles health requests concurrently with long inference. Identical concurrent image requests share one AI3D job/result/failure, preventing duplicate submissions. No live Gemini source generation or independent critic result is claimed.
