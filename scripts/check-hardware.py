#!/usr/bin/env python3
"""Report this cloud task's hardware without reading credentials or environment values.

Uses only the Python standard library; checks PyTorch when installed in the active
interpreter. Run with a model virtual environment's Python to test that environment.
"""
import glob
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys


def read(path):
    try:
        return Path(path).read_text(encoding="utf-8").strip()
    except (OSError, ValueError):
        return None


def numeric_limit(path):
    value = read(path)
    if value in (None, "max"):
        return None
    try:
        return int(value)
    except ValueError:
        return None


def inspect_hardware():
    quota = read("/sys/fs/cgroup/cpu.max")
    quota_cores = None
    if quota:
        fields = quota.split()
        if len(fields) == 2 and fields[0] != "max":
            quota_cores = int(fields[0]) / int(fields[1])
    memory = {}
    for line in (read("/proc/meminfo") or "").splitlines():
        key, _, value = line.partition(":")
        if key in ("MemTotal", "MemAvailable", "SwapTotal"):
            memory[key + "Bytes"] = int(value.split()[0]) * 1024
    nvidia_binary = shutil.which("nvidia-smi")
    nvidia = {"available": bool(nvidia_binary), "devices": []}
    if nvidia_binary:
        try:
            result = subprocess.run(
                [nvidia_binary, "--query-gpu=name,memory.total,driver_version", "--format=csv,noheader"],
                capture_output=True, text=True, timeout=15, check=False,
            )
            nvidia["exitCode"] = result.returncode
            nvidia["devices"] = result.stdout.strip().splitlines()
            if result.returncode:
                nvidia["error"] = result.stderr.strip()
        except (OSError, subprocess.TimeoutExpired) as error:
            nvidia["error"] = type(error).__name__
    torch_status = {"installed": importlib.util.find_spec("torch") is not None}
    if torch_status["installed"]:
        try:
            import torch
            torch_status.update({
                "version": torch.__version__,
                "cudaBuild": torch.version.cuda,
                "cudaAvailable": torch.cuda.is_available(),
                "cudaDeviceCount": torch.cuda.device_count(),
                "cpuTensorWorks": torch.tensor([1.0], device="cpu").add(1).item() == 2.0,
            })
        except Exception as error:
            torch_status["error"] = type(error).__name__
    return {
        "python": sys.executable,
        "cpu": {"visibleCount": os.cpu_count(), "quotaCores": quota_cores},
        "memory": {**memory,
            "cgroupLimitBytes": numeric_limit("/sys/fs/cgroup/memory.max"),
            "cgroupCurrentBytes": numeric_limit("/sys/fs/cgroup/memory.current"),
            "cgroupPeakBytes": numeric_limit("/sys/fs/cgroup/memory.peak")},
        "gpuDeviceNodes": sorted(glob.glob("/dev/nvidia*") + glob.glob("/dev/dri/renderD*")),
        "nvidiaSmi": nvidia,
        "torch": torch_status,
    }


if __name__ == "__main__":
    print(json.dumps(inspect_hardware(), indent=2))
