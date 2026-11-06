#!/usr/bin/env node
/**
 * OpenGravity Agent Daemon CLI Entrypoint
 */

import { DaemonServer } from './rpc/server.js';

function parseArgs() {
  const args = process.argv.slice(2);
  let port = 38888;
  let host = '127.0.0.1';
  let workspace = process.cwd();

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' && args[i + 1]) {
      port = parseInt(args[++i], 10);
    } else if (args[i] === '--host' && args[i + 1]) {
      host = args[++i];
    } else if (args[i] === '--workspace' && args[i + 1]) {
      workspace = args[++i];
    }
  }

  return { port, host, workspace };
}

async function main() {
  const { port, host, workspace } = parseArgs();
  const server = new DaemonServer({ port, host, workspaceRoot: workspace });

  await server.start();

  const shutdown = async () => {
    console.log('\n[OpenGravity Daemon] Shutting down...');
    await server.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[OpenGravity Daemon] Fatal startup error:', err);
  process.exit(1);
});

