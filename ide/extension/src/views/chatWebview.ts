/**
 * OpenGravity Agent Sidebar Webview Provider
 * Renders the interactive AI pair programmer interface.
 */

import * as vscode from 'vscode';
import { DaemonClient, AgentEvent } from '../clientRpc';

export class OpenGravityWebviewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private client: DaemonClient;
  private history: Array<{ role: string; content: string }> = [];
  private currentRunId: string | null = null;
  private freeTokensSavedTotal: number = 0;

  constructor(client: DaemonClient) {
    this.client = client;
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: []
    };

    webviewView.webview.html = this.getHtml();

    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case 'sendMessage':
          await this.handleUserMessage(data.text, data.model);
          break;
        case 'abort':
          if (this.currentRunId) {
            this.client.abortRun(this.currentRunId);
            this.currentRunId = null;
            this.postMessage({ type: 'status', text: 'Operation cancelled.' });
          }
          break;
        case 'openSettings':
          vscode.commands.executeCommand('workbench.action.openSettings', 'opengravity');
          break;
      }
    });
  }

  private postMessage(msg: any) {
    this._view?.webview.postMessage(msg);
  }

  private async handleUserMessage(prompt: string, selectedModel: string) {
    if (!prompt.trim()) return;

    this.history.push({ role: 'user', content: prompt });
    this.postMessage({ type: 'userMessage', text: prompt });

    let assistantAccumulator = '';

    try {
      this.currentRunId = await this.client.startChat(
        prompt,
        this.history.slice(0, -1),
        { model: selectedModel },
        (event: AgentEvent) => {
          switch (event.type) {
            case 'chunk':
              assistantAccumulator += event.content || '';
              this.postMessage({ type: 'chunk', text: event.content });
              break;
            case 'tool_start':
              this.postMessage({
                type: 'toolStart',
                toolName: event.toolName,
                args: event.args
              });
              break;
            case 'tool_end':
              this.postMessage({
                type: 'toolEnd',
                toolName: event.toolName,
                output: event.output,
                isError: event.is_error
              });
              break;
            case 'done':
              this.currentRunId = null;
              if (event.freeTokensSaved) {
                this.freeTokensSavedTotal += event.freeTokensSaved;
              }
              this.history.push({ role: 'assistant', content: assistantAccumulator });
              this.postMessage({
                type: 'done',
                modelUsed: event.modelUsed,
                freeTokensTotal: this.freeTokensSavedTotal
              });
              break;
            case 'error':
              this.currentRunId = null;
              this.postMessage({ type: 'error', message: event.message });
              break;
          }
        }
      );
    } catch (err: unknown) {
      this.currentRunId = null;
      this.postMessage({ type: 'error', message: (err as Error).message });
    }
  }

  private getHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    :root {
      --bg: var(--vscode-editor-background);
      --fg: var(--vscode-editor-foreground);
      --accent: #4285F4;
      --card-bg: var(--vscode-editorWidget-background, #1e1e1e);
      --border: var(--vscode-widget-border, #333);
      --badge-free: #34A853;
      --badge-byok: #FABB05;
    }
    body {
      font-family: var(--vscode-font-family, system-ui, sans-serif);
      margin: 0;
      padding: 12px;
      background: var(--bg);
      color: var(--fg);
      display: flex;
      flex-direction: column;
      height: 100vh;
      box-sizing: border-box;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--border);
    }
    .title {
      font-weight: bold;
      font-size: 14px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .badge-pool {
      background: rgba(52, 168, 83, 0.2);
      color: var(--badge-free);
      font-size: 11px;
      padding: 2px 6px;
      border-radius: 4px;
      font-weight: 600;
    }
    .model-selector {
      margin-top: 8px;
      display: flex;
      gap: 6px;
    }
    select {
      flex: 1;
      background: var(--card-bg);
      color: var(--fg);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 4px 8px;
      font-size: 12px;
    }
    .chat-container {
      flex: 1;
      overflow-y: auto;
      margin: 10px 0;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .message {
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 13px;
      line-height: 1.4;
      word-break: break-word;
    }
    .message.user {
      background: rgba(66, 133, 244, 0.15);
      border-left: 3px solid var(--accent);
      align-self: flex-end;
      width: 90%;
    }
    .message.assistant {
      background: var(--card-bg);
      border: 1px solid var(--border);
      align-self: flex-start;
      width: 96%;
    }
    .tool-box {
      background: rgba(0,0,0,0.25);
      border-left: 2px solid #9B51E0;
      padding: 4px 8px;
      margin: 4px 0;
      font-family: monospace;
      font-size: 11px;
      border-radius: 2px;
    }
    .footer {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    textarea {
      width: 100%;
      height: 60px;
      box-sizing: border-box;
      background: var(--card-bg);
      color: var(--fg);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 8px;
      resize: none;
      font-family: inherit;
      font-size: 13px;
    }
    textarea:focus {
      outline: 1px solid var(--accent);
    }
    .btn-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .btn {
      background: var(--accent);
      color: white;
      border: none;
      border-radius: 4px;
      padding: 6px 14px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
    }
    .btn:hover {
      opacity: 0.9;
    }
    .btn-stop {
      background: #ea4335;
      display: none;
    }
    .stats-bar {
      font-size: 10px;
      color: #888;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="title">
      <span>🌌 OpenGravity</span>
      <span class="badge-pool">7.4B Free Pool</span>
    </div>
    <div class="stats-bar" id="statsBar">Saved: 0 tokens</div>
  </div>

  <div class="model-selector">
    <select id="modelSelect">
      <option value="gemini-2.0-flash">Google Gemini 2.0 Flash (Free)</option>
      <option value="gemini-1.5-flash">Google Gemini 1.5 Flash (Free)</option>
      <option value="claude-3-7-sonnet-20250219">Anthropic Claude 3.7 Sonnet (BYOK)</option>
      <option value="gpt-4o">OpenAI GPT-4o (BYOK)</option>
      <option value="gemini-2.0-pro">Google Gemini 2.0 Pro (BYOK)</option>
    </select>
  </div>

  <div class="chat-container" id="chat">
    <div class="message assistant">
      👋 Welcome to <b>OpenGravity</b>! Powered by FreeLLMAPI's aggregated pool (defaulting to Google Gemini 2.0 Flash) and direct BYOK paid APIs. Ask me to write, explain, test, or refactor code!
    </div>
  </div>

  <div class="footer">
    <textarea id="promptInput" placeholder="Ask OpenGravity (Ctrl+Enter to send)..."></textarea>
    <div class="btn-row">
      <button class="btn btn-stop" id="btnStop">Stop</button>
      <button class="btn" id="btnSend">Send (Ctrl+Enter)</button>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const chat = document.getElementById('chat');
    const input = document.getElementById('promptInput');
    const btnSend = document.getElementById('btnSend');
    const btnStop = document.getElementById('btnStop');
    const modelSelect = document.getElementById('modelSelect');
    const statsBar = document.getElementById('statsBar');

    let currentAssistantDiv = null;

    function appendMessage(role, text) {
      const div = document.createElement('div');
      div.className = 'message ' + role;
      div.innerText = text;
      chat.appendChild(div);
      chat.scrollTop = chat.scrollHeight;
      return div;
    }

    function appendToolBox(name, text) {
      const box = document.createElement('div');
      box.className = 'tool-box';
      box.innerText = '⚙️ ' + name + ': ' + text;
      chat.appendChild(box);
      chat.scrollTop = chat.scrollHeight;
    }

    function send() {
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      btnStop.style.display = 'block';
      vscode.postMessage({
        type: 'sendMessage',
        text: text,
        model: modelSelect.value
      });
    }

    btnSend.addEventListener('click', send);
    btnStop.addEventListener('click', () => {
      vscode.postMessage({ type: 'abort' });
      btnStop.style.display = 'none';
    });

    input.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        send();
      }
    });

    window.addEventListener('message', (event) => {
      const msg = event.data;
      switch (msg.type) {
        case 'userMessage':
          appendMessage('user', msg.text);
          currentAssistantDiv = appendMessage('assistant', '');
          break;
        case 'chunk':
          if (currentAssistantDiv) {
            currentAssistantDiv.innerText += msg.text;
            chat.scrollTop = chat.scrollHeight;
          }
          break;
        case 'toolStart':
          appendToolBox(msg.toolName, JSON.stringify(msg.args || {}));
          break;
        case 'toolEnd':
          appendToolBox(msg.toolName, 'Completed' + (msg.isError ? ' (Error)' : ''));
          break;
        case 'done':
          btnStop.style.display = 'none';
          currentAssistantDiv = null;
          if (msg.freeTokensTotal) {
            statsBar.innerText = 'Saved: ~' + msg.freeTokensTotal.toLocaleString() + ' free tokens (' + msg.modelUsed + ')';
          }
          break;
        case 'error':
          btnStop.style.display = 'none';
          appendMessage('assistant', '⚠️ Error: ' + msg.message);
          currentAssistantDiv = null;
          break;
      }
    });
  </script>
</body>
</html>`;
  }
}

