/**
 * OpenGravity Agent Tools
 * Executes file system, workspace search, and terminal operations safely within the workspace.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export class ToolEngine {
  private workspaceRoot: string;

  constructor(workspaceRoot: string = process.cwd()) {
    this.workspaceRoot = path.resolve(workspaceRoot);
  }

  public setWorkspaceRoot(root: string) {
    this.workspaceRoot = path.resolve(root);
  }

  public getWorkspaceRoot(): string {
    return this.workspaceRoot;
  }

  private resolveSafePath(filePath: string): string {
    const resolved = path.isAbsolute(filePath)
      ? path.resolve(filePath)
      : path.resolve(this.workspaceRoot, filePath);
    return resolved;
  }

  public getToolSchemas(): ToolDefinition[] {
    return [
      {
        type: 'function',
        function: {
          name: 'read_file',
          description: 'Read the contents of a text file in the workspace.',
          parameters: {
            type: 'object',
            properties: {
              filePath: { type: 'string', description: 'Relative or absolute file path' },
              startLine: { type: 'number', description: 'Starting line number (1-indexed)' },
              endLine: { type: 'number', description: 'Ending line number (inclusive)' }
            },
            required: ['filePath']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'write_file',
          description: 'Create a new file or completely overwrite an existing file.',
          parameters: {
            type: 'object',
            properties: {
              filePath: { type: 'string', description: 'Relative or absolute file path' },
              content: { type: 'string', description: 'Complete file contents to write' }
            },
            required: ['filePath', 'content']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'edit_file',
          description: 'Perform an exact string replacement in a file.',
          parameters: {
            type: 'object',
            properties: {
              filePath: { type: 'string', description: 'File path to modify' },
              target: { type: 'string', description: 'The exact character sequence to replace' },
              replacement: { type: 'string', description: 'The replacement string' }
            },
            required: ['filePath', 'target', 'replacement']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'run_command',
          description: 'Execute a shell or terminal command in the workspace directory.',
          parameters: {
            type: 'object',
            properties: {
              command: { type: 'string', description: 'Terminal command string to run' },
              timeoutMs: { type: 'number', description: 'Timeout in ms (default 30000)' }
            },
            required: ['command']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'list_directory',
          description: 'List contents of a directory in the workspace.',
          parameters: {
            type: 'object',
            properties: {
              dirPath: { type: 'string', description: 'Relative directory path' }
            }
          }
        }
      }
            },
        {
          type: 'function',
          function: {
            name: 'list_adb_devices',
            description: 'List connected Android devices via ADB.',
            parameters: { type: 'object', properties: {} }
          }
        },
        {
          type: 'function',
          function: {
            name: 'start_adb_app',
            description: 'Launch an Android app via ADB.',
            parameters: {
              type: 'object',
              properties: {
                packageName: { type: 'string', description: 'Android package name (e.g., com.example.app)' },
                activity: { type: 'string', description: 'Activity to launch (e.g., .MainActivity)' }
              },
              required: ['packageName', 'activity']
            }
          }
        },
        {
          type: 'function',
          function: {
            name: 'pull_adb_file',
            description: 'Pull a file from an Android device using ADB.',
            parameters: {
              type: 'object',
              properties: {
                remotePath: { type: 'string', description: 'Path on device, e.g., /sdcard/file.txt' },
                localPath: { type: 'string', description: 'Destination path on host machine' }
              },
              required: ['remotePath', 'localPath']
            }
          }
        }
      ];
  }

  public async executeTool(
    name: string,
    args: Record<string, unknown>
  ): Promise<{ output: string; isError?: boolean }> {
    try {
      switch (name) {
        case 'read_file': {
          const filePath = this.resolveSafePath(args.filePath as string);
          const content = await fs.readFile(filePath, 'utf-8');
          const lines = content.split('\n');

          const start = args.startLine ? Math.max(1, args.startLine as number) - 1 : 0;
          const end = args.endLine ? Math.min(lines.length, args.endLine as number) : lines.length;
          const sliced = lines.slice(start, end).join('\n');
          return { output: sliced };
        }

        case 'write_file': {
          const filePath = this.resolveSafePath(args.filePath as string);
          await fs.mkdir(path.dirname(filePath), { recursive: true });
          await fs.writeFile(filePath, args.content as string, 'utf-8');
          return { output: `Successfully wrote ${filePath}` };
        }

        case 'edit_file': {
          const filePath = this.resolveSafePath(args.filePath as string);
          const content = await fs.readFile(filePath, 'utf-8');
          const target = args.target as string;
          const replacement = args.replacement as string;

          if (!content.includes(target)) {
            return {
              isError: true,
              output: `Target block not found in ${path.basename(filePath)}. Please ensure the target string matches character-for-character.`
            };
          }

          const updated = content.replace(target, replacement);
          await fs.writeFile(filePath, updated, 'utf-8');
          return { output: `Successfully updated ${path.basename(filePath)}` };
        }

        case 'run_command': {
          const cmd = args.command as string;
          const timeout = (args.timeoutMs as number) || 30000;
          const { stdout, stderr } = await execAsync(cmd, {
            cwd: this.workspaceRoot,
            timeout,
            maxBuffer: 10 * 1024 * 1024
          });
          const out = [stdout, stderr].filter(Boolean).join('\n');
          return { output: out || '(Command completed with no output)' };
        }

        case 'list_directory': {
          const dirPath = this.resolveSafePath((args.dirPath as string) || '.');
          const entries = await fs.readdir(dirPath, { withFileTypes: true });
          const formatted = entries
            .map((e) => `${e.isDirectory() ? '[DIR] ' : '[FILE]'} ${e.name}`)
            .join('\n');
          return { output: formatted || '(empty directory)' };
        }

        default:
          return { isError: true, output: `Unknown tool: ${name}` };
      }
    } catch (err: unknown) {
      return { isError: true, output: (err as Error).message };
    }
  }
}

