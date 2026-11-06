# OpenGravity IDE Automated Packaging Script (Windows PowerShell)
# Builds Code-OSS distribution with pre-bundled OpenGravity Extension and FreeLLMAPI daemon

param (
    [string]$CodeOssTag = "1.95.0",
    [string]$OutputDir = "$PSScriptRoot\..\dist-ide"
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " Building OpenGravity IDE (Chromium/Code-OSS)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# 1. Build Agent Daemon
Write-Host "--> [1/4] Building OpenGravity Agent Daemon..." -ForegroundColor Yellow
Push-Location "$PSScriptRoot\..\daemon"
npm install
npm run build
Pop-Location

# 2. Build OpenGravity Extension
Write-Host "--> [2/4] Building OpenGravity IDE Extension..." -ForegroundColor Yellow
Push-Location "$PSScriptRoot\..\extension"
npm install
npm run build
Pop-Location

# 3. Setup Dist Directory
if (!(Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

Write-Host "--> [3/4] Preparing bundled OpenGravity resources..." -ForegroundColor Yellow
$ResourcesDir = "$OutputDir\resources"
$ExtensionDistDir = "$ResourcesDir\app\extensions\opengravity"
$BinDistDir = "$ResourcesDir\app\bin"

New-Item -ItemType Directory -Path $ExtensionDistDir -Force | Out-Null
New-Item -ItemType Directory -Path $BinDistDir -Force | Out-Null

# Copy built extension
Copy-Item -Path "$PSScriptRoot\..\extension\package.json" -Destination $ExtensionDistDir -Force
Copy-Item -Path "$PSScriptRoot\..\extension\dist" -Destination $ExtensionDistDir -Recurse -Force
Copy-Item -Path "$PSScriptRoot\..\extension\media" -Destination $ExtensionDistDir -Recurse -Force

# Copy daemon
Copy-Item -Path "$PSScriptRoot\..\daemon\package.json" -Destination "$BinDistDir\package.json" -Force
Copy-Item -Path "$PSScriptRoot\..\daemon\dist" -Destination "$BinDistDir\dist" -Recurse -Force

# Copy product.json
Copy-Item -Path "$PSScriptRoot\product.json" -Destination "$ResourcesDir\app\product.json" -Force

Write-Host "--> [4/4] OpenGravity assets prepared successfully!" -ForegroundColor Green
Write-Host "Output Directory: $OutputDir"
Write-Host "To link against an existing Code-OSS / Electron binary, copy $OutputDir\resources into your target Code-OSS installation."

