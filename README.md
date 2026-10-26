# TIME TRAVEL

TIME TRAVEL turns a photograph into a navigable 3D world, then preserves alternate causal histories as separate branches. The application runs in Codex Cloud. Its live reconstruction architecture is fixed:

| Component | Responsibility |
| --- | --- |
| AI3D MoGe-2 API | Photograph-to-metric-depth, points, camera calibration, and geometry artifacts |
| Vertex AI / Gemini | Scene-specific Blender source authoring, independent rendered-view critique, source repair, and causal scene planning |
| Cloud CPU Blender | Execute authored geometry, measure telemetry, and export validated GLB worlds |
| Node.js and Three.js | Orchestrate services, retain history relationships, and navigate the worlds |

No Mac process or local GPU is required. AI3D supplies MoGe-2 inference; it does not replace Vertex authoring or critique. Blender runs in the cloud on CPU.

## Cloud startup

Use Node 18+, Python 3.10+, and Blender 4.1+ on the cloud host. The prepared host was tested with Node 24.19, Python 3.12, and Blender 4.3.2.

```sh
cd /workspace/argon-timetravel
bash scripts/setup-cloud.sh
npm start
# In a second cloud shell, for live photograph reconstruction:
npm run depth-service
```

Setup installs pinned Python dependencies into `/workspace/argon-venv` and generates the committed illustrative startup worlds. The depth startup command selects that virtual environment automatically. On Linux, Blender is resolved from PATH; `BLENDER_PATH` can override its executable. See [CLOUD.md](CLOUD.md) for configuration and validation commands.

The servers use ports 3456 and 3457 inside the cloud environment. Use the platform's browser access to the application; no Mac server or ignored local `.cache` content is needed for the startup demonstration.

## Three-minute demonstration

Click **3-minute demo** to generate a 1206 fountain canopy and a nested 1566 astrolabe history. This runs real CPU Blender geometry generation and GLB export using curated procedural rules. It does not call AI3D or Vertex, and it is labeled as a procedural demonstration rather than an AI reconstruction.

Scrub the timeline and select saved histories to compare parent and descendant worlds. Each intervention retains a unique history ID, its parent ID, and its exact fork date. Earlier states and sibling histories remain intact.

## Reconstruct an uploaded photograph

1. Use **Upload image** in the top toolbar and select a photograph. Selection creates a preview; it does not automatically submit paid inference requests.
2. Press **Reconstruct image** to start the live pipeline: AI3D MoGe-2 depth, Vertex/Gemini Blender authoring, CPU Blender export, rendered-view critique, and source repair.
3. Inspect the resulting world and its reported critic outcomes, then create a causal intervention from a selected history and date.

Uploading another image retains existing histories. Each reconstruction stores its own source photograph and metric context so later interventions use the correct reference. Missing credentials or service access must be reported for the affected service; an illustrative world must not be presented as successful live reconstruction.

Live reconstruction requires a secure `AI3D_API_KEY` binding, access to `api.ai3d.dev` and returned artifact hosts, and an authenticated Vertex identity/project authorized for the configured Gemini model. See [API_REQUIREMENTS.md](API_REQUIREMENTS.md). Do not put secret values in chat, source files, or commits.

## Verification and limits

```sh
npm test
```

The recorded cloud checks include real CPU Blender generation/export, browser navigation, nested procedural histories, reload persistence, and failed-load handling. Tests that seed model responses exercise orchestration only; they do not verify model quality. Live AI3D inference and Vertex authoring/critique remain separate checks and require working credentials and network access. Historical handoff critic scores have not been independently reproduced in this cloud host.

[HARDWARE.md](HARDWARE.md) records the absence of an exposed GPU, the limits of Codex Cloud GPU-support verification, and the local CPU kernel investigation. The CPU investigation used untrained weights and is not a reconstruction result. MoGe-2 remains on AI3D.

## Repository

- `server.js`: application/API orchestrator; `app.js`, `index.html`, `styles.css`: Three.js workbench and timeline.
- `depth_service.py`: AI3D MoGe-2 adapter; `blender_toolchain.py`: CPU Blender execution, telemetry, and GLB export.
- `history.js`, `world-navigation.js`: immutable history relationships and safe scene loading.
- `scripts/`, `tests/`: cloud setup, smoke checks, and regressions; `samples/`: reference images and illustrative worlds.
- `mvp1.html`, `mvp2.html`: preserved earlier milestones; `progress.html`: recorded milestone gallery.

MIT License.
