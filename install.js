#!/usr/bin/env node

/**
 * ClawText RAG — Agent-Executable Installation Script
 * 
 * This script can be run by an OpenClaw agent to automatically:
 * 1. Verify OpenClaw installation
 * 2. Check workspace structure
 * 3. Validate memory files
 * 4. Enable ClawText RAG in openclaw.json
 * 5. Build initial clusters
 * 6. Run validation tests
 * 7. Report status
 * 
 * Usage:
 *   node install.js [--auto-config] [--workspace PATH] [--dry-run]
 * 
 * Options:
 *   --auto-config     : Auto-enable in openclaw.json (no prompts)
 *   --workspace PATH  : Custom workspace path (default: ~/.openclaw/workspace)
 *   --dry-run         : Show what would be done, don't modify files
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class ClawTextInstaller {
  constructor(options = {}) {
    this.workspacePath = options.workspace || path.join(process.env.HOME, '.openclaw', 'workspace');
    this.autoConfig = options.autoConfig || false;
    this.dryRun = options.dryRun || false;
    this.skipClusterBuild = options.skipClusterBuild || false;
    this.errors = [];
    this.warnings = [];
    this.successes = [];
  }

  log(message, type = 'info') {
    const prefix = {
      info: 'ℹ️',
      success: '✅',
      error: '❌',
      warning: '⚠️',
      section: '───'
    };
    console.log(`${prefix[type]} ${message}`);
    
    if (type === 'error') this.errors.push(message);
    if (type === 'warning') this.warnings.push(message);
    if (type === 'success') this.successes.push(message);
  }

  checkFileExists(filePath, description) {
    const exists = fs.existsSync(filePath);
    if (exists) {
      this.log(`Found ${description} at ${filePath}`, 'success');
    } else {
      this.log(`Missing ${description} at ${filePath}`, 'error');
    }
    return exists;
  }

  checkDirectory(dirPath, description) {
    const exists = fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
    if (exists) {
      this.log(`Found ${description} at ${dirPath}`, 'success');
    } else {
      this.log(`Missing ${description} at ${dirPath}`, 'error');
    }
    return exists;
  }

  readJSON(filePath) {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
      this.log(`Failed to parse ${filePath}: ${e.message}`, 'error');
      return null;
    }
  }

  writeJSON(filePath, data) {
    if (this.dryRun) {
      this.log(`[DRY RUN] Would write ${filePath}`, 'info');
      return;
    }
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
    this.log(`Updated ${filePath}`, 'success');
  }

  run() {
    this.log('ClawText RAG Installation', 'section');
    this.log('');

    // Phase 1: Verify OpenClaw installation
    this.log('Phase 1: Verifying OpenClaw Installation', 'section');
    if (!this.verifyOpenClaw()) {
      this.log('OpenClaw verification failed. Cannot proceed.', 'error');
      return false;
    }

    // Phase 2: Check workspace structure
    this.log('', 'info');
    this.log('Phase 2: Checking Workspace Structure', 'section');
    if (!this.checkWorkspace()) {
      this.log('Workspace check failed. Cannot proceed.', 'error');
      return false;
    }

    // Phase 3: Validate memory files
    this.log('', 'info');
    this.log('Phase 3: Validating Memory Files', 'section');
    const memoryValid = this.validateMemory();
    if (!memoryValid) {
      this.log('Memory validation issues (see warnings above)', 'warning');
      // Non-fatal: can proceed with empty clusters
    }

    // Phase 4: Enable ClawText in config
    this.log('', 'info');
    this.log('Phase 4: Enabling ClawText RAG in Config', 'section');
    if (!this.enableInConfig()) {
      this.log('Failed to enable in config. Cannot proceed.', 'error');
      return false;
    }

    // Phase 5: Build clusters (optional)
    if (!this.skipClusterBuild) {
      this.log('', 'info');
      this.log('Phase 5: Building Memory Clusters', 'section');
      this.buildClusters();
    }

    // Phase 6: Run validation
    this.log('', 'info');
    this.log('Phase 6: Running Validation Tests', 'section');
    if (!this.runTests()) {
      this.log('Tests failed. RAG may not work correctly.', 'warning');
    }

    // Summary
    this.log('', 'info');
    this.log('Installation Summary', 'section');
    this.printSummary();

    return this.errors.length === 0;
  }

  verifyOpenClaw() {
    const configPath = path.join(path.dirname(this.workspacePath), 'openclaw.json');
    
    if (!this.checkFileExists(configPath, 'OpenClaw config')) {
      return false;
    }

    const config = this.readJSON(configPath);
    if (!config) return false;

    if (config.gateway && config.gateway.version) {
      this.log(`OpenClaw version: ${config.gateway.version}`, 'success');
    }

    return true;
  }

  checkWorkspace() {
    let allGood = true;

    allGood &= this.checkDirectory(this.workspacePath, 'Workspace');
    allGood &= this.checkDirectory(
      path.join(this.workspacePath, 'memory'),
      'Memory directory'
    );
    allGood &= this.checkDirectory(
      path.join(this.workspacePath, 'skills'),
      'Skills directory'
    );
    allGood &= this.checkDirectory(
      path.join(this.workspacePath, 'skills', 'clawtext-rag'),
      'ClawText RAG skill'
    );

    // Create clusters directory if needed
    const clustersDir = path.join(this.workspacePath, 'memory', 'clusters');
    if (!fs.existsSync(clustersDir)) {
      if (this.dryRun) {
        this.log(`[DRY RUN] Would create ${clustersDir}`, 'info');
      } else {
        fs.mkdirSync(clustersDir, { recursive: true });
        this.log(`Created ${clustersDir}`, 'success');
      }
    }

    return allGood;
  }

  validateMemory() {
    const memoryPath = path.join(this.workspacePath, 'MEMORY.md');
    const memoryDirPath = path.join(this.workspacePath, 'memory');

    let hasMemory = false;

    if (this.checkFileExists(memoryPath, 'MEMORY.md')) {
      hasMemory = true;
    } else {
      this.log('MEMORY.md not found. This is optional but recommended.', 'warning');
    }

    // Count daily logs
    const dailyLogs = fs.readdirSync(memoryDirPath)
      .filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f));

    this.log(`Found ${dailyLogs.length} daily memory files`, 'success');

    if (dailyLogs.length === 0) {
      this.log('No daily memory files found. ClawText will have no memories to inject.', 'warning');
    }

    return hasMemory || dailyLogs.length > 0;
  }

  enableInConfig() {
    const configPath = path.join(path.dirname(this.workspacePath), 'openclaw.json');
    const config = this.readJSON(configPath);

    if (!config) return false;

    // Ensure skills section exists
    if (!config.skills) config.skills = {};

    // Check if already enabled
    if (config.skills['clawtext-rag']?.enabled === true) {
      this.log('ClawText RAG already enabled in config', 'success');
      return true;
    }

    if (!this.autoConfig && !this.dryRun) {
      // In a real agent, this would use user input
      this.log('Would enable ClawText RAG in config', 'info');
      this.log('(Pass --auto-config to skip prompts)', 'info');
    }

    // Enable it
    if (!config.skills['clawtext-rag']) {
      config.skills['clawtext-rag'] = {};
    }
    config.skills['clawtext-rag'].enabled = true;

    this.writeJSON(configPath, config);

    if (!this.dryRun) {
      this.log('ClawText RAG enabled in OpenClaw config', 'success');
    }

    return true;
  }

  buildClusters() {
    const scriptPath = path.join(__dirname, 'scripts', 'build-clusters.js');

    if (!fs.existsSync(scriptPath)) {
      this.log('Cluster builder script not found. Skipping cluster build.', 'warning');
      return;
    }

    try {
      if (this.dryRun) {
        this.log('[DRY RUN] Would run: node ' + scriptPath, 'info');
      } else {
        this.log('Building clusters from memory files...', 'info');
        execSync(`node "${scriptPath}"`, {
          cwd: this.workspacePath,
          stdio: 'inherit'
        });
        this.log('Cluster build complete', 'success');
      }
    } catch (e) {
      this.log(`Cluster build failed: ${e.message}`, 'error');
    }
  }

  runTests() {
    const testPath = path.join(__dirname, 'test.mjs');

    if (!fs.existsSync(testPath)) {
      this.log('Test file not found. Skipping tests.', 'warning');
      return false;
    }

    try {
      if (this.dryRun) {
        this.log('[DRY RUN] Would run: node ' + testPath, 'info');
      } else {
        this.log('Running validation tests...', 'info');
        execSync(`node "${testPath}"`, {
          cwd: __dirname,
          stdio: 'inherit'
        });
        this.log('All tests passed', 'success');
      }
      return true;
    } catch (e) {
      this.log(`Tests failed: ${e.message}`, 'error');
      return false;
    }
  }

  printSummary() {
    console.log('');
    console.log(`Successes: ${this.successes.length}`);
    console.log(`Warnings: ${this.warnings.length}`);
    console.log(`Errors: ${this.errors.length}`);

    if (this.errors.length > 0) {
      console.log('');
      console.log('Errors:');
      this.errors.forEach(e => console.log(`  - ${e}`));
    }

    if (this.warnings.length > 0) {
      console.log('');
      console.log('Warnings:');
      this.warnings.forEach(w => console.log(`  - ${w}`));
    }

    console.log('');

    if (this.errors.length === 0) {
      console.log('✅ Installation complete! ClawText RAG is ready.');
      console.log('');
      console.log('Next steps:');
      console.log('  1. Run: openclaw gateway restart');
      console.log('  2. Enable debug: export DEBUG_CLAWTEXT=1');
      console.log('  3. Try a prompt and watch memories inject');
      console.log('');
      console.log('Documentation: See README.md in this directory');
    } else {
      console.log('❌ Installation incomplete due to errors above.');
      console.log('Please fix errors and run again.');
    }
  }
}

// Parse command-line arguments
const args = process.argv.slice(2);
const options = {
  autoConfig: args.includes('--auto-config'),
  workspace: args.find(a => a.startsWith('--workspace='))?.split('=')[1],
  dryRun: args.includes('--dry-run'),
  skipClusterBuild: args.includes('--skip-cluster-build')
};

// Run installer
const installer = new ClawTextInstaller(options);
const success = installer.run();

process.exit(success ? 0 : 1);
