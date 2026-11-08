/**
 * OpenGravity Protocol Types
 * Defines communication between the IDE Extension (frontend) and the Agent Daemon (backend).
 */

export type ModelProvider = 'freellmapi' | 'google' | 'anthropic' | 'openai' | 'ollama' | 'custom';

export interface ProviderCredentials {
  freeLlmApiUrl?: string; // defaults to http://127.0.0.1:3001/v1 or 31415
  freeLlmApiKey?: string;
  googleApiKey?: string;
  anthropicApiKey?: string;
  openaiApiKey?: string;
  customBaseUrl?: string;
  customApiKey?: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolResult {
  tool_call_id: string;
  output: string;
  is_error?: boolean;
}

export interface AutocompleteRequest {
  prefix: string;
  suffix: string;
  filePath: string;
  languageId: string;
  line: number;
  character: number;
}

export interface AutocompleteResponse {
  completion: string;
  provider: string;
  model: string;
  latencyMs: number;
}

export interface DiffHunk {
  id: string;
  filePath: string;
  startLine: number;
  endLine: number;
  originalText: string;
  newText: string;
  status: 'pending' | 'accepted' | 'rejected';
}

export type AgentEvent =
  | { type: 'chunk'; content: string }
  | { type: 'thought'; content: string }
  | { type: 'tool_start'; toolName: string; args: Record<string, unknown>; toolCallId: string }
  | { type: 'tool_end'; toolName: string; output: string; toolCallId: string; is_error?: boolean }
  | { type: 'diff_proposed'; diff: DiffHunk }
  | { type: 'done'; totalTokens?: number; modelUsed: string; freeTokensSaved?: number }
  | { type: 'error'; message: string };

export interface ClientRequest {
  id: string;
  method:
    | 'chat'
    | 'autocomplete'
    | 'abort'
    | 'updateCredentials'
    | 'applyDiffHunk'
    | 'listModels'
    | 'getBudgetStatus'
    | 'executeAdbCommand';
  params: Record<string, unknown>;
}

export interface ServerResponse<T = unknown> {
  id: string;
  result?: T;
  error?: { code: number; message: string };
}

