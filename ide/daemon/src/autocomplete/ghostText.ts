/**
 * OpenGravity Ghost Text / Autocomplete Engine
 * Produces ultra-fast inline code suggestions as the user types.
 */

import { AutocompleteRequest, AutocompleteResponse } from '../types.js';
import { ModelRouter } from '../llm/router.js';

export class GhostTextEngine {
  private router: ModelRouter;

  constructor(router: ModelRouter) {
    this.router = router;
  }

  /**
   * Generates a context-aware inline completion.
   */
  public async getCompletion(
    req: AutocompleteRequest,
    signal?: AbortSignal
  ): Promise<AutocompleteResponse> {
    const startTime = Date.now();

    // Limit context window for speed (last 50 lines before cursor, 20 lines after)
    const prefixLines = req.prefix.split('\n');
    const suffixLines = req.suffix.split('\n');

    const boundedPrefix = prefixLines.slice(-50).join('\n');
    const boundedSuffix = suffixLines.slice(0, 20).join('\n');

    const systemPrompt = `You are a high-speed code completion engine. Return ONLY the code completion to fill in at the cursor. Do not include markdown ticks, explanations, or repeated prefix/suffix code.`;

    const userPrompt = `<file_name>${req.filePath}</file_name>
<language>${req.languageId}</language>
<prefix>
${boundedPrefix}
</prefix>
<cursor/>
<suffix>
${boundedSuffix}
</suffix>`;

    let completedText = '';
    let modelName = 'gemini-2.0-flash';

    try {
      await new Promise<void>((resolve, reject) => {
        this.router.streamChat(
          [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          {
            model: 'gemini-2.0-flash',
            temperature: 0.0,
            maxTokens: 64
          },
          {
            onChunk: (chunk) => {
              completedText += chunk;
            },
            onError: (err) => reject(err),
            onDone: (stats) => {
              modelName = stats.modelUsed;
              resolve();
            }
          },
          signal
        );
      });

      // Post-process completion: strip leading markdown backticks if any
      let cleaned = completedText.replace(/^```[a-zA-Z0-9_-]*\n?/, '').replace(/\n?```$/, '');

      // Avoid suggesting duplicate suffix lines
      if (boundedSuffix.trim() && cleaned.trim() === boundedSuffix.trim()) {
        cleaned = '';
      }

      return {
        completion: cleaned,
        provider: 'freellmapi',
        model: modelName,
        latencyMs: Date.now() - startTime
      };
    } catch {
      return {
        completion: '',
        provider: 'freellmapi',
        model: modelName,
        latencyMs: Date.now() - startTime
      };
    }
  }
}

