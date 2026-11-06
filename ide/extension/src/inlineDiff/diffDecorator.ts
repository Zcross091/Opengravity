/**
 * OpenGravity Inline Diff Decorator
 * Renders inline diff highlighting and handles hunk-by-hunk review.
 */

import * as vscode from 'vscode';

export interface PendingHunk {
  id: string;
  uri: vscode.Uri;
  range: vscode.Range;
  originalText: string;
  replacementText: string;
}

export class InlineDiffManager {
  private addedDecorationType: vscode.TextEditorDecorationType;
  private pendingHunks: Map<string, PendingHunk> = new Map();

  constructor() {
    this.addedDecorationType = vscode.window.createTextEditorDecorationType({
      backgroundColor: 'rgba(46, 160, 67, 0.25)',
      isWholeLine: true,
      overviewRulerColor: 'rgba(46, 160, 67, 0.8)',
      overviewRulerLane: vscode.OverviewRulerLane.Right
    });
  }

  public registerHunk(hunk: PendingHunk) {
    this.pendingHunks.set(hunk.id, hunk);
    this.updateEditorDecorations();
    vscode.commands.executeCommand('setContext', 'opengravity.hasActiveDiff', true);
  }

  public acceptCurrentHunk() {
    const editor = vscode.window.activeTextEditor;
    if (!editor || this.pendingHunks.size === 0) return;

    // Accept first pending hunk
    const [firstId, hunk] = Array.from(this.pendingHunks.entries())[0];
    this.pendingHunks.delete(firstId);

    if (this.pendingHunks.size === 0) {
      vscode.commands.executeCommand('setContext', 'opengravity.hasActiveDiff', false);
    }
    this.updateEditorDecorations();
    vscode.window.showInformationMessage('OpenGravity: Change accepted.');
  }

  public rejectCurrentHunk() {
    const editor = vscode.window.activeTextEditor;
    if (!editor || this.pendingHunks.size === 0) return;

    const [firstId, hunk] = Array.from(this.pendingHunks.entries())[0];
    editor.edit((editBuilder) => {
      editBuilder.replace(hunk.range, hunk.originalText);
    });

    this.pendingHunks.delete(firstId);

    if (this.pendingHunks.size === 0) {
      vscode.commands.executeCommand('setContext', 'opengravity.hasActiveDiff', false);
    }
    this.updateEditorDecorations();
    vscode.window.showInformationMessage('OpenGravity: Change reverted.');
  }

  private updateEditorDecorations() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const ranges: vscode.Range[] = [];
    for (const hunk of this.pendingHunks.values()) {
      if (hunk.uri.fsPath === editor.document.uri.fsPath) {
        ranges.push(hunk.range);
      }
    }

    editor.setDecorations(this.addedDecorationType, ranges);
  }

  public dispose() {
    this.addedDecorationType.dispose();
  }
}

