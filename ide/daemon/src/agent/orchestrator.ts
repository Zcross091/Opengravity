/**
 * OpenGravity Agent Orchestrator
 * Drives the ReAct agentic loop, tool orchestration, and multi-turn problem solving.
 */

import { ChatMessage, AgentEvent } from '../types.js';
import { ModelRouter, InferenceOptions } from '../llm/router.js';
import { ToolEngine } from '../tools/index.js';

export interface AgentRunParams {
  prompt: string;
  history?: ChatMessage[];
  options?: InferenceOptions;
  signal?: AbortSignal;
}

export class AgentOrchestrator {
  private router: ModelRouter;
  private tools: ToolEngine;
  private maxTurns: number = 10;

  constructor(router: ModelRouter, tools: ToolEngine) {
    this.router = router;
    this.tools = tools;
  }

  private buildSystemPrompt(): string {
    return `You are OpenGravity, the intelligent, autonomous AI pair programmer embedded inside OpenGravity IDE.
Your purpose is to help the developer write, debug, test, and understand code with maximum precision and efficiency.
Current Workspace Root: ${this.tools.getWorkspaceRoot()}

Guidelines:
1. Think before acting. State your plan and reasoning clearly.
2. When inspecting or editing code, use the available tools (read_file, edit_file, write_file, run_command, list_directory).
3. Always prefer exact targeted edits with edit_file over rewriting whole files.
4. When writing code, ensure clean, modern, type-safe, human-readable code.
5. You are running on free or BYOK inference. Minimize redundant tool calls and optimize token usage.`;
  }

  /**
   * Runs the agentic loop, yielding streaming events to the subscriber.
   */
  public async *run(params: AgentRunParams): AsyncGenerator<AgentEvent, void, unknown> {
    const messages: ChatMessage[] = [
      { role: 'system', content: this.buildSystemPrompt() },
      ...(params.history || []),
      { role: 'user', content: params.prompt }
    ];

    const toolSchemas = this.tools.getToolSchemas();
    let turns = 0;
    let totalFreeTokens = 0;
    let lastModelUsed = params.options?.model || 'gemini-2.0-flash';

    while (turns < this.maxTurns) {
      turns++;

      let assistantText = '';
      let pendingToolCall: { id: string; name: string; arguments: string } | null = null;
      let errorOccurred: Error | null = null;

      // Create an event queue for the streaming response
      const queue: AgentEvent[] = [];
      let streamResolve: (() => void) | null = null;
      let streamFinished = false;

      const pushEvent = (evt: AgentEvent) => {
        queue.push(evt);
        if (streamResolve) {
          streamResolve();
          streamResolve = null;
        }
      };

      const streamPromise = this.router.streamChat(
        messages,
        {
          ...(params.options || {}),
          tools: toolSchemas
        },
        {
          onChunk: (chunk) => {
            assistantText += chunk;
            pushEvent({ type: 'chunk', content: chunk });
          },
          onToolCall: (tc) => {
            pendingToolCall = tc;
          },
          onError: (err) => {
            errorOccurred = err;
            streamFinished = true;
            if (streamResolve) streamResolve();
          },
          onDone: (stats) => {
            lastModelUsed = stats.modelUsed;
            totalFreeTokens += stats.freeTokensSaved || 0;
            streamFinished = true;
            if (streamResolve) streamResolve();
          }
        },
        params.signal
      );

      // Yield events as they stream in
      while (!streamFinished || queue.length > 0) {
        if (queue.length > 0) {
          yield queue.shift()!;
        } else {
          await new Promise<void>((r) => {
            streamResolve = r;
          });
        }
      }

      await streamPromise;

      if (errorOccurred) {
        yield { type: 'error', message: (errorOccurred as Error).message };
        return;
      }

      // Record assistant's turn in conversation
      if (assistantText || pendingToolCall) {
        messages.push({
          role: 'assistant',
          content: assistantText,
          ...(pendingToolCall
            ? {
                tool_calls: [
                  {
                    id: (pendingToolCall as { id: string; name: string; arguments: string }).id,
                    type: 'function',
                    function: {
                      name: (pendingToolCall as { id: string; name: string; arguments: string }).name,
                      arguments: (pendingToolCall as { id: string; name: string; arguments: string }).arguments
                    }
                  }
                ]
              }
            : {})
        });
      }

      // If no tool call was initiated, the agent has finished answering
      if (!pendingToolCall) {
        yield {
          type: 'done',
          modelUsed: lastModelUsed,
          freeTokensSaved: totalFreeTokens
        };
        return;
      }

      const tc = pendingToolCall as { id: string; name: string; arguments: string };

      // Parse tool arguments safely
      let parsedArgs: Record<string, unknown> = {};
      try {
        parsedArgs = JSON.parse(tc.arguments || '{}');
      } catch {
        parsedArgs = { raw: tc.arguments };
      }

      yield {
        type: 'tool_start',
        toolName: tc.name,
        args: parsedArgs,
        toolCallId: tc.id
      };

      // Execute tool
      const result = await this.tools.executeTool(tc.name, parsedArgs);

      yield {
        type: 'tool_end',
        toolName: tc.name,
        output: result.output,
        toolCallId: tc.id,
        is_error: result.isError
      };

      // Append tool observation to conversation
      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        name: tc.name,
        content: result.output
      });
    }

    yield {
      type: 'done',
      modelUsed: lastModelUsed,
      freeTokensSaved: totalFreeTokens
    };
  }
}

