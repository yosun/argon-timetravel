# Three-minute TIME TRAVEL demonstration

Everything runs in Codex Cloud. No Mac process, cache, GPU, or local server is needed. Inference stays on external APIs; CPU Blender handles geometry and GLB export here.

## Before presenting

Run `bash scripts/setup-cloud.sh`, then `npm start`. Start `npm run depth-service` for the separate live AI3D workflow. Processes must restart after a new task or publication. The committed demo GLBs allow startup before live AI3D credentials exist.

The main workbench has a **3-minute demo** button. It runs a curated procedural demonstration; it does not claim AI reconstruction, historical accuracy, or verified critic scores. Manual intervention templates support canopy/fountain, astrolabe/sundial, or garden changes. Arbitrary scene authoring uses the separate live model workflow.

## Presentation sequence

- **0:00–0:30:** Open the courtyard, orbit/overview it, and scrub between 1206, 1566, 1938, and 2026. Intermediate dates explicitly identify the available geometry being held.
- **0:30–1:30:** Click **3-minute demo**. CPU Blender generates a canopy at the exact 1206 fork and an astrolabe at the nested 1566 fork. The return-to-present sequence shows inherited changes, while each parent history remains selectable. Wait until generation completes; controls prevent overlapping jobs.
- **1:30–2:30:** Close the ancestry inspector to reveal the history list. Select the original, canopy parent, and astrolabe descendant. Earlier epochs in the descendant inherit their parent; the fork changes only the future. The sidebar shows explicit parent IDs/fork dates. This is preserved branch state, not overwritten A/B slots.
- **2:30–3:00:** Reload and continue a saved history, or demonstrate historical navigation. Explain the external boundary: AI3D turns a real photo into metric depth/points, the direct Gemini API writes/refines Blender code, and this app preserves and navigates its histories. Those live operations require credentials; the procedural demo makes no model-quality claim.

## Measured validation in this cloud host

- 16 Node tests passed, zero skipped: history/source persistence, exact dates, concurrency, failed-load labels, actual CPU Blender export, invalid-code/empty-geometry rejection, and real HTTP error/corrupt-cache behavior.
- Seven Python tests passed: mocked AI3D transport/redirect security and actual synthetic EXR round-trip. These are adapter tests, not real AI3D inference.
- The real browser integration generated CPU Blender geometry, verified default 1206 action and a restored nested 1566 history, checked visible mesh names and the actual outgoing parent source, rapid navigation, and missing-asset retention. No AI/depth response was mocked in this browser workflow; it did not call those services. The cold/reload run took about 64 seconds.
- The separate one-click UI demo passed in about 24 seconds with warm valid compilation caches. Original + two descendant histories were preserved; final geometry contained both canopy and astrolabe. No JavaScript page errors were reported.
- `npm run depth-service` starts successfully with the installed environment. After secure AI3D key publication, a real uncached MoGe-2 job completed in 29.7 seconds, and the live browser displayed its textured metric-depth mesh using the resulting cached artifacts. This is real learned depth inference, separate from the procedural demo.
- No GPU is exposed. PyTorch CUDA availability is false. Official GPU-enabled Codex Cloud offering support could not be verified from reachable documentation; no GPU offering is assumed.

See [API_REQUIREMENTS.md](API_REQUIREMENTS.md) for exact external contracts, secure settings, and the real depth smoke command. See [HARDWARE.md](HARDWARE.md) for hardware/CPU-kernel evidence. The app remains unmerged. Live AI3D inference and its cached browser result are verified; live Gemini source generation and independent critic outcomes are not.

## Live image intake

Use **Upload image** next to the TIME TRAVEL title, outside Developer Mode. JPEG, PNG, and WebP files receive a local preview; paid inference starts only after **Reconstruct image**. The live split is AI3D MoGe-2 depth → Gemini Developer API authoring/critique → cloud CPU Blender. The uploaded source stays separate from the displayed history until reconstruction starts, and cancel/failure preserves prior histories. Larger source contexts use browser IndexedDB when needed. Missing live credentials are reported without substituting the illustrative world as a reconstruction.

Runtime upload tests exercise the actual native file chooser on desktop/mobile, verify the exact selected bytes, and use explicitly labeled missing-key fixtures for error handling, no fake history, retained prior geometry, and cancel/reload behavior. The separate cached live-depth check uses real AI3D artifacts and does not submit a new paid job. Separate upload orchestration tests use explicitly mocked service responses to cover depth-only and full successful pipeline paths; they do not establish live model inference.

## Live depth demo now verified

AI3D key publication succeeded. The first uncached MoGe-2 job completed in **29.7 seconds**, returning metric points/depth, 98.79° camera FOV, and a GLB. Uploading the cloister image and clicking **Reconstruct image** now displays its real textured metric-depth mesh. `GEMINI_API_KEY` is still absent, so the UI explicitly reports depth readiness without claiming architectural authoring or critique. Direct Gemini model access is unverified; use the real key's ListModels output to select `GEMINI_MODEL` rather than assuming the historical `gemini-4-argon` label is available. Cancel restores the original world.

Run `tests/browser-live-depth.cjs` with the documented Playwright/NODE_PATH setup to verify that real flow using existing cached artifacts only. This browser check refuses to submit a new paid job if the expected cache is absent. The generic upload error-path test uses labeled missing-key fixtures now that live credentials are configured.

## Authoring provider for the live demo

The active author/critic provider is the direct Gemini Developer API at `generativelanguage.googleapis.com`, authenticated with a secure `GEMINI_API_KEY` binding. It does not require gcloud or a Google Cloud project. The app should expose one active provider/model in its status metadata and report credential or API failures for that provider without an automatic fallback. Run `node scripts/check-gemini.js` after secure key setup to list available models; `--generate` is an explicit minimal generation check. See [API_REQUIREMENTS.md](API_REQUIREMENTS.md) for key setup, model selection, and verification limits. AI3D remains responsible for MoGe-2 depth, and Blender continues to execute on the cloud CPU.
