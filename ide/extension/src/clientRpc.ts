/**
 * OpenGravity RPC Client
 * Communicates over WebSocket with the local OpenGravity Agent Daemon (opengravity-agentd).
 */

import * as vscode from 'vscode';
import WebSocket from 'ws';

export interface AgentEvent {
  type: 'chunk' | 'thought' | 'tool_start' | 'tool_end' | 'diff_proposed' | 'done' | 'error';
  content?: string;
  toolName?: string;
  args?: Record<string, unknown>;
  output?: string;
  toolCallId?: string;
  is_error?: boolean;
  message?: string;
  modelUsed?: string;
  freeTokensSaved?: number;
}

export class DaemonClient {
  private ws: WebSocket | null = null;
  private port: number;
  private pendingRequests: Map<string, { resolve: (res: any) => void; reject: (err: any) => void }> = new Map();
  private eventHandlers: Map<string, (event: AgentEvent) => void> = new Map();
  private isConnecting: boolean = false;

  constructor(port: number = 38888) {
    this.port = port;
  }

  public setPort(port: number) {
    this.port = port;
    this.reconnect();
  }

  public async connect(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;
    if (this.isConnecting) return;

    this.isConnecting = true;

    return new Promise((resolve) => {
      try {
        this.ws = new WebSocket(`ws://127.0.0.1:${this.port}`);

        this.ws.on('open', () => {
          this.isConnecting = false;
          console.log(`[OpenGravity] Connected to agent daemon on port ${this.port}`);
          this.syncCredentials();
          resolve();
        });

        this.ws.on('message', (data: WebSocket.Data) => {
          try {
            const parsed = JSON.parse(data.toString());
            if (parsed.event && this.eventHandlers.has(parsed.id)) {
              this.eventHandlers.get(parsed.id)!(parsed.event);
            } else if (parsed.id && this.pendingRequests.has(parsed.id)) {
              const { resolve, reject } = this.pendingRequests.get(parsed.id)!;
              this.pendingRequests.delete(parsed.id);
              if (parsed.error) {
                reject(new Error(parsed.error.message));
              } else {
                resolve(parsed.result);
              }
            }
          } catch (e) {
            console.error('[OpenGravity] Malformed daemon response', e);
          }
        });

        this.ws.on('close', () => {
          this.isConnecting = false;
          this.ws = null;
          // Reconnect after 3 seconds
          setTimeout(() => this.connect().catch(() => {}), 3000);
        });

        this.ws.on('error', () => {
          this.isConnecting = false;
          this.ws = null;
          resolve(); // don't reject so caller continues
        });
      } catch {
        this.isConnecting = false;
        resolve();
      }
    });
  }

  public reconnect() {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
    this.connect();
  }

  public syncCredentials() {
    const config = vscode.workspace.getConfiguration('opengravity');
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    this.send('updateCredentials', {
      workspaceRoot,
      credentials: {
        freeLlmApiUrl: config.get<string>('freeLlmUrl'),
        freeLlmApiKey: config.get<string>('freeLlmApiKey'),
        googleApiKey: config.get<string>('geminiApiKey'),
        anthropicApiKey: config.get<string>('anthropicApiKey'),
        openaiApiKey: config.get<string>('openaiApiKey')
      }
    }).catch(() => {});
  }

  public async send<T = any>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    await this.connect();
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('OpenGravity Daemon is offline. Please ensure opengravity-agentd is running.');
    }

    const id = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.ws!.send(JSON.stringify({ id, method, params }));
    });
  }

  public async startChat(
    prompt: string,
    history: any[],
    options: any,
    onEvent: (event: AgentEvent) => void
  ): Promise<string> {
    await this.connect();
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('OpenGravity Daemon is offline.');
    }

    const id = `chat_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    this.eventHandlers.set(id, (event) => {
      onEvent(event);
      if (event.type === 'done' || event.type === 'error') {
        this.eventHandlers.delete(id);
      }
    });

    this.ws.send(
      JSON.stringify({
        id,
        method: 'chat',
        params: { prompt, history, options }
      })
    );

    return id;
  }

  public abortRun(runId: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ id: `abort_${Date.now()}`, method: 'abort', params: { runId } }));
    }
  }

  public async getAutocomplete(params: {
    prefix: string;
    suffix: string;
    filePath: string;
    languageId: string;
    line: number;
    character: number;
  }): Promise<{ completion: string; latencyMs: number }> {
    return this.send('autocomplete', params);
  }

  public async getBudgetStatus(): Promise<{
    usedTokens: number;
    totalBudget: number;
    percentage: number;
    poolName: string;
    isFree: boolean;
  }> {
    return this.send('getBudgetStatus');
  }

  public async executeAdb(tool: string, args: Record<string, unknown> = {}): Promise<string> {
    const res = await this.send<{ success: boolean; output: string }>('executeAdbCommand', { tool, args });
    return res.output;
  }
}

