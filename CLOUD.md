# Cloud development

All commands run in the cloud checkout; no Mac process, local cache, or machine is needed.
Use Node 18+, Python 3.10+, and Blender 4.1+ on PATH. The onboarding host was tested with Node 24.19, Python 3.12, and Blender 4.3.2. Override the Blender executable with BLENDER_PATH when needed. Use the existing isolated checkout rather than creating a worktree.

```sh
cd /workspace/argon-timetravel
bash scripts/setup-cloud.sh
node server.js
# Optional live-depth process, in another cloud shell:
/workspace/argon-venv/bin/python depth_service.py
```

The setup script creates a Python environment outside the checkout, installs pinned depth dependencies, regenerates the four illustrative GLBs under samples/worlds, and runs regression tests. These GLBs are also committed so a clean checkout has an initial world. They are procedural demonstrations, not reconstructions or critic-verified historical evidence. No ignored .cache files are required for startup. Generated AI artifacts still use .cache and must be retained separately to reopen those histories in a new cloud machine.

The server and depth process must restart after environment publication or a fresh task. The environment draft records installation and startup instructions. Only the product UI can publish the prepared environment; saving a draft does not publish it.

## Validation

```sh
node --test tests/*.test.js
curl -fsS http://127.0.0.1:3456/api/status
curl -fsS http://127.0.0.1:3457/health
```

For browser validation, install Playwright in a temporary tools directory (no application dependencies required):

```sh
npm_config_cache=/tmp/npm-cache npm install --prefix /tmp/browser-tools playwright
NODE_PATH=/tmp/browser-tools/node_modules node tests/browser-smoke.cjs
```

The browser check uses /usr/bin/chromium and cloud-internal HTTP. It verifies actual WebGL startup, intermediate-year selection, rapid navigation, and browser history persistence. Its causal API responses are mocked: it tests integration and inheritance, not AI quality. It writes a screenshot to /tmp/cloud-workbench.png.

## Live service prerequisites

Live depth requires AI3D_API_KEY securely supplied to the depth process. Live generation currently requires the gcloud CLI, authenticated Vertex access, and GOOGLE_CLOUD_PROJECT (or a gcloud project configuration). The existing implementation does not support GEMINI_API_KEY or a service-account path automatically, despite HANDOFF.md suggesting otherwise. Do not enter secret values in chat or commit them. The model name and access must be verified with a real authorized request before claiming live generation works.

The current cloud host has neither gcloud authentication nor AI3D_API_KEY. /api/status reports liveGenerationAvailable:false while the illustrative browser workflow remains available. /health reports apiKeyConfigured:false. The handoff's 71→92 scores were not independently reproduced; the user-reported 4.2→8.6 records were not available in this checkout either.

## History semantics

Each intervention appends a unique immutable node with parentId and forkYear. States earlier than the fork are inherited from the parent; generated post-fork states replace only the descendant's future. Siblings remain independently navigable in the history panel. A scrubbed date displays the latest preceding available epoch (the earliest available epoch before the first), with no claim that intervening geometry was simulated. Histories persist in browser local storage; this is not server-side multi-user persistence. Generation inputs include the selected parent epoch's source when available, and causal caches include the full image hash, source hash, and metric configuration.

Existing MVP1 and MVP2 pages remain available. Live AI authoring, full critic/rewrite acceptance, and legacy credential-dependent workflows remain unrun in this cloud host. This change does not establish their handoff claims.
