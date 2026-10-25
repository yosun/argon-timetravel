#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

task_venv_dir="${ARGON_VENV_DIR:-/workspace/argon-venv}"
task_blender="${BLENDER_PATH:-blender}"
node -e 'if (Number(process.versions.node.split(".")[0]) < 18) throw new Error("Node 18+ is required")'
python3 -c 'import sys; assert sys.version_info >= (3, 10), "Python 3.10+ is required"'
"$task_blender" --background --factory-startup --threads 2 --python-exit-code 1 --python-expr 'import bpy; assert bpy.app.version >= (4, 1, 0), "Blender 4.1+ is required"'
python3 -m venv "$task_venv_dir"
"$task_venv_dir/bin/python" -m pip install -r requirements-cloud.txt
BLENDER_PATH="$task_blender" node scripts/build-demo-worlds.js
node --test tests/*.test.js
"$task_venv_dir/bin/python" -m unittest discover -s tests -p 'test_*.py'
