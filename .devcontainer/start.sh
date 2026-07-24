#!/usr/bin/env bash
# Runs every time the Codespace starts/resumes: make sure the stack is up.
set -euo pipefail
cd "$(cd "$(dirname "$0")/.." && pwd)/construction-erp"
docker compose up -d || true
