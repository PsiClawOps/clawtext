#!/usr/bin/env node

/**
 * Post-build script: Add .js extensions to all relative imports in dist/
 * Required for Node.js ESM module resolution with moduleResolution: "bundler"
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function addJsExtensions(dir) {
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      addJsExtensions(filePath);
    } else if (file.endsWith('.js') || file.endsWith('.d.ts')) {
      let content = fs.readFileSync(filePath, 'utf8');
      
      // Replace relative imports without extensions with .js
      // Matches: from './file' or from "../file" or from '../file', etc.
      const before = content;
      content = content.replace(/from\s+['"](\.[^'"]*?)(['"])/g, (match, importPath, quote) => {
        // Only add if it doesn't already have an extension
        if (!importPath.endsWith('.js') && !importPath.endsWith('.ts') && !importPath.endsWith('.json')) {
          // Resolve relative to the current file's directory to detect if it's a directory import
          const currentDir = path.dirname(filePath);
          const resolvedPath = path.resolve(currentDir, importPath);
          // If the target is a directory (index.js pattern), use /index.js
          let suffix = '.js';
          try {
            if (fs.statSync(resolvedPath).isDirectory()) {
              suffix = '/index.js';
            }
          } catch {
            // not a directory or doesn't exist — use .js (normal file import)
          }
          return `from '${importPath}${suffix}'${quote === '"' ? '"' : ''}`;
        }
        return match;
      });
      
      if (content !== before) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`✓ Updated: ${filePath}`);
      }
    }
  }
}

const distDir = path.join(__dirname, '..', 'dist');
if (fs.existsSync(distDir)) {
  console.log('Adding .js extensions to ESM imports...');
  addJsExtensions(distDir);
  console.log('Done!');
}
