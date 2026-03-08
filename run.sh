#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_PATH="${1:-config.json}"

cd "$SCRIPT_DIR"
exec cargo run -p mibilleterabitcoin -- --config "$CONFIG_PATH"
