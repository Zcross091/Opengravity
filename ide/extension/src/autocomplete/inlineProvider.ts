/**
 * OpenGravity Inline Completion Provider (Ghost Text)
 * Feeds predictive completions to VS Code / Monaco as the user types.
 */

import * as vscode from 'vscode';
import { DaemonClient } from '../clientRpc';

export class OpenGravityInlineCompletionProvider implements vscode.InlineCompletionItemProvider {
  private client: DaemonClient;
  private debounceTimer: NodeJS.Timeout | null = null;
  private abortController: AbortController | null = null;

  constructor(client: DaemonClient) {
    this.client = client;
  }

  public async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken
  ): Promise<vscode.InlineCompletionList | vscode.InlineCompletionItem[] | undefined> {
    const config = vscode.workspace.getConfiguration('opengravity');
    if (!config.get<boolean>('enableGhostText', true)) {
      return undefined;
    }

    if (token.isCancellationRequested) return undefined;

    // Fast debounce: 60ms delay
    await new Promise((resolve) => setTimeout(resolve, 60));
    if (token.isCancellationRequested) return undefined;

    const fullText = document.getText();
    const offset = document.offsetAt(position);
    const prefix = fullText.substring(0, offset);
    const suffix = fullText.substring(offset);

    // Don't autocomplete if the line is purely whitespace unless user explicitly requested
    const linePrefix = document.lineAt(position.line).text.substring(0, position.character);
    if (!linePrefix.trim() && context.triggerKind !== vscode.InlineCompletionTriggerKind.Invoke) {
      return undefined;
    }

    try {
      const res = await this.client.getAutocomplete({
        prefix,
        suffix,
        filePath: document.uri.fsPath,
        languageId: document.languageId,
        line: position.line,
        character: position.character
      });

      if (token.isCancellationRequested || !res.completion) {
        return undefined;
      }

      const item = new vscode.InlineCompletionItem(
        res.completion,
        new vscode.Range(position, position)
      );

      return [item];
    } catch {
      return undefined;
    }
  }
}

