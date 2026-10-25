# Three-minute TIME TRAVEL demonstration

Everything runs in Codex Cloud. No Mac process, cache, GPU, or local server is needed. Inference stays on external APIs; CPU Blender handles geometry and GLB export here.

## Before presenting

Run `bash scripts/setup-cloud.sh`, then `npm start`. Start `npm run depth-service` for the separate live AI3D workflow. Processes must restart after a new task or publication. The committed demo GLBs allow startup before live AI3D credentials exist.

The main workbench has a **3-minute demo** button. It runs a curated procedural demonstration; it does not claim AI reconstruction, historical accuracy, or verified critic scores. Manual intervention templates support canopy/fountain, astrolabe/sundial, or garden changes. Arbitrary scene authoring uses the separate live model workflow.

## Presentation sequence

- **0:00–0:30:** Open the courtyard, orbit/overview it, and scrub between 1206, 1566, 1938, and 2026. Intermediate dates explicitly identify the available geometry being held.
- **0:30–1:30:** Click **3-minute demo**. CPU Blender generates a canopy at the exact 1206 fork and an astrolabe at the nested 1566 fork. The return-to-present sequence shows inherited changes, while each parent history remains selectable. Wait until generation completes; controls prevent overlapping jobs.
- **1:30–2:30:** Close the ancestry inspector to reveal the history list. Select the original, canopy parent, and astrolabe descendant. Earlier epochs in the descendant inherit their parent; the fork changes only the future. The sidebar shows explicit parent IDs/fork dates. This is preserved branch state, not overwritten A/B slots.
- **2:30–3:00:** Reload and continue a saved history, or demonstrate historical navigation. Explain the external boundary: AI3D turns a real photo into metric depth/points, a model writes/refines Blender code, and this app preserves and navigates its histories. Those live operations require credentials; the procedural demo makes no model-quality claim.

## Measured validation in this cloud host

- 16 Node tests passed, zero skipped: history/source persistence, exact dates, concurrency, failed-load labels, actual CPU Blender export, invalid-code/empty-geometry rejection, and real HTTP error/corrupt-cache behavior.
- Seven Python tests passed: mocked AI3D transport/redirect security and actual synthetic EXR round-trip. These are adapter tests, not real AI3D inference.
- The real browser integration generated CPU Blender geometry, verified default 1206 action and a restored nested 1566 history, checked visible mesh names and the actual outgoing parent source, rapid navigation, and missing-asset retention. No AI/depth response was mocked in this browser workflow; it did not call those services. The cold/reload run took about 64 seconds.
- The separate one-click UI demo passed in about 24 seconds with warm valid compilation caches. Original + two descendant histories were preserved; final geometry contained both canopy and astrolabe. No JavaScript page errors were reported.
- `npm run depth-service` starts successfully with the installed environment. A real sample request currently fails explicitly because AI3D_API_KEY is absent. AI3D egress also needs the saved settings applied.
- No GPU is exposed. PyTorch CUDA availability is false. Official GPU-enabled Codex Cloud offering support could not be verified from reachable documentation; no GPU offering is assumed.

See [API_REQUIREMENTS.md](API_REQUIREMENTS.md) for exact external contracts, secure settings, and the real depth smoke command. See [HARDWARE.md](HARDWARE.md) for hardware/CPU-kernel evidence. The app remains unmerged; no live inference, critic result, or publication is claimed without a successful check.
