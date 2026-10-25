# Cloud hardware and inference boundary

All checks were executed in Codex Cloud. They use no Mac process or hardware.

## Measured host capability

Run the standard-library probe with either interpreter:

```sh
python3 scripts/check-hardware.py
/workspace/moge-venv/bin/python scripts/check-hardware.py
```

The latter checks PyTorch installed for the MoGe investigation. The system Python does not have PyTorch installed. On this host:

| Check | Observed result |
| --- | --- |
| `nvidia-smi` | Not installed or exposed on PATH |
| NVIDIA / render GPU device nodes | None exposed |
| PyTorch | `2.14.1+cpu` in `/workspace/moge-venv` |
| PyTorch CUDA build | `None` |
| `torch.cuda.is_available()` | `False` |
| `torch.cuda.device_count()` | `0` |
| CPU tensor execution | Succeeds |
| CPU quota (`cpu.max`) | `400000 / 100000`, equivalent to 4 CPU cores |
| CPU count visible to Python | 5; the cgroup quota is the effective compute limit |
| Memory quota (`memory.max`) | 34,359,738,368 bytes, 32 GiB |
| Swap | 0 |

No GPU is exposed in this cloud host. Installing a CUDA-enabled Python package would not supply GPU hardware. Blender mesh authoring, telemetry, and GLB export execute on CPU; the real Blender regression test verifies successful geometry export and rejects failed or empty scene generation.

## Does Codex Cloud offer GPU instances?

A supported, selectable GPU-enabled Codex Cloud option could not be verified from the authoritative documentation reachable in this task. Do not depend on one.

The official [cloud environment documentation](https://developers.openai.com/codex/cloud/environments) and OpenAI Help Center documentation were blocked by this task's egress proxy with `CONNECT 403 Forbidden`. This is an access limitation, not proof that all Codex Cloud GPU support is impossible. The reachable official [codex-universal repository](https://github.com/openai/codex-universal) describes a reference Docker image as **not an identical environment** and does not document GPU instance selection. The [Codex repository](https://github.com/openai/codex) distinguishes the local CLI from cloud-based Codex Web; local GPU examples do not establish GPU availability in Codex Cloud.

## Smallest external GPU dependency

A GPU is not required for the Node web application, causal-history storage and navigation, Three.js world loading, or Blender geometry generation and GLB export. If measured MoGe-2 CPU inference cannot meet the demo latency or memory budget, offload only the single-image depth-estimation operation:

1. Send one uploaded image to an authenticated MoGe-2 inference endpoint.
2. Return the metric points/depth, mask, normals, and camera calibration in the depth-service response contract, or return the corresponding EXR/image artifacts for the existing adapter.
3. Keep every other component and all application state in this cloud environment; retain inference artifacts to avoid repeated calls for the same image.

The existing `depth_service.py` adapter already isolates this boundary through `api.ai3d.dev/v2`; it needs a securely configured `AI3D_API_KEY`. Any alternate GPU endpoint must implement the same outputs and be explicitly authenticated. No GPU capacity, vendor memory minimum, performance guarantee, or successful authenticated remote inference is claimed here. CPU feasibility should be decided from the MoGe benchmark result, separately from these hardware facts. Vertex/Gemini authoring also has a separate credential requirement; supplying GPU hardware would not fix missing authentication.

## CPU investigation evidence; application remains on AI3D

The application continues to use AI3D for MoGe-2, as requested. Local CPU investigation was stopped; no local inference backend, substitute model, or untrained depth result was integrated.

Before that decision, the official [Microsoft MoGe source](https://github.com/microsoft/MoGe) at commit `74fbce054ebed49800de42d0ad0e83495065719a` imported the v2 model successfully with CPU PyTorch. A kernel-only smoke test executed the official ViT-L-normal training configuration (**330,901,544 total parameters**) on the sample photograph resized to 240×320, using three CPU threads and **random, untrained weights**:

| Tokens | Model initialization | Forward pass | Peak process RSS |
| --- | --- | --- | --- |
| 300 | 3.38 s | 1.52 s | 1,798.82 MiB |
| 1,200 | 3.10 s | 5.86 s | 2,203.65 MiB |

All output tensors were finite. These results establish that the v2 kernels can run within this host's CPU and memory limits. **They do not verify pretrained inference, focal recovery, reconstruction accuracy, or learned-model end-to-end latency.** The public smallest official MoGe-2 checkpoint is listed as 35M total parameters; it is distinct from the 330.9M-parameter configuration benchmarked here. An actual pretrained checkpoint request failed with `ProxyError: 403 Forbidden` before download. No untrained outputs are used by the demo. Raw benchmark evidence remains under `/tmp/moge-architecture-cpu*.json` in this machine.

AI3D remains the intended isolated inference service; the cloud app and Blender export remain on CPU. At investigation time `AI3D_API_KEY` was absent from the process and supported local credential files, and the unauthenticated API destination was blocked by the egress proxy. These are configuration/access prerequisites, not local GPU limitations.
