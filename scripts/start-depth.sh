#!/usr/bin/env bash
set -euo pipefail

task_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$task_root"

if [[ -n "${ARGON_PYTHON:-}" ]]; then
  task_python="$ARGON_PYTHON"
elif [[ -n "${ARGON_VENV_DIR:-}" ]]; then
  task_python="$ARGON_VENV_DIR/bin/python"
elif [[ -x "$task_root/.venv/bin/python" ]]; then
  task_python="$task_root/.venv/bin/python"
elif [[ -x /workspace/argon-venv/bin/python ]]; then
  task_python=/workspace/argon-venv/bin/python
else
  task_python="$(command -v python3 || true)"
fi

if [[ -z "$task_python" ]] || ! "$task_python" -c 'import cv2, numpy, PIL' >/dev/null 2>&1; then
  echo 'Depth dependencies are missing. Run bash scripts/setup-cloud.sh, or set ARGON_PYTHON to a Python interpreter containing requirements-cloud.txt.' >&2
  exit 1
fi

exec "$task_python" -u depth_service.py "$@"
