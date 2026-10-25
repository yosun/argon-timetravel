#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
node --version
python3 -m venv /workspace/argon-venv
/workspace/argon-venv/bin/pip install -r requirements-cloud.txt
"${BLENDER_PATH:-blender}" --background --factory-startup --threads 2 --python scripts/demo-worlds.py
node --test tests/*.test.js
