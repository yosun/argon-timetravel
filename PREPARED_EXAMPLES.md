# Incoming visual-quality artifacts

The incoming archive has not yet been received or inspected in Codex Cloud. The following is user-reported local work, not independently verified here: three `gemini-4-argon` specialist responses produced roughly 2,000 bpy lines; Cloud Run job `argon-ferry-r1-mvonj7q9` in project `crueltycam` compiled the R1 GLB on 8 CPU / 16 GiB and reimported it for five diagnostic renders. The reported actual Argon critic rejected R1 at **4.8/10**, citing ribbon palms, balloon-blob trees, primitive statue/signage/vehicles, and materials lost during GLB export. Four Nano Banana 2K targets exist. A complete geometry/material rewrite with a 131,072-output-token budget was already running locally; do not duplicate that paid request. The next archive may include its saved result and the clock-face close-up renderer correction.

This cloud checkout preserves `feat/cloud-causal-history` and its direct Gemini transport. At inspection, `AI3D_API_KEY` was present; `GEMINI_API_KEY` was absent and its saved binding was false. Blender 4.3.2 runs on cloud CPU. This Blender build has no usable OpenImageDenoise support: disable denoising rather than treating that render failure as a geometry defect. No secret should be included in the handoff, source, artifacts, or Git. No request should depend on a Mac or its localhost URLs.

## Intake and verification

Keep original failed drafts and their raw critic results. Extract the archive into a separate staging directory after checking its file inventory for absolute paths, traversal and symlinks. Do not overwrite the existing checkout or execute worker scripts during extraction. Check source and scripts before executing them; replace Mac paths, localhost dependencies and external texture references with included cloud files. Reuse the completed rewrite rather than issuing another authoring request.

Compile the actual supplied source on cloud CPU, export a self-contained GLB, then start a clean scene and **reimport that exported GLB** for diagnostic renders. A render of the pre-export Blender scene cannot establish exported material fidelity. Retain the exact source, dependency images, worker script, export log, GLB, camera definitions, targets, original photograph, diagnostic images and raw independent critic response. Disable denoising on the current CPU host. Bind all evidence to SHA-256 identities.

Review the actual images for individual shaped leaves and palm leaflets, irregular porous canopies with visible interior branches and sky gaps, believable architectural details and clock-face legibility, grounded props and vehicles, and visible exported texture detail. Inspect original-camera, overview, ground, clock close-up and wireframe views against the targets. The close-up must face the clock rather than its edge or back. Check the GLB in the browser as well as the Blender reimport renderer; browser lighting and alpha rendering can differ.

An independent actual rendered critic must score at least **9/10**, accept the result, and leave no unresolved blocking findings. A cloud reviewer must inspect those same images before demo promotion. Keep rejected/unverified drafts available through explicit inspection controls with those labels. Unit tests, compiler success, polygon counts, a prepared example, and a stored self-reported grade do not establish visual quality. Never merge on those grounds.

## Prepared-example manifest v1

`prepared-examples.js` supplies a browser/CommonJS loader without API calls or dependencies. `scripts/inspect-prepared-example.js` verifies a local manifest and its files without executing Blender or inference:

```sh
node scripts/inspect-prepared-example.js /absolute/staging/path/manifest.json
```

No Ferry example or acceptance result is fabricated by this schema. Create the manifest only from actual incoming and subsequently generated files. Stage durable artifacts separately from `.cache` and `samples/worlds`; the cloud setup script regenerates the latter's illustrative cloister worlds.

| Field | Contract |
| --- | --- |
| `schemaVersion`, `id`, `title` | `1`, stable lowercase identifier, visible title. |
| `provenance`, `year`, `narrative` | `generated_prepared_example`, an explicit represented integer year, and an honest description. One GLB does not imply four simulated historical eras. |
| `artifacts` | Map from artifact ID to `{path, sha256, bytes, mediaType}`. Paths are relative to the manifest and cannot contain traversal, URLs or escapes. SHA-256 is lowercase hex. The GLB filename includes its **complete** SHA-256. No external GLB texture/buffer URLs are allowed. |
| `source` | `{artifactId, selfContained:true, assetIds:[...]}`. Source MIME is `text/x-python`; include every file dependency. This declaration does not replace actual compilation. |
| `world` | `{artifactId, sourceSha256}` pointing to `model/gltf-binary` and the exact source identity. |
| `context` | `{referenceArtifactId, metricSummary, cameraPresets}`. Supply the original photograph and calibrated camera records. An empty `metricSummary` explicitly means no metric calibration. |
| `targetArtifactIds` | IDs of actual target images; empty means the example cannot be promoted. |
| `renderSet` | Optional for inspection. `{id, sha256, method:"exported-glb-reimport", glbSha256, renderer:{name,version,device}, recordedAt, workerArtifactId, views}`. All five views are required for promotion. |
| `renderSet.views` | `originalCam`, `threeQuarter`, `lowAngle`, `clockDetail`, `wireframe`. Each is `{artifactId,camera:{position:[x,y,z],lookAt:[x,y,z],fovYDeg}}` using actual render-camera coordinates. |
| `critic` | Optional for inspection. `{artifactId,provider,model,recordedAt,independent:true,score,scale:10,sourceScale:10 or 100,scorePointer,acceptancePointer,blockingFindingsPointer,glbSha256,renderSetId,renderSetSha256}`. JSON pointers refer into the raw critic JSON. Acceptance must resolve to boolean `true`; an explicit `blockingFindingsPointer` resolving to the actual findings array is required for promotion (an empty array is valid). Any critical/high/blocker/release-blocking severity blocks promotion. Preserve the original scoring scale explicitly. |
| `review` | Optional for inspection. `{status:"unverified" or "rejected" or "accepted",executionHost:"cloud",reviewer,recordedAt,glbSha256,renderSetId,renderSetSha256,criticSha256}`. Record acceptance only after inspecting the exact cloud renders. |

Compute `renderSet.sha256` by SHA-256 hashing the UTF-8 string returned by `renderSetIdentity(manifest)` after finalizing render files and worker. That canonical receipt includes the GLB identity, all cameras, worker hash and image hashes. Copy its identity into the critic and review records. Replacing an image or camera invalidates the receipt even if its informal render-set ID stays unchanged.

`load(manifest,{readArtifact})` reads and checks every byte length/hash, checks the GLB header and embedded dependencies, preserves source, and returns a promotion decision. `loadFromUrl(url)` performs equivalent browser fetches from the manifest origin. `toHistoryBundle(loaded,{artifactUrl})` produces a frozen **new root**, a separate source context with the exact verified reference image, and exactly the explicitly represented year. It refuses objects that did not pass `load`; failed visual acceptance still permits labeled inspection. The loader checks linked evidence consistency, not whether photographs or model responses are authentic or visually good. Actual render inspection remains mandatory.

## Application integration touchpoints

Keep `orig` and its curated procedural demo intact. Add a separate optional prepared-example catalog and explicit inspect/select control; never silently replace saved roots or promote a rejected draft to startup. Add the browser module before `app.js` in `index.html`. Use `loadFromUrl` and `toHistoryBundle`, append only previously absent IDs into `state.branches` and `state.historyContexts`, persist, then select through `syncWorldToYear`. Do not call the live author/rewrite APIs to open a prepared asset.

`loadDemoHistory` currently restores `orig` from browser storage and initializes the illustrative world; add prepared-root registration after restoration rather than editing its manifest. `syncWorldToYear` must label a prepared root as a prepared example instead of “RECONSTRUCTED PRESENT”; the history navigator should show rejected/unverified acceptance explicitly. Add a separate promotion path that checks `promotion.eligible`; only that path may feature a prepared asset in the visible demo.

`applyHistoryContext` must restore the prepared camera definitions, reference dimensions and scene title along with the source. `setCameraPreset` currently assumes a cloister near `z=-6.2` with a 120 m camera far plane; adapt it to the incoming scene's calibrated presets/bounds and add the supplied clock-detail camera. Keep camera coordinates explicit and convert Blender's Z-up to Three.js Y-up only where required. The common loader must continue committing geometry, metadata and context together, preserving the previous world on a failed or stale load.

After integration, exercise the actual browser GLB and texture requests, all five diagnostic cameras, screenshots at demo resolution, rapid world switching, nested parent/fork navigation, intermediate-date labels, failure retention and reload persistence. Those functional checks accompany the actual rendered review; they do not supply its grade. No public deployment is configured in the current repository. A cloud development port or a Mac localhost link is not visible demo delivery.
