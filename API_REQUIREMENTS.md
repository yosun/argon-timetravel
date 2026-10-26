# External services for TIME TRAVEL

The application and history UI run in Codex Cloud. The live pipeline uses **AI3D MoGe-2 for depth, Vertex/Gemini for authoring and critique, and cloud CPU Blender for geometry generation and GLB export**. No Mac process, external Blender worker, or local GPU is part of this architecture.

The three-minute procedural demonstration executes real CPU Blender without external inference. It is separate from reconstructing an uploaded photograph.

## Upload and explicit reconstruction

The public flow is **Upload image → preview → Reconstruct image**. File selection prepares the preview only; no paid AI3D or Vertex request should run until the user presses **Reconstruct image**. Reconstruction then performs:

1. AI3D MoGe-2 metric depth and camera/point calibration.
2. Vertex/Gemini scene-specific Blender source authoring.
3. Cloud CPU Blender geometry generation, telemetry, and validated GLB export.
4. Actual rendered-view capture, Vertex/Gemini independent critique, and source repair/re-export.

Existing histories remain available when a new image is selected. A reconstruction retains its own photograph and metric context. If a prerequisite is missing, the UI should name the blocked service and the missing credential/access requirement rather than claiming success or substituting the procedural demo.

## AI3D MoGe-2 access

In the Codex Cloud environment settings:

1. Supply `AI3D_API_KEY` through the secure secret requirement. Never send its value in chat, a Git commit, or a document.
2. Allow `api.ai3d.dev` for HTTPS egress. The domain and key requirement were saved in the environment draft; saving the draft does not apply it to a running machine. Review/save the settings and publish the environment when ready. Recheck runtime injection before claiming access.
3. Start/restart `npm run depth-service` after the binding is active. A cloud-internal `GET /health` on port 3457 should show `apiKeyConfigured:true`. This checks presence only; a real job must still authenticate and succeed.
4. Run the real depth smoke below. If artifact URLs use another host, allow that actual HTTPS hostname for egress. Signed artifact hosts must not receive the API key.

The adapter expects the following AI3D v2 contract; a successful authenticated request must confirm that production matches it:

- `POST https://api.ai3d.dev/v2/uploads`: Bearer authentication, multipart `image` file; JSON response `{ "image_url": "..." }`.
- `POST /v2/jobs`: Bearer authentication, JSON `{ "model":"moge2", "image_url":"...", "input":{"max_size":800,"resolution_level":"High","apply_mask":true,"remove_edges":true} }`.
- Job response contains `id` and `status`. Poll `GET /v2/jobs/{id}` until `status` is `succeeded` or `failed`; failures contain `error`.
- Successful response contains `artifacts`, each `{ "name":"points.exr", "download_url":"https://..." }`. Required artifacts are `points.exr` (metric XYZ), `depth.exr`, and `image.png`. Recognized optional artifacts are `image-01.png` normals, `mask.png`, and `mesh.glb`.
- All downloads use HTTPS. Bearer authentication goes only to `api.ai3d.dev`; third-party downloads use signed URLs without the API bearer. The adapter derives the browser's camera/point-grid response from these artifacts. Coordinate units and image/XYZ alignment must be verified against the production response.

Run from `/workspace/argon-timetravel` after the main server and depth service are running:

```sh
node scripts/smoke-live-depth.js
```

This submits the committed cloister photograph through the real application endpoint and prints the outcome, timing, grid/intrinsic checks, and whether a mesh was returned. A pass verifies authenticated inference and usable geometry; health alone does not. The job may consume normal AI3D usage. No API key is printed.

## Vertex/Gemini authoring and independent critique

These are external API operations and need no GPU on the Codex host. The adapter uses Vertex with the configured model ID `gemini-4-argon` through `gcloud auth print-access-token`. Configure an authenticated cloud identity, `GOOGLE_CLOUD_PROJECT` (or a gcloud project configuration), and permission to invoke that exact model. Confirm that the model exists and is available to the identity before claiming readiness.

The recorded cloud check found no usable Vertex identity/project; the available ADC binding was also unusable. This is a credentials/access blocker, not a GPU limitation. The current adapter does not automatically use `GEMINI_API_KEY` or a service-account file path. Merely setting those variables does not activate the integration.

Authoring consumes reference images, metric landmarks/intrinsics, and, when relevant, parent Blender source, intervention/fork date, and prior critique. It returns complete Blender Python source as structured JSON. The critic consumes actual rendered viewpoints and reports explicit scores and deficiencies. Those model calls must complete before any claim of independently assessed reconstruction quality.

AI3D remains the depth provider. Vertex/Gemini remains the scene author and critic.

## CPU Blender execution

Cloud Blender executes the returned source with bounded CPU parallelism, computes object/vertex/triangle telemetry, and exports a GLB only after successful nonempty geometry generation. Script failures, empty scenes, or invalid GLBs must fail the job explicitly rather than publishing an empty world as success.

CPU compilation/export and error handling have been exercised with real Blender. The procedural demo provides a credential-free path for showing this capability, but its curated source is not evidence of live model authoring. Navigation and history state remain in the cloud application.

## Evidence boundary

The three-minute procedural CPU demo has recorded real generation and browser verification. Live photograph reconstruction remains blocked until AI3D credentials/network and Vertex identity/project/model access work. No authenticated live inference or critic score is established by mocked tests or illustrative assets. The smallest external GPU boundary is the existing AI3D single-image MoGe-2 job; moving the application or Blender to a GPU host is unnecessary.
