import base64
import hashlib
import io
import ipaddress
import json
import math
import os
import re
import time
import urllib.request
from urllib.parse import urlsplit
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

os.environ["OPENCV_IO_ENABLE_OPENEXR"] = "1"
import cv2
import numpy as np
from PIL import Image

PORT = int(os.environ.get('DEPTH_SERVICE_PORT', '3457'))
BASE_DIR = Path(__file__).resolve().parent
CACHE_DIR = BASE_DIR / ".cache"
CACHE_DIR.mkdir(parents=True, exist_ok=True)
ENV_FILE = BASE_DIR / ".env"
AI3D_BASE_URL = "https://api.ai3d.dev/v2"
UPLOAD_IMAGE_TYPES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}


def load_ai3d_api_key() -> str:
    key = os.environ.get("AI3D_API_KEY", "").strip()
    if key:
        return key
    for path in (ENV_FILE,):
        if path.exists():
            for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
                if line.startswith("AI3D_API_KEY="):
                    val = line.split("=", 1)[1].strip().strip('"').strip("'")
                    if val:
                        return val
    return ""


AI3D_API_KEY = load_ai3d_api_key()
print(f"[MoGe2Service] AI3D_API_KEY loaded: {'YES' if AI3D_API_KEY else 'NO'} (Endpoint: {AI3D_BASE_URL})")


def validate_artifact_url(url: str):
    """Accept HTTPS public DNS destinations; never send the API key to another host."""
    if not isinstance(url, str) or any(ord(char) < 33 for char in url):
        raise ValueError("AI3D artifact URL must be an HTTPS URL without whitespace")
    parsed = urlsplit(url)
    hostname = parsed.hostname
    if (parsed.scheme != "https" or not hostname or parsed.username is not None
            or parsed.password is not None or parsed.port not in (None, 443)
            or parsed.fragment or "\\" in url):
        raise ValueError("AI3D artifact URL must use HTTPS without userinfo, fragments, or nonstandard ports")
    try:
        ipaddress.ip_address(hostname)
    except ValueError:
        pass
    else:
        raise ValueError("AI3D artifact URL must use a public DNS hostname")
    labels = hostname.split(".")
    if (len(hostname) > 253 or len(labels) < 2
            or any(not re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", label) for label in labels)
            or not re.fullmatch(r"[a-z][a-z0-9-]{1,62}", labels[-1])
            or hostname.endswith((".localhost", ".local", ".internal"))):
        raise ValueError("AI3D artifact URL must use a public DNS hostname")
    return parsed


def artifact_request(url: str):
    parsed = validate_artifact_url(url)
    request = urllib.request.Request(url, method="GET")
    if parsed.hostname == "api.ai3d.dev":
        # Unredirected headers also protect against accidental cross-host forwarding.
        request.add_unredirected_header("Authorization", f"Bearer {AI3D_API_KEY}")
    return request


class ArtifactRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        parsed = validate_artifact_url(newurl)
        redirected = super().redirect_request(request, fp, code, msg, headers, newurl)
        if redirected is not None:
            redirected.remove_header("Authorization")
            if parsed.hostname == "api.ai3d.dev":
                redirected.add_unredirected_header("Authorization", f"Bearer {AI3D_API_KEY}")
        return redirected


# The standard opener retains environment proxy handling and normal TLS verification.
_ARTIFACT_OPENER = urllib.request.build_opener(ArtifactRedirectHandler())


def decode_image_input(image_base64: str):
    """Keep uploaded JPEG/PNG/WebP types; raw base64 retains the legacy JPEG default."""
    if not isinstance(image_base64, str):
        raise ValueError("imageBase64 must contain a base64 image string")
    mime_type = "image/jpeg"
    encoded = image_base64
    if image_base64.startswith("data:"):
        match = re.fullmatch(r"data:([^;,]+);base64,(.*)", image_base64, flags=re.DOTALL)
        if match is None:
            raise ValueError("Image data URL must contain base64 JPEG, PNG, or WebP")
        mime_type, encoded = match.groups()
        mime_type = mime_type.lower()
    if mime_type not in UPLOAD_IMAGE_TYPES:
        raise ValueError("Supported upload types are image/jpeg, image/png, and image/webp")
    image_bytes = base64.b64decode(encoded, validate=True)
    if not image_bytes:
        raise ValueError("Uploaded image is empty")
    return image_bytes, mime_type


def run_moge2_remote_job(img_bytes: bytes, sha256_hex: str, mime_type: str = "image/jpeg") -> Path:
    """
    Calls https://api.ai3d.dev/v2/uploads and https://api.ai3d.dev/v2/jobs with model='moge2'
    and downloads depth.exr, points.exr, image.png (depth), image-01.png (normal), mask.png, mesh.glb.
    Caches in .cache/moge_<sha256>/.
    """
    if mime_type not in UPLOAD_IMAGE_TYPES:
        raise ValueError("Supported upload types are image/jpeg, image/png, and image/webp")
    extension = UPLOAD_IMAGE_TYPES[mime_type]
    job_dir = CACHE_DIR / f"moge_{sha256_hex}"
    if (job_dir / "points.exr").exists() and (job_dir / "depth.exr").exists() and (job_dir / "image.png").exists():
        print(f"[MoGe2Service] Cache hit for {sha256_hex[:12]}")
        return job_dir

    if not AI3D_API_KEY:
        raise RuntimeError("AI3D_API_KEY is not configured for MoGe-2 API access.")

    job_dir.mkdir(parents=True, exist_ok=True)

    # 1. Multipart upload to /v2/uploads
    boundary = f"MoGeBoundary{int(time.time() * 1000)}"
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="image"; filename="photo.{extension}"\r\n'
        f"Content-Type: {mime_type}\r\n\r\n"
    ).encode("utf-8") + img_bytes + f"\r\n--{boundary}--\r\n".encode("utf-8")

    req_up = urllib.request.Request(
        f"{AI3D_BASE_URL}/uploads",
        data=body,
        headers={
            "Authorization": f"Bearer {AI3D_API_KEY}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "Accept": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req_up, timeout=60) as resp:
        up_data = json.loads(resp.read().decode("utf-8"))

    image_url = up_data["image_url"]

    # 2. Submit MoGe-2 job to /v2/jobs
    job_payload = json.dumps({
        "model": "moge2",
        "image_url": image_url,
        "input": {
            "max_size": 800,
            "resolution_level": "High",
            "apply_mask": True,
            "remove_edges": True,
        },
    }).encode("utf-8")

    req_job = urllib.request.Request(
        f"{AI3D_BASE_URL}/jobs",
        data=job_payload,
        headers={
            "Authorization": f"Bearer {AI3D_API_KEY}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req_job, timeout=30) as resp:
        job_info = json.loads(resp.read().decode("utf-8"))

    job_id = job_info["id"]
    print(f"[MoGe2Service] Submitted MoGe-2 job {job_id} for image {sha256_hex[:12]}")

    # 3. Poll until succeeded
    deadline = time.time() + 180
    while job_info.get("status") not in ("succeeded", "failed"):
        if time.time() > deadline:
            raise RuntimeError(f"MoGe-2 job {job_id} timed out")
        time.sleep(2.0)
        req_poll = urllib.request.Request(
            f"{AI3D_BASE_URL}/jobs/{job_id}",
            headers={"Authorization": f"Bearer {AI3D_API_KEY}", "Accept": "application/json"},
            method="GET",
        )
        with urllib.request.urlopen(req_poll, timeout=30) as resp:
            job_info = json.loads(resp.read().decode("utf-8"))

    if job_info.get("status") != "succeeded":
        raise RuntimeError(f"MoGe-2 job {job_id} failed: {job_info.get('error')}")

    # 4. Download artifacts
    wanted = {"image.png", "image-01.png", "mask.png", "depth.exr", "points.exr", "mesh.glb"}
    for art in job_info.get("artifacts", []):
        name = art.get("name")
        dl_url = art.get("download_url")
        if name in wanted and dl_url:
            req_dl = artifact_request(dl_url)
            with _ARTIFACT_OPENER.open(req_dl, timeout=90) as resp:
                (job_dir / name).write_bytes(resp.read())

    required = ("points.exr", "depth.exr", "image.png")
    if any(not (job_dir / name).is_file() for name in required):
        raise RuntimeError("AI3D MoGe-2 response is missing required geometry artifacts")

    (job_dir / "job_meta.json").write_text(json.dumps(job_info, indent=2), encoding="utf-8")
    return job_dir


def parse_moge2_artifacts(job_dir: Path, grid_w: int = 192, grid_h: int = 168) -> dict:
    depth_exr = cv2.imread(str(job_dir / "depth.exr"), cv2.IMREAD_ANYCOLOR | cv2.IMREAD_ANYDEPTH)
    points_exr = cv2.imread(str(job_dir / "points.exr"), cv2.IMREAD_ANYCOLOR | cv2.IMREAD_ANYDEPTH)

    if points_exr is None or points_exr.ndim != 3 or points_exr.shape[2] != 3:
        raise RuntimeError("AI3D points.exr is missing or is not a three-channel point map")
    if grid_w < 2 or grid_h < 2:
        raise ValueError("MoGe-2 output grids must be at least 2 by 2")

    # OpenCV BGR -> X is channel 2 (R), Y is channel 1 (G), Z is channel 0 (B)
    X_full = points_exr[..., 2].astype(np.float32)
    Y_full = points_exr[..., 1].astype(np.float32)
    Z_full = points_exr[..., 0].astype(np.float32)
    D_full = depth_exr.astype(np.float32) if depth_exr is not None else Z_full.copy()

    h, w = Z_full.shape[:2]
    aspect = float(w) / max(1.0, float(h))

    # Clean non-finite values
    valid_mask = np.isfinite(X_full) & np.isfinite(Y_full) & np.isfinite(Z_full) & (Z_full > 0.05)
    if not np.any(valid_mask):
        raise RuntimeError("AI3D point map contains no valid finite geometry")
    z_min = float(np.min(Z_full[valid_mask])) if np.any(valid_mask) else 1.5
    z_max = float(np.max(Z_full[valid_mask])) if np.any(valid_mask) else 5.0
    Z_clean = np.where(valid_mask, Z_full, z_max)
    X_clean = np.where(valid_mask, X_full, 0.0)
    Y_clean = np.where(valid_mask, Y_full, 0.0)

    # Recover exact MoGe-2 vertical FOV from top/bottom camera rays
    row_top = min(h - 1, max(4, int(h * 0.05)))
    col_mid = w // 2
    v_norm = abs((row_top + 0.5) / float(h) * 2.0 - 1.0)
    tan_half_fov_y = abs(float(Y_clean[row_top, col_mid]) / max(0.1, float(Z_clean[row_top, col_mid]))) / max(0.05, v_norm)
    fov_y_deg = round(math.degrees(2.0 * math.atan(tan_half_fov_y)), 3)
    fy = round((h / 2.0) / max(1e-4, tan_half_fov_y), 2)
    fx = fy
    cx = round(w / 2.0, 2)
    cy = round(h / 2.0, 2)

    # Downsample X, Y, Z to [grid_h, grid_w] for fast interactive Three.js manipulation
    X_grid = cv2.resize(X_clean, (grid_w, grid_h), interpolation=cv2.INTER_AREA)
    Y_grid = cv2.resize(Y_clean, (grid_w, grid_h), interpolation=cv2.INTER_AREA)
    Z_grid = cv2.resize(Z_clean, (grid_w, grid_h), interpolation=cv2.INTER_AREA)

    # Compute depth-discontinuity edge mask (matches MoGe's utils3d.numpy.depth_edge)
    gy, gx = np.gradient(Z_grid)
    rel_grad = np.hypot(gx, gy) / np.maximum(0.2, Z_grid)
    edge_mask = (rel_grad < 0.032).astype(np.float32)

    # Convert OpenCV camera coords (X right, Y down, Z forward) to Three.js camera coords (X right, Y up, -Z forward)
    pts_three = np.stack([X_grid, -Y_grid, -Z_grid], axis=-1)

    # Normalized disparity [0, 1] for UI compatibility (1 = near, 0 = far)
    disp_grid = np.clip((z_max - Z_grid) / max(1e-4, z_max - z_min), 0.0, 1.0)

    # Encode MoGe-2 depth map (image.png) and normal map (image-01.png)
    depth_png_b64 = "data:image/png;base64," + base64.b64encode((job_dir / "image.png").read_bytes()).decode("ascii")
    normal_path = job_dir / "image-01.png"
    normal_png_b64 = (
        "data:image/png;base64," + base64.b64encode(normal_path.read_bytes()).decode("ascii")
        if normal_path.exists()
        else depth_png_b64
    )

    # Build a visual confidence/validity overlay combining MoGe mask.png + depth discontinuity edges
    conf_vis = np.clip(np.exp(-(rel_grad * 28.0)), 0.0, 1.0)
    conf_rgb = np.stack([
        np.clip((1.0 - conf_vis) * 255.0, 0, 255).astype(np.uint8),
        np.clip((conf_vis ** 0.8) * 240.0, 0, 255).astype(np.uint8),
        np.clip((conf_vis ** 1.3) * 180.0, 0, 255).astype(np.uint8),
    ], axis=-1)
    conf_pil = Image.fromarray(conf_rgb, mode="RGB").resize((w // 2, h // 2), Image.Resampling.BILINEAR)
    buf_conf = io.BytesIO()
    conf_pil.save(buf_conf, format="PNG", optimize=True)
    conf_b64 = "data:image/png;base64," + base64.b64encode(buf_conf.getvalue()).decode("ascii")

    return {
        "imageWidth": w,
        "imageHeight": h,
        "gridWidth": grid_w,
        "gridHeight": grid_h,
        "depthMinMeters": round(z_min, 3),
        "depthMaxMeters": round(z_max, 3),
        "cameraIntrinsics": {
            "matrixK": [fx, 0.0, cx, 0.0, fy, cy, 0.0, 0.0, 1.0],
            "fx": fx,
            "fy": fy,
            "cx": cx,
            "cy": cy,
            "fovYDeg": fov_y_deg,
            "aspectRatio": round(aspect, 4),
            "calibrationSource": "MoGe-2 Metric Point-Map Focal & Shift Recovery (points.exr)",
            "isEstimate": True,
        },
        "originalCameraPose": {
            "position": [0.0, 0.0, 0.0],
            "rotation": [0.0, 0.0, 0.0],
            "lookAt": [0.0, 0.0, -1.0],
            "fov": fov_y_deg,
        },
        "confidenceStats": {
            "meanConfidence": round(float(np.mean(edge_mask)), 4),
            "discontinuityEdgeRatio": round(float(1.0 - np.mean(edge_mask)), 4),
        },
        "depthColorMapBase64": depth_png_b64,
        "normalMapBase64": normal_png_b64,
        "confidenceMaskBase64": conf_b64,
        "pointsGrid": np.round(pts_three, 4).tolist(),
        "metricDepthGrid": np.round(Z_grid, 4).tolist(),
        "disparityGrid": np.round(disp_grid, 4).tolist(),
        "confidenceGrid": np.round(edge_mask, 3).tolist(),
    }


class MoGe2GeometryHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        return

    def _send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/health":
            self._send_json(200, {
                "ok": True,
                "model": "moge2 (api.ai3d.dev/v2)",
                "apiKeyConfigured": bool(AI3D_API_KEY),
            })
        else:
            self._send_json(404, {"error": "Not found"})

    def do_POST(self):
        if self.path != "/estimate-depth":
            return self._send_json(404, {"error": "Not found"})

        t0 = time.time()
        try:
            length = int(self.headers.get("Content-Length", "0"))
            raw = self.rfile.read(length)
            body = json.loads(raw.decode("utf-8"))

            img_bytes, mime_type = decode_image_input(body.get("imageBase64", ""))

            grid_w = int(body.get("gridWidth", 192))
            grid_h = int(body.get("gridHeight", 168))

            sha256_hex = hashlib.sha256(img_bytes).hexdigest()

            was_cached = (CACHE_DIR / f"moge_{sha256_hex}" / "points.exr").exists()
            job_dir = run_moge2_remote_job(img_bytes, sha256_hex, mime_type=mime_type)
            parsed = parse_moge2_artifacts(job_dir, grid_w=grid_w, grid_h=grid_h)

            latency_ms = int(round((time.time() - t0) * 1000))

            self._send_json(200, {
                "ok": True,
                "model": "MoGe-2 (microsoft/MoGe via api.ai3d.dev/v2)",
                "cached": was_cached,
                "sha256": sha256_hex,
                "meshGlbPath": f"/.cache/moge_{sha256_hex}/mesh.glb" if (job_dir / "mesh.glb").exists() else None,
                "isEstimate": True,
                "estimateLabel": "MoGe-2 Metric Point-Map & Depth Estimate (points.exr + depth.exr)",
                "processingLatencyMs": latency_ms,
                **parsed,
            })
        except Exception as e:
            self._send_json(500, {
                "ok": False,
                "error": str(e),
            })


if __name__ == "__main__":
    server = HTTPServer(("127.0.0.1", PORT), MoGe2GeometryHandler)
    print(f"[MoGe2Service] Listening on http://127.0.0.1:{PORT}")
    server.serve_forever()
