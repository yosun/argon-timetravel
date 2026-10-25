# TIME TRAVEL: Autonomous 3D World Generation & Causal Simulator

Autonomous 3D World Authoring, 4-View Adversarial Critic & Counterfactual Causal Simulator powered by **Gemini 4 Argon**, **MoGe-2 metric 3D depth calibration**, and headless **Blender 4.1 (`bpy`)** procedural synthesis.

---

## 🌟 Highlights & Capabilities

- **Metric Grounding & Floorplan Extraction**: Uses MoGe-2 monocular depth estimation to calibrate metric camera intrinsics/extrinsics, generating annotated 2D SVG floorplans and 3D point cloud reference frames.
- **Autonomous Procedural World Authoring (Blender `bpy`)**: Gemini 4 Argon generates unrestricted Python `bpy` scripts to build rich 3D architectural models with procedural materials and PBR textures.
- **4-View Closed-Loop Adversarial Critic**: Automatically renders from four vantage points (Original Cam, Low Angle, 3/4 Perspective, and Normal/Wireframe) to score alignment, discover geometric errors, and self-correct across refinement rounds.
- **Multi-Branch Counterfactual Causal Simulator**: Branch forward and backward through architectural eras (e.g. 1206 Romanesque, 1566 Renaissance renovation, 1938 War damage, 2026 Counterfactual restoration) with interactive 3D scrubbing and comparative timeline exploration.
- **Interactive WebGL Workbench**: Three.js viewport with GLTF mesh streaming, wireframe overlays, bounding box inspectors, timeline scrubber, and telemetry analytics.

---

## 🏗️ Architecture

```
┌────────────────────────────────────────────────────────┐
│                   Interactive Web UI                   │
│   (Three.js GLTF Viewport + Stage Controller + HUD)    │
└───────────────────────────▲────────────────────────────┘
                            │ HTTP / JSON
┌───────────────────────────┴────────────────────────────┐
│                    Node.js Server                      │
│            (server.js - Orchestrator, Port 3456)       │
└──────┬────────────────────┬────────────────────┬───────┘
       │                    │                    │
       ▼                    ▼                    ▼
┌──────────────┐   ┌─────────────────┐   ┌───────────────┐
│ Gemini 4 API │   │  Blender 4.1    │   │ MoGe-2 Depth  │
│ (Argon LLM)  │   │  bpy Toolchain  │   │ Python Service│
│              │   │  (Headless GLB) │   │  (Port 3457)  │
└──────────────┘   └─────────────────┘   └───────────────┘
```

---

## 🚀 Quickstart

### Prerequisites

- **Node.js**: v18+ (no external npm dependencies required; uses standard Node standard library)
- **Python**: 3.10+ with `numpy`, `opencv-python`, `pillow` (for `depth_service.py`)
- **Blender**: 4.1+ installed (default macOS path `/Applications/Blender.app/Contents/MacOS/Blender`)

### 1. Launch MoGe-2 Depth Service (Optional / When using live depth)
```bash
python3 depth_service.py
```
*(Runs on `http://127.0.0.1:3457`)*

### 2. Launch Main Orchestrator Server
```bash
npm start
# or node server.js
```
*(Runs on `http://localhost:3456`)*

### 3. Open in Browser
Visit [http://localhost:3456](http://localhost:3456) to load the MVP3 Autonomous 3D Workbench.

---

## 📁 Repository Structure

```
├── app.js                    # MVP3 frontend controller & WebGL runtime
├── index.html                # MVP3 interactive 3D workbench UI
├── server.js                 # MVP3 orchestrator & API gateway
├── blender_toolchain.py      # Headless Blender bpy generator & multi-view renderer
├── depth_service.py          # MoGe-2 metric point cloud & normal map server
├── styles.css                # Dark-mode dashboard styling
├── vendor/                   # Three.js r128 and GLTFLoader
├── samples/                  # Reference textures, floorplans, test scenes
├── mvp1.html / mvp1_app.js   # MVP1 baseline demo
├── mvp2.html / mvp2_app.js   # MVP2 milestone demo
└── progress.html             # Progress dashboard & milestone telemetry
```

---

## 📜 License

MIT License.
