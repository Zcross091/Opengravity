#!/usr/bin/env bash
set -euo pipefail

# OpenGravity IDE Automated Packaging Script (macOS / Linux)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_DIR="${SCRIPT_DIR}/../dist-ide"

echo "========================================"
echo " Building OpenGravity IDE (Chromium/Code-OSS)"
echo "========================================"

echo "--> [1/4] Building OpenGravity Agent Daemon..."
cd "${SCRIPT_DIR}/../daemon"
npm install
npm run build

echo "--> [2/4] Building OpenGravity IDE Extension..."
cd "${SCRIPT_DIR}/../extension"
npm install
npm run build

echo "--> [3/4] Preparing bundled OpenGravity resources..."
mkdir -p "${OUTPUT_DIR}/resources/app/extensions/opengravity"
mkdir -p "${OUTPUT_DIR}/resources/app/bin"

cp "${SCRIPT_DIR}/../extension/package.json" "${OUTPUT_DIR}/resources/app/extensions/opengravity/"
cp -r "${SCRIPT_DIR}/../extension/dist" "${OUTPUT_DIR}/resources/app/extensions/opengravity/"
cp -r "${SCRIPT_DIR}/../extension/media" "${OUTPUT_DIR}/resources/app/extensions/opengravity/"

cp "${SCRIPT_DIR}/../daemon/package.json" "${OUTPUT_DIR}/resources/app/bin/"
cp -r "${SCRIPT_DIR}/../daemon/dist" "${OUTPUT_DIR}/resources/app/bin/"

cp "${SCRIPT_DIR}/product.json" "${OUTPUT_DIR}/resources/app/product.json"

echo "--> [4/4] OpenGravity assets prepared successfully at: ${OUTPUT_DIR}"

