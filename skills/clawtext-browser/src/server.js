/**
 * ClawText Browser — Express server
 * Self-hosted memory browser + anti-pattern manager
 */

import express from 'express';
import cors from 'cors';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { MemoryStore } from './memory-store.js';
import { AntiPatternStore } from './anti-pattern-store.js';
import { getStats as getLearningsStats } from './learnings-store.js';
import { getStats as getHygieneStats } from './hygiene-store.js';
import searchRoutes from './routes/search.js';
import antiPatternRoutes from './routes/anti-patterns.js';
import graphRoutes from './routes/graph.js';
import learningsRoutes from './routes/learnings.js';
import hygieneRoutes from './routes/hygiene.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function createServer(options = {}) {
  const memoryDir = options.memoryDir || join(process.env.HOME, '.openclaw/workspace/memory');
  const port = options.port || 3737;
  const uiDist = join(__dirname, '..', 'ui', 'dist');

  if (!existsSync(memoryDir)) {
    throw new Error(`Memory directory not found: ${memoryDir}\nRun with --memory-dir <path>`);
  }

  // Initialize data stores
  const memoryStore = new MemoryStore(memoryDir);
  const antiPatternStore = new AntiPatternStore(memoryDir);

  const app = express();
  app.use(cors());
  app.use(express.json());

  // API routes
  app.use('/api/search', searchRoutes(memoryStore));
  app.use('/api/anti-patterns', antiPatternRoutes(antiPatternStore, memoryStore));
  app.use('/api/graph', graphRoutes(memoryStore, antiPatternStore));
  app.use('/api/learnings', learningsRoutes);
  app.use('/api/hygiene', hygieneRoutes);
  app.set('memoryStore', memoryStore);

  // Health + stats
  app.get('/api/health', (req, res) => {
    res.json({
      ok: true,
      memoryDir,
      stats: memoryStore.getStats(),
      antiPatterns: antiPatternStore.getAll().length,
      learnings: getLearningsStats(),
      hygiene: getHygieneStats(),
    });
  });

  // Serve built React UI (if built)
  if (existsSync(uiDist)) {
    // Important: never cache index.html aggressively, or browsers keep booting
    // stale JS bundles after deploys. Hashed assets can be cached safely.
    app.use(express.static(uiDist, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
        } else if (/\.[a-zA-Z0-9_-]+\.(js|css)$/.test(filePath)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    }));

    app.get('*', (req, res) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.sendFile(join(uiDist, 'index.html'));
    });
  } else {
    app.get('/', (req, res) => {
      res.send(`
        <html><body style="font-family:sans-serif;padding:2rem;background:#0d1117;color:#c9d1d9">
          <h1>🧠 ClawText Browser</h1>
          <p>API is running. Build the UI with: <code>npm run build:ui</code></p>
          <p>Or run the dev server: <code>npm run dev:ui</code> (on port 5173)</p>
          <ul>
            <li><a href="/api/health" style="color:#58a6ff">GET /api/health</a></li>
            <li><a href="/api/graph" style="color:#58a6ff">GET /api/graph</a></li>
            <li><a href="/api/anti-patterns" style="color:#58a6ff">GET /api/anti-patterns</a></li>
            <li><a href="/api/search?q=RGCS" style="color:#58a6ff">GET /api/search?q=RGCS</a></li>
            <li><a href="/api/learnings?resolutionStatus=unresolved" style="color:#58a6ff">GET /api/learnings (unresolved)</a></li>
            <li><a href="/api/learnings/export/promote-ready" style="color:#58a6ff">GET /api/learnings/export/promote-ready</a></li>
          </ul>
        </body></html>
      `);
    });
  }

  return { app, memoryStore, antiPatternStore, port };
}

// Direct run
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = parseInt(process.env.PORT || '3737');
  const { app } = createServer({ port });
  const host = process.env.HOST || '127.0.0.1';
  app.listen(port, host, () => {
    console.log(`🧠 ClawText Browser running at http://${host}:${port}`);
    console.log(`   API: http://${host}:${port}/api/health`);
    console.log(`   Graph: http://localhost:${port}/api/graph`);
  });
}
