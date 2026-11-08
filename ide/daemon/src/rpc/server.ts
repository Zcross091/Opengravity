/**
 * OpenGravity Agent Daemon RPC Server
 * Handles WebSocket JSON-RPC communication between the IDE Extension and Daemon.
 */

import { WebSocketServer, WebSocket } from 'ws';
import { ModelRouter } from '../llm/router.js';
import { ToolEngine } from '../tools/index.js';
import { AgentOrchestrator } from '../agent/orchestrator.js';
import { GhostTextEngine } from '../autocomplete/ghostText.js';
import { AutocompleteRequest, ClientRequest } from '../types.js';

export interface ServerConfig {
  port?: number;
  host?: string;
  workspaceRoot?: string;
}

export class DaemonServer {
  private wss: WebSocketServer | null = null;
  private router: ModelRouter;
  private tools: ToolEngine;
  private orchestrator: AgentOrchestrator;
  private ghostText: GhostTextEngine;
  private port: number;
  private host: string;
  private activeRuns: Map<string, AbortController> = new Map();

  constructor(config: ServerConfig = {}) {
    this.port = config.port || 38888;
    this.host = config.host || '127.0.0.1';
    this.router = new ModelRouter();
    this.tools = new ToolEngine(config.workspaceRoot || process.cwd());
    this.orchestrator = new AgentOrchestrator(this.router, this.tools);
    this.ghostText = new GhostTextEngine(this.router);
  }

  public async start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.wss = new WebSocketServer({ port: this.port, host: this.host }, () => {
        const addr = this.wss?.address();
        const actualPort = typeof addr === 'object' && addr ? addr.port : this.port;
        this.port = actualPort;
        console.log(`[OpenGravity Daemon] Listening on ws://${this.host}:${actualPort}`);
        resolve(actualPort);
      });

      this.wss.on('error', (err) => reject(err));
      this.wss.on('connection', (ws) => this.handleConnection(ws));
    });
  }

  public async stop(): Promise<void> {
    if (this.wss) {
      for (const ctrl of this.activeRuns.values()) {
        ctrl.abort();
      }
      this.activeRuns.clear();
      await new Promise<void>((resolve) => this.wss!.close(() => resolve()));
    }
  }

  private handleConnection(ws: WebSocket) {
    ws.on('message', async (data) => {
      try {
        const msg = JSON.parse(data.toString()) as ClientRequest;
        await this.handleMessage(ws, msg);
      } catch (err: unknown) {
        ws.send(
          JSON.stringify({
            id: 'err',
            error: { code: -32700, message: `Parse error: ${(err as Error).message}` }
          })
        );
      }
    });
  }

  private async handleMessage(ws: WebSocket, req: ClientRequest) {
    switch (req.method) {
      case 'chat': {
        const abortCtrl = new AbortController();
        this.activeRuns.set(req.id, abortCtrl);

        try {
          const prompt = (req.params.prompt as string) || '';
          const history = (req.params.history as any[]) || [];
          const options = (req.params.options as any) || {};

          for await (const event of this.orchestrator.run({
            prompt,
            history,
            options,
            signal: abortCtrl.signal
          })) {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ id: req.id, event }));
            }
          }
        } finally {
          this.activeRuns.delete(req.id);
        }
        break;
      }

      case 'autocomplete': {
        const params = req.params as unknown as AutocompleteRequest;
        const result = await this.ghostText.getCompletion(params);
        ws.send(JSON.stringify({ id: req.id, result }));
        break;
      }

      case 'abort': {
        const targetId = req.params.runId as string;
        const ctrl = this.activeRuns.get(targetId);
        if (ctrl) {
          ctrl.abort();
          this.activeRuns.delete(targetId);
        }
        ws.send(JSON.stringify({ id: req.id, result: { aborted: true } }));
        break;
      }

      case 'updateCredentials': {
        this.router.updateCredentials(req.params.credentials || {});
        if (req.params.workspaceRoot) {
          this.tools.setWorkspaceRoot(req.params.workspaceRoot as string);
        }
        ws.send(JSON.stringify({ id: req.id, result: { updated: true } }));
        break;
      }

      case 'listModels': {
        const models = [
          {
            id: 'gemini-2.0-flash',
            name: 'Google Gemini 2.0 Flash (Default Free)',
            provider: 'freellmapi',
            isFree: true,
            recommendedFor: 'agent'
          },
          {
            id: 'gemini-1.5-flash',
            name: 'Google Gemini 1.5 Flash (Free)',
            provider: 'freellmapi',
            isFree: true,
            recommendedFor: 'autocomplete'
          },
          {
            id: 'claude-3-7-sonnet-20250219',
            name: 'Anthropic Claude 3.7 Sonnet (BYOK)',
            provider: 'anthropic',
            isFree: false,
            recommendedFor: 'agent'
          },
          {
            id: 'gpt-4o',
            name: 'OpenAI GPT-4o (BYOK)',
            provider: 'openai',
            isFree: false,
            recommendedFor: 'agent'
          },
          {
            id: 'gemini-2.0-pro',
            name: 'Google Gemini 2.0 Pro (BYOK)',
            provider: 'google',
            isFree: false,
            recommendedFor: 'agent'
          }
        ];
        ws.send(JSON.stringify({ id: req.id, result: { models } }));
        break;
      }

      case 'getBudgetStatus': {
        const budget = await this.router.getBudgetStatus();
        ws.send(JSON.stringify({ id: req.id, result: budget }));
        break;
      }

      case 'executeAdbCommand': {
        const toolName = req.params.tool as string;
        const toolArgs = (req.params.args as Record<string, unknown>) || {};
        try {
          const output = await this.tools.executeTool(toolName, toolArgs);
          ws.send(JSON.stringify({ id: req.id, result: { success: true, output } }));
        } catch (err: unknown) {
          ws.send(JSON.stringify({ id: req.id, error: { code: -32000, message: (err as Error).message } }));
        }
        break;
      }

      default:
        ws.send(
          JSON.stringify({
            id: req.id,
            error: { code: -32601, message: `Method not found: ${req.method}` }
          })
        );
    }
  }
}

