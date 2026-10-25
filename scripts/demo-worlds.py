"""Compatibility entrypoint: use the shared, validated CPU demo generator."""
import os
import subprocess
from pathlib import Path

if __name__ == "__main__":
    subprocess.run(["node", str(Path(__file__).with_name("build-demo-worlds.js"))], check=True, env=os.environ.copy())
