# 🌌 OpenGravity IDE

**Open-source, AI-native IDE built from Chromium & Code-OSS, powered by FreeLLMAPI's 7.4 billion free token pool and direct Bring-Your-Own-Key (BYOK) high-end APIs.**

---

## Overview

OpenGravity brings the full autonomous pair-programming experience of Antigravity and Cursor to the open-source community:
- **Massive Free Token Pool**: Leverages [FreeLLMAPI](https://freellmapi.co) to aggregate 34 free provider tiers into an OpenAI-compatible endpoint. Out-of-the-box, it defaults to **Google Gemini 2.0 Flash** for fast reasoning, multi-file planning, and massive 1M context windows at zero inference cost.
- **Direct High-End BYOK Support**: Developers with paid API keys for **Google Gemini Pro/Ultra**, **Anthropic Claude 3.5/3.7 Sonnet & Opus**, **OpenAI GPT-4o/o1/o3**, or local **Ollama** models can plug their keys straight into OpenGravity settings.
- **Ultra-Fast Ghost Text (Supercomplete)**: Instant inline code predictions powered by low-latency streaming models, accepting completions with `Tab`.
- **Inline Diff Review**: AI code modifications stream into the Monaco editor with hunk-by-hunk `Alt+Enter` (Accept) and `Alt+Shift+Enter` (Reject).
- **Decoupled Agent Daemon Architecture**: The UI extension connects over WebSocket/JSON-RPC to `opengravity-agentd`, keeping the editor snappy and responsive.

---

## Repository Structure

```
ide/
├── daemon/               # OpenGravity Agent Hub (background daemon)
│   ├── src/
│   │   ├── agent/        # ReAct agent loop (multi-step planning & tools)
│   │   ├── autocomplete/ # Ghost text inline completion engine
│   │   ├── llm/          # Hybrid Model Router (FreeLLMAPI + BYOK)
│   │   ├── rpc/          # WebSocket JSON-RPC server
│   │   ├── tools/        # Safe file read/write/edit and terminal execution
│   │   └── index.ts      # Daemon CLI (opengravity-agentd)
│   └── package.json
│
├── extension/            # VS Code / Code-OSS Extension
│   ├── src/
│   │   ├── autocomplete/ # InlineCompletionItemProvider
│   │   ├── inlineDiff/   # Monaco editor diff decorator & hunk reviewer
│   │   ├── views/        # Webview sidebar chat & token usage gauge
│   │   ├── clientRpc.ts  # Daemon WebSocket client
│   │   └── extension.ts  # Extension entrypoint
│   └── package.json
│
└── build/                # Standalone Code-OSS Packaging
    ├── product.json      # OpenGravity branding & Open VSX gallery config
    ├── package-ide.ps1   # Windows packaging script
    └── package-ide.sh    # macOS & Linux packaging script
```

---

## Quick Start (Development)

### 1. Start FreeLLMAPI (The Token Aggregator)
From the repository root:
```bash
npm run dev -w server
```
This runs the FreeLLMAPI router on `http://127.0.0.1:3001/v1`.

### 2. Start OpenGravity Agent Daemon
```bash
cd ide/daemon
npm install
npm run dev
```
The daemon starts listening on `ws://127.0.0.1:38888`.

### 3. Run the OpenGravity Extension
```bash
cd ide/extension
npm install
npm run build
```
Press `F5` in VS Code / Antigravity to launch an Extension Development Host with OpenGravity enabled.

---

## Building the Standalone OpenGravity IDE

To produce a full standalone distribution (like Cursor or Antigravity):

### On Windows:
```powershell
.\ide\build\package-ide.ps1
```

### On macOS / Linux:
```bash
bash ./ide/build/package-ide.sh
```

This bundles Code-OSS with:
1. `resources/app/product.json` (OpenGravity branding & Open VSX gallery).
2. `resources/app/extensions/opengravity` (Pre-installed AI sidebar & autocomplete).
3. `resources/app/bin/opengravity-agentd` (Local AI background service).

---

## Configuration Settings

| Setting | Default | Description |
|---|---|---|
| `opengravity.serverPort` | `38888` | Port for the local background agent daemon |
| `opengravity.freeLlmUrl` | `http://127.0.0.1:3001/v1` | FreeLLMAPI proxy URL |
| `opengravity.defaultModel` | `gemini-2.0-flash` | Default reasoning model |
| `opengravity.enableGhostText` | `true` | Enable real-time inline ghost-text code completions |
| `opengravity.geminiApiKey` | `""` | Optional direct Google AI Studio API key (BYOK) |
| `opengravity.anthropicApiKey` | `""` | Optional direct Anthropic Claude API key (BYOK) |
| `opengravity.openaiApiKey` | `""` | Optional direct OpenAI API key (BYOK) |

