/**
 * OpenGravity VS Code / Code-OSS Extension Entrypoint
 */

import * as vscode from 'vscode';
import { DaemonClient } from './clientRpc';
import { OpenGravityInlineCompletionProvider } from './autocomplete/inlineProvider';
import { InlineDiffManager } from './inlineDiff/diffDecorator';
import { OpenGravityWebviewProvider } from './views/chatWebview';

let client: DaemonClient;
let diffManager: InlineDiffManager;

export async function activate(context: vscode.ExtensionContext) {
  console.log('[OpenGravity] Activating OpenGravity IDE Extension...');

  const config = vscode.workspace.getConfiguration('opengravity');
  const port = config.get<number>('serverPort', 38888);

  client = new DaemonClient(port);
  diffManager = new InlineDiffManager();

  // Connect to the local agent daemon
  await client.connect();

  // 1. Register Webview Sidebar
  const webviewProvider = new OpenGravityWebviewProvider(client);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('opengravity.chatView', webviewProvider)
  );

  // 2. Register Inline Completion Provider (Ghost Text / Supercomplete)
  const inlineProvider = new OpenGravityInlineCompletionProvider(client);
  context.subscriptions.push(
    vscode.languages.registerInlineCompletionItemProvider({ pattern: '**' }, inlineProvider)
  );

  // 3. Register Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('opengravity.openChat', () => {
      vscode.commands.executeCommand('opengravity.chatView.focus');
    }),

    vscode.commands.registerCommand('opengravity.inlineDiff.acceptHunk', () => {
      diffManager.acceptCurrentHunk();
    }),

    vscode.commands.registerCommand('opengravity.inlineDiff.rejectHunk', () => {
      diffManager.rejectCurrentHunk();
    }),

    vscode.commands.registerCommand('opengravity.openSettings', () => {
      vscode.commands.executeCommand('workbench.action.openSettings', 'opengravity');
    }),

    vscode.commands.registerCommand('opengravity.toggleGhostText', async () => {
      const cfg = vscode.workspace.getConfiguration('opengravity');
      const current = cfg.get<boolean>('enableGhostText', true);
      await cfg.update('enableGhostText', !current, vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage(
        `OpenGravity Ghost Text: ${!current ? 'Enabled' : 'Disabled'}`
      );
    })
  );

  // 4. Configuration Change Listener
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('opengravity')) {
        client.syncCredentials();
      }
    })
  );

  context.subscriptions.push(diffManager);
  console.log('[OpenGravity] OpenGravity activated successfully.');
}

export function deactivate() {
  if (diffManager) diffManager.dispose();
}

