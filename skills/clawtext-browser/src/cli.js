#!/usr/bin/env node
/**
 * clawtext-browse — start the ClawText Browser server
 *
 * Usage:
 *   clawtext-browse                    # default port 3737
 *   clawtext-browse --port 8080
 *   clawtext-browse --memory-dir /path/to/memory
 *   clawtext-browse --host 0.0.0.0    # expose on network / Tailscale
 */

import { createServer } from './server.js';
import { join } from 'path';

const args = process.argv.slice(2);

function flag(name) {
  const idx = args.indexOf(name);
  return idx !== -1 ? args[idx + 1] : null;
}

const port = parseInt(flag('--port') || process.env.PORT || '3737');
const host = flag('--host') || process.env.HOST || '0.0.0.0';
const memoryDir = flag('--memory-dir') ||
  process.env.WORKSPACE_PATH
    ? join(process.env.WORKSPACE_PATH, 'memory')
    : join(process.env.HOME, '.openclaw', 'workspace', 'memory');

try {
  const { app } = createServer({ port, memoryDir });
  app.listen(port, host, () => {
    console.log(`🧠 ClawText Browser`);
    console.log(`   http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
    console.log(`   Memory: ${memoryDir}`);
    if (host === '0.0.0.0') {
      console.log(`   Tailscale: check your TS IP at http://<tailscale-ip>:${port}`);
    }
  });
} catch (err) {
  console.error('Failed to start:', err.message);
  process.exit(1);
}
