/**
 * OpenGravity Hybrid Model Router
 * Integrates FreeLLMAPI's massive aggregated free token pool with first-class BYOK
 * (Google Gemini, Anthropic Claude, OpenAI, Ollama).
 */

import { ChatMessage, ModelProvider, ProviderCredentials } from '../types.js';

export interface InferenceOptions {
  model?: string;
  provider?: ModelProvider;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  tools?: Array<{
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }>;
}

export interface StreamCallbacks {
  onChunk: (chunk: string) => void;
  onToolCall?: (toolCall: { id: string; name: string; arguments: string }) => void;
  onError: (err: Error) => void;
  onDone: (stats: { modelUsed: string; freeTokensSaved?: number }) => void;
}

export class ModelRouter {
  private credentials: ProviderCredentials;

  constructor(initialCredentials: ProviderCredentials = {}) {
    this.credentials = {
      freeLlmApiUrl: initialCredentials.freeLlmApiUrl || 'http://127.0.0.1:3001/v1',
      freeLlmApiKey: initialCredentials.freeLlmApiKey || 'freellmapi-default',
      ...initialCredentials
    };
  }

  public updateCredentials(newCreds: Partial<ProviderCredentials>) {
    this.credentials = { ...this.credentials, ...newCreds };
  }

  /**
   * Resolves the target endpoint and authentication headers based on user mode.
   */
  public resolveRouting(
    requestedProvider?: ModelProvider,
    requestedModel?: string
  ): {
    endpointUrl: string;
    apiKey: string;
    model: string;
    provider: ModelProvider;
    isFreeTier: boolean;
  } {
    // 1. Direct BYOK: Google Gemini
    if (requestedProvider === 'google' && this.credentials.googleApiKey) {
      return {
        endpointUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
        apiKey: this.credentials.googleApiKey,
        model: requestedModel || 'gemini-2.0-flash',
        provider: 'google',
        isFreeTier: false
      };
    }

    // 2. Direct BYOK: Anthropic Claude
    if (requestedProvider === 'anthropic' && this.credentials.anthropicApiKey) {
      return {
        endpointUrl: 'https://api.anthropic.com/v1/messages',
        apiKey: this.credentials.anthropicApiKey,
        model: requestedModel || 'claude-3-7-sonnet-20250219',
        provider: 'anthropic',
        isFreeTier: false
      };
    }

    // 3. Direct BYOK: OpenAI
    if (requestedProvider === 'openai' && this.credentials.openaiApiKey) {
      return {
        endpointUrl: 'https://api.openai.com/v1/chat/completions',
        apiKey: this.credentials.openaiApiKey,
        model: requestedModel || 'gpt-4o',
        provider: 'openai',
        isFreeTier: false
      };
    }

    // 4. Direct BYOK: Ollama / Custom
    if (requestedProvider === 'ollama' || requestedProvider === 'custom') {
      const baseUrl = this.credentials.customBaseUrl || 'http://127.0.0.1:11434/v1';
      return {
        endpointUrl: `${baseUrl.replace(/\/$/, '')}/chat/completions`,
        apiKey: this.credentials.customApiKey || 'ollama',
        model: requestedModel || 'qwen2.5-coder:latest',
        provider: requestedProvider,
        isFreeTier: false
      };
    }

    // 5. Default: FreeLLMAPI Pool (Defaulting to Gemini 2.0 Flash on Free Tier)
    const base = (this.credentials.freeLlmApiUrl || 'http://127.0.0.1:3001/v1').replace(/\/$/, '');
    return {
      endpointUrl: `${base}/chat/completions`,
      apiKey: this.credentials.freeLlmApiKey || 'freellmapi-default',
      model: requestedModel || 'gemini-2.0-flash',
      provider: 'freellmapi',
      isFreeTier: true
    };
  }

  /**
   * Executes streaming inference across the selected model endpoint.
   */
  public async streamChat(
    messages: ChatMessage[],
    options: InferenceOptions,
    callbacks: StreamCallbacks,
    signal?: AbortSignal
  ): Promise<void> {
    const route = this.resolveRouting(options.provider, options.model);

    // If Anthropic direct wire format is used
    if (route.provider === 'anthropic') {
      return this.streamAnthropicDirect(route, messages, options, callbacks, signal);
    }

    // Standard OpenAI-compatible format (FreeLLMAPI, Google OpenAI-adapter, OpenAI, Ollama)
    return this.streamOpenAICompatible(route, messages, options, callbacks, signal);
  }

  private async streamOpenAICompatible(
    route: { endpointUrl: string; apiKey: string; model: string; isFreeTier: boolean },
    messages: ChatMessage[],
    options: InferenceOptions,
    callbacks: StreamCallbacks,
    signal?: AbortSignal
  ): Promise<void> {
    try {
      const payload: Record<string, unknown> = {
        model: route.model,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
          ...(m.name ? { name: m.name } : {}),
          ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
          ...(m.tool_calls ? { tool_calls: m.tool_calls } : {})
        })),
        stream: true,
        temperature: options.temperature ?? 0.2,
        ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
        ...(options.tools && options.tools.length > 0 ? { tools: options.tools } : {})
      };

      const response = await fetch(route.endpointUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${route.apiKey}`
        },
        body: JSON.stringify(payload),
        signal
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Inference API error (${response.status}): ${errorText}`);
      }

      if (!response.body) {
        throw new Error('Response body is empty');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let pendingToolCall: { id: string; name: string; arguments: string } | null = null;
      let approxTokens = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) continue;
          if (trimmed === 'data: [DONE]') continue;

          try {
            const data = JSON.parse(trimmed.slice(5).trim());
            const choice = data.choices?.[0];
            if (!choice) continue;

            const delta = choice.delta;
            if (delta?.content) {
              approxTokens += Math.ceil(delta.content.length / 4);
              callbacks.onChunk(delta.content);
            }

            if (delta?.tool_calls && delta.tool_calls.length > 0) {
              const tc = delta.tool_calls[0];
              if (!pendingToolCall) {
                pendingToolCall = {
                  id: tc.id || `call_${Date.now()}`,
                  name: tc.function?.name || '',
                  arguments: tc.function?.arguments || ''
                };
              } else {
                if (tc.function?.arguments) {
                  pendingToolCall.arguments += tc.function.arguments;
                }
              }
            }
          } catch {
            // Ignore parse errors on individual SSE frames
          }
        }
      }

      if (pendingToolCall && callbacks.onToolCall) {
        callbacks.onToolCall(pendingToolCall);
      }

      callbacks.onDone({
        modelUsed: route.model,
        freeTokensSaved: route.isFreeTier ? approxTokens : 0
      });
    } catch (err: unknown) {
      if ((err as Error).name === 'AbortError') return;
      callbacks.onError(err as Error);
    }
  }

  private async streamAnthropicDirect(
    route: { endpointUrl: string; apiKey: string; model: string; isFreeTier: boolean },
    messages: ChatMessage[],
    options: InferenceOptions,
    callbacks: StreamCallbacks,
    signal?: AbortSignal
  ): Promise<void> {
    try {
      // Split system message from conversation
      const systemMessage = messages.find((m) => m.role === 'system')?.content || '';
      const chatMessages = messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content
        }));

      const payload = {
        model: route.model,
        system: systemMessage,
        messages: chatMessages,
        max_tokens: options.maxTokens || 4096,
        stream: true,
        temperature: options.temperature ?? 0.2
      };

      const response = await fetch(route.endpointUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': route.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(payload),
        signal
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Anthropic API error (${response.status}): ${errorText}`);
      }

      if (!response.body) throw new Error('Response body is null');

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let approxTokens = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const jsonStr = trimmed.slice(5).trim();
          try {
            const event = JSON.parse(jsonStr);
            if (event.type === 'content_block_delta' && event.delta?.text) {
              approxTokens += Math.ceil(event.delta.text.length / 4);
              callbacks.onChunk(event.delta.text);
            }
          } catch {
            // ignore SSE parse errors
          }
        }
      }

      callbacks.onDone({
        modelUsed: route.model,
        freeTokensSaved: 0
      });
    } catch (err: unknown) {
      if ((err as Error).name === 'AbortError') return;
      callbacks.onError(err as Error);
    }
  }
}

