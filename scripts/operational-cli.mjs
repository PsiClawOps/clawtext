#!/usr/bin/env node

/**
 * ClawText Operational Memory CLI
 * 
 * Commands:
 * - operational:status - Show operational memory statistics
 * - operational:review [approve|reject|defer] <patternKey> [reason] - Review a pattern
 * - operational:search <query> - Search operational memories
 * - operational:promote <patternKey> - Promote pattern to workspace
 * - operational:capture:error - Manually capture an error pattern
 * - operational:capture:success - Manually capture a success pattern
 * - operational:transfer-check <task> - Check for relevant operational patterns before a task
 * - operational:aggregation:stats - Show aggregation statistics
 * - operational:synthesize - Synthesize all candidates (improve quality)
 * - operational:merge:find - Find duplicate patterns
 * - operational:merge <primary> <duplicate> - Merge two patterns
 * - operational:correlate <patternKey> - Find correlated patterns
 * - operational:report - Full aggregation report
 * - operational:review:queue - Show detailed review queue
 * - operational:review:packet [limit] - Show agent-facing review packet
 * - operational:review:next - Show the highest-priority candidate
 * - operational:review:stats - Show review statistics
 */

import { OperationalMemoryManager } from '../dist/operational.js';
import { OperationalCaptureManager } from '../dist/operational-capture.js';
import { OperationalAggregationManager } from '../dist/operational-aggregation.js';
import { OperationalReviewManager } from '../dist/operational-review.js';
import { OperationalRetrievalManager } from '../dist/operational-retrieval.js';
import { OperationalPromotionManager } from '../dist/operational-promotion.js';
import { OperationalMaintenanceManager } from '../dist/operational-maintenance.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const workspacePath = process.env.HOME + '/.openclaw/workspace';

const memoryManager = new OperationalMemoryManager(workspacePath);
const captureManager = new OperationalCaptureManager(workspacePath);
const aggregationManager = new OperationalAggregationManager(workspacePath);
const reviewManager = new OperationalReviewManager(workspacePath);
const promotionManager = new OperationalPromotionManager(workspacePath);
const maintenanceManager = new OperationalMaintenanceManager(workspacePath);

const args = process.argv.slice(2);
const command = args[0];

if (!command) {
  printUsage();
  process.exit(1);
}

switch (command) {
  case 'status':
    showStatus();
    break;
  case 'review':
    if (!args[1] || !args[2]) {
      // Show review queue
      showReviewQueueDetailed();
    } else {
      // Review action
      const action = args[1];
      const patternKey = args[2];
      const reason = args.slice(3).join(' ');
      
      switch (action) {
        case 'approve':
          approvePattern(patternKey, reason);
          break;
        case 'reject':
          rejectPattern(patternKey, reason);
          break;
        case 'defer':
          deferPattern(patternKey, reason);
          break;
        default:
          console.error(`Unknown review action: ${action}`);
          console.log('Usage: npm run operational:review -- <approve|reject|defer> <patternKey> [reason]');
          process.exit(1);
      }
    }
    break;
  case 'review:queue':
    showReviewQueueDetailed();
    break;
  case 'review:packet':
    showReviewPacket(args[1]);
    break;
  case 'review:next':
    showNextReviewCandidate();
    break;
  case 'review:stats':
    showReviewStats();
    break;
  case 'review:apply':
    applyReviewDecision(args[1], args[2], args.slice(3).join(' '));
    break;
  case 'search':
    if (!args[1]) {
      console.error('Usage: npm run operational:search -- <query>');
      process.exit(1);
    }
    searchMemories(args.slice(1).join(' '));
    break;
  case 'promote':
    if (!args[1]) {
      console.error('Usage: npm run operational:promote -- <patternKey>');
      process.exit(1);
    }
    showPromotionProposal(args[1]);
    break;
  case 'promote:apply':
    if (!args[1]) {
      console.error('Usage: npm run operational:promote:apply -- <patternKey> [targetOverride] [notes]');
      process.exit(1);
    }
    applyPromotion(args[1], args[2], args.slice(3).join(' '));
    break;
  case 'capture:error':
    captureErrorInteractive();
    break;
  case 'capture:success':
    captureSuccessInteractive();
    break;
  case 'transfer-check':
    if (!args[1]) {
      console.error('Usage: npm run operational:transfer-check -- <task>');
      process.exit(1);
    }
    transferCheck(args.slice(1).join(' '));
    break;
  case 'aggregation:stats':
    showAggregationStats();
    break;
  case 'synthesize':
    synthesizeAll();
    break;
  case 'merge:find':
    findDuplicatePatterns();
    break;
  case 'merge':
    if (!args[1] || !args[2]) {
      console.error('Usage: npm run operational:merge -- <primary> <duplicate>');
      process.exit(1);
    }
    mergePatterns(args[1], args[2]);
    break;
  case 'correlate':
    if (!args[1]) {
      console.error('Usage: npm run operational:correlate -- <patternKey>');
      process.exit(1);
    }
    correlatePatterns(args[1]);
    break;
  case 'report':
    generateReport();
    break;
  case 'maintenance:status':
    showMaintenanceStatus();
    break;
  case 'maintenance:run':
    runMaintenanceJob(args[1]);
    break;
  case 'maintenance:force-due':
    forceMaintenanceDue(args[1]);
    break;
  case 'retrieval:test':
    if (!args[1]) {
      console.error('Usage: npm run operational:retrieval:test -- "<message>"');
      process.exit(1);
    }
    testRetrieval(args.slice(1).join(' '));
    break;
  case 'retrieval:health':
    showRetrievalHealth();
    break;
  default:
    console.error(`Unknown command: ${command}`);
    printUsage();
    process.exit(1);
}

function printUsage() {
  console.log(`
ClawText Operational Memory CLI

Usage: npm run operational:<command> [args]

Commands:
  operational:status              Show operational memory statistics
  operational:review              Show review queue (detailed)
  operational:review approve <key> [notes]  Approve a pattern
  operational:review reject <key> <reason>  Reject a pattern
  operational:review defer <key> <reason>   Defer review
  operational:review:queue        Show detailed review queue
  operational:review:packet [n]   Show agent-facing review packet
  operational:review:next         Show the highest-priority candidate
  operational:review:apply <action> <target> [reason]  Apply agent-owned review action
  operational:review:stats        Show review statistics
  operational:search <query>      Search operational memories
  operational:promote <key>       Show promotion proposal for a reviewed pattern
  operational:promote:apply <key> [target] [notes]  Apply promotion via agent-owned wrapper
  operational:capture:error       Interactively capture an error pattern
  operational:capture:success     Interactively capture a success pattern
  operational:transfer-check <task> Check for relevant patterns before a task
  operational:aggregation:stats   Show aggregation statistics
  operational:synthesize          Synthesize all candidates (improve quality)
  operational:merge:find          Find duplicate patterns
  operational:merge <primary> <duplicate> Merge two patterns
  operational:correlate <key>     Find correlated patterns
  operational:report              Full aggregation report
  operational:maintenance:status  Show scheduled maintenance status
  operational:maintenance:run [jobId]  Run all due jobs or a specific job
  operational:maintenance:force-due <jobId>  Force a maintenance job due now for testing

Examples:
  npm run operational:review
  npm run operational:review approve "pattern.key" "Verified and working"
  npm run operational:review reject "pattern.key" "False positive"
  npm run operational:review defer "pattern.key" "Need more evidence"
  npm run operational:review:packet -- 5
  npm run operational:review:next
  npm run operational:review:apply -- approve 1 "Looks stable now"
  npm run operational:search -- "compaction failure"
  npm run operational:promote -- "tool.exec.invalid_workdir"
  npm run operational:promote:apply -- "tool.exec.invalid_workdir"
  npm run operational:synthesize
  npm run operational:merge:find
  npm run operational:merge -- "pattern1" "pattern2"
  npm run operational:correlate -- "pattern1"
  npm run operational:report
`);
}

function showStatus() {
  const stats = memoryManager.getStats();

  console.log(`
📊 ClawText Operational Memory Status
======================================

Total patterns: ${stats.total}

By Status:
  Raw:          ${stats.byStatus.raw}
  Candidate:    ${stats.byStatus.candidate}
  Reviewed:     ${stats.byStatus.reviewed}
  Promoted:     ${stats.byStatus.promoted}
  Archived:     ${stats.byStatus.archived}

By Type:
  Error patterns:     ${stats.byType['error-pattern']}
  Anti-patterns:      ${stats.byType['anti-pattern']}
  Recovery patterns:  ${stats.byType['recovery-pattern']}
  Success patterns:   ${stats.byType['success-pattern']}
  Optimizations:      ${stats.byType['optimization']}
  Capability gaps:    ${stats.byType['capability-gap']}

By Scope:
  Tool:    ${stats.byScope.tool}
  Agent:   ${stats.byScope.agent}
  Project: ${stats.byScope.project}
  Gateway: ${stats.byScope.gateway}
  Global:  ${stats.byScope.global}

High recurrence (≥3): ${stats.highRecurrence}
`);
}

function showAggregationStats() {
  const stats = captureManager.getAggregationStats();

  console.log(`
📈 Operational Memory Aggregation Stats
========================================

Total unique signatures: ${stats.totalSignatures}
Patterns with recurrence: ${stats.patternsWithRecurrence}
Candidates awaiting review: ${stats.candidates}

Note: Patterns are auto-promoted to candidate status when they repeat (≥2 occurrences).
`);
}

function showReviewStats() {
  const stats = reviewManager.getReviewStats();

  console.log(`
📋 Operational Memory Review Statistics
========================================

Total reviews: ${stats.totalReviews}

By Decision:
  Approved: ${stats.byDecision.approve}
  Rejected: ${stats.byDecision.reject}
  Merged:   ${stats.byDecision.merge}
  Deferred: ${stats.byDecision.defer}

Recent Reviews:
`);

  if (stats.recentReviews.length === 0) {
    console.log('  No reviews yet.');
  } else {
    stats.recentReviews.forEach(log => {
      const emoji = { approve: '✅', reject: '❌', merge: '🔀', defer: '⏳' }[log.decision];
      console.log(`  ${emoji} ${log.patternKey} → ${log.decision} (${log.reviewer})`);
      if (log.reason) console.log(`     Reason: ${log.reason}`);
    });
  }
}

function showReviewQueue() {
  const candidates = memoryManager.getReviewQueue();

  if (candidates.length === 0) {
    console.log('✅ Review queue is empty. No candidates awaiting review.');
    return;
  }

  console.log(`
🔍 Review Queue - ${candidates.length} candidates awaiting review
================================================================

`);

  candidates.forEach((candidate, i) => {
    console.log(`${i + 1}. [${candidate.patternKey}]`);
    console.log(`   Type: ${candidate.type} | Scope: ${candidate.scope} | Recurrence: ${candidate.recurrenceCount}`);
    console.log(`   Summary: ${candidate.summary}`);
    console.log(`   Symptom: ${candidate.symptom}`);
    console.log(`   Root cause: ${candidate.rootCause}`);
    console.log(`   Proposed fix: ${candidate.fix}`);
    console.log(`   Confidence: ${(candidate.confidence * 100).toFixed(0)}%`);
    console.log(`   Last seen: ${candidate.lastSeenAt}`);
    console.log(`   Evidence: ${candidate.evidence.length} items`);
    console.log('');
  });

  console.log('Actions:');
  console.log('  npm run operational:review approve "<patternKey>" [notes]');
  console.log('  npm run operational:review reject "<patternKey>" "<reason>"');
  console.log('  npm run operational:review defer "<patternKey>" "<reason>"');
  console.log('  npm run operational:merge -- "<primary>" "<duplicate>"');
  console.log('');
}

function showReviewQueueDetailed() {
  const queue = reviewManager.getReviewQueueWithDetails();

  if (queue.length === 0) {
    console.log('✅ Review queue is empty. No candidates awaiting review.');
    return;
  }

  console.log(reviewManager.generateReviewReport());
}

function showReviewPacket(limitArg) {
  const parsed = Number.parseInt(limitArg || '5', 10);
  const limit = Number.isFinite(parsed) && parsed > 0 ? parsed : 5;
  const packet = reviewManager.getReviewPacket(limit);
  console.log(reviewManager.formatReviewPacket(packet));
}

function showNextReviewCandidate() {
  const next = reviewManager.getNextReviewCandidate();

  if (!next) {
    console.log('✅ No review candidates are pending right now.');
    return;
  }

  const packet = reviewManager.getReviewPacket(1);
  console.log(reviewManager.formatReviewPacket(packet));
}

function applyReviewDecision(action, target, reason) {
  if (!action || !target) {
    console.error('Usage: npm run operational:review:apply -- <approve|reject|defer|merge> <target> [reason]');
    process.exit(1);
  }

  const response = reviewManager.applyAgentDecision({
    action,
    target,
    reason,
    reviewer: 'agent',
  });

  if (!response.ok) {
    console.error(`❌ ${response.message}`);
    process.exit(1);
  }

  console.log(`✅ ${response.message}`);
}

function approvePattern(patternKey, notes) {
  const result = reviewManager.approve(patternKey, 'user', notes);
  
  if (result) {
    console.log(`✅ Pattern approved: ${patternKey}`);
    console.log(`   Status: ${result.previousStatus} → ${result.newStatus}`);
    if (notes) console.log(`   Notes: ${notes}`);
  } else {
    console.error(`❌ Failed to approve pattern: ${patternKey}`);
    process.exit(1);
  }
}

function rejectPattern(patternKey, reason) {
  if (!reason) {
    console.error('❌ Reason is required for rejection');
    console.log('Usage: npm run operational:review reject <patternKey> "<reason>"');
    process.exit(1);
  }

  const result = reviewManager.reject(patternKey, reason, 'user');
  
  if (result) {
    console.log(`❌ Pattern rejected: ${patternKey}`);
    console.log(`   Status: ${result.previousStatus} → ${result.newStatus}`);
    console.log(`   Reason: ${reason}`);
  } else {
    console.error(`❌ Failed to reject pattern: ${patternKey}`);
    process.exit(1);
  }
}

function deferPattern(patternKey, reason) {
  const result = reviewManager.defer(patternKey, reason || 'No reason provided', 'user');
  
  if (result) {
    console.log(`⏳ Pattern deferred: ${patternKey}`);
    console.log(`   Reason: ${reason || 'No reason provided'}`);
  } else {
    console.error(`❌ Failed to defer pattern: ${patternKey}`);
    process.exit(1);
  }
}

function searchMemories(query) {
  const results = memoryManager.search(query, { limit: 20 });

  if (results.length === 0) {
    console.log(`No operational memories found matching: "${query}"`);
    return;
  }

  console.log(`
🔎 Search Results - ${results.length} matches for "${query}"
============================================================

`);

  results.forEach((entry, i) => {
    const statusEmoji = {
      'raw': '📄',
      'candidate': '⏳',
      'reviewed': '✅',
      'promoted': '🌟',
      'archived': '🗄️',
    };

    console.log(`${i + 1}. ${statusEmoji[entry.status]} [${entry.patternKey}]`);
    console.log(`   Type: ${entry.type} | Scope: ${entry.scope} | Recurrence: ${entry.recurrenceCount}`);
    console.log(`   Summary: ${entry.summary}`);
    if (entry.recurrenceCount >= 3) {
      console.log(`   ⚠️  High recurrence pattern`);
    }
    console.log('');
  });

  console.log('Use "npm run operational:search -- <query> --details" for full details.');
}

function showPromotionProposal(patternKey) {
  const proposal = promotionManager.getProposal(patternKey);
  if (!proposal) {
    console.error(`❌ Could not build promotion proposal for: ${patternKey}`);
    process.exit(1);
  }

  console.log(`\n📌 Promotion Proposal\n======================\n`);
  console.log(`Pattern: ${proposal.patternKey}`);
  console.log(`Target: ${proposal.target}`);
  console.log(`Confidence: ${(proposal.confidence * 100).toFixed(0)}%`);
  if (proposal.destinationPath) {
    console.log(`Destination: ${proposal.destinationPath}`);
  }
  console.log(`Requires approval: ${proposal.requiresApproval ? 'yes' : 'no'}`);
  console.log(`\nRationale:`);
  proposal.rationale.forEach((reason) => console.log(`  - ${reason}`));
  console.log(`\nPrepared guidance snippet:`);
  console.log(proposal.snippet);
}

function applyPromotion(patternKey, targetOverride, notes) {
  const response = promotionManager.applyAgentPromotion({
    patternKey,
    targetOverride,
    notes,
    reviewer: 'agent',
    applyToDocument: true,
  });

  if (!response.ok) {
    console.error(`❌ ${response.message}`);
    process.exit(1);
  }

  console.log(`✅ ${response.message}`);
  if (response.destinationPath) {
    console.log(`   Destination: ${response.destinationPath}`);
  }
  console.log(`   Status: ${response.status}`);
}

function captureErrorInteractive() {
  console.log(`
📝 Interactive Error Pattern Capture
=====================================

This will guide you through capturing an error pattern.

Step 1: Basic Information
--------------------------
`);

  const entry = captureManager.capture({
    type: 'error-pattern',
    summary: 'Interactive error capture (placeholder)',
    symptom: 'TBD - Use programmatic capture or edit manually',
    trigger: 'TBD',
    rootCause: 'TBD',
    fix: 'TBD',
    scope: 'global',
    evidence: ['Interactive capture placeholder'],
    timestamp: new Date().toISOString(),
  });

  console.log(`
✅ Created error pattern: ${entry.patternKey}
   Status: ${entry.status}
   
Next steps:
  - Edit the YAML file to add details
  - Or use programmatic capture from hooks/wrappers
  - Run "npm run operational:review" to see it in the queue
`);
}

function captureSuccessInteractive() {
  console.log(`
📝 Interactive Success Pattern Capture
======================================

This will guide you through capturing a success pattern.

Step 1: Basic Information
--------------------------
`);

  const entry = captureManager.capture({
    type: 'success-pattern',
    summary: 'Interactive success capture (placeholder)',
    symptom: 'Workflow completed successfully',
    trigger: 'TBD',
    rootCause: 'TBD',
    fix: 'Follow this approach',
    scope: 'global',
    evidence: ['Interactive capture placeholder'],
    timestamp: new Date().toISOString(),
  });

  console.log(`
✅ Created success pattern: ${entry.patternKey}
   Status: ${entry.status}
   
Next steps:
  - Edit the YAML file to add details
  - Or use programmatic capture from hooks/wrappers
  - Run "npm run operational:review" to see it in the queue
`);
}

function transferCheck(task) {
  console.log(`
🔍 Transfer Check - "${task}"
==============================

Checking for relevant operational patterns before this task...

`);

  const relevantPatterns = memoryManager.search(task, { 
    status: 'reviewed',
    limit: 10
  });

  if (relevantPatterns.length === 0) {
    console.log('✅ No relevant operational patterns found.');
    console.log('   Proceed with confidence.');
    return;
  }

  console.log(`⚠️  Found ${relevantPatterns.length} relevant patterns to consider:\n`);

  relevantPatterns.forEach((pattern, i) => {
    console.log(`${i + 1}. [${pattern.patternKey}]`);
    console.log(`   Type: ${pattern.type} | Recurrence: ${pattern.recurrenceCount}`);
    console.log(`   Summary: ${pattern.summary}`);
    console.log(`   Fix: ${pattern.fix}`);
    console.log('');
  });

  console.log('Consider these patterns before proceeding.');
}

function synthesizeAll() {
  console.log('🔄 Synthesizing all candidates...\n');

  const results = aggregationManager.synthesizeAll();
  
  if (results.length === 0) {
    console.log('✅ No candidates to synthesize.');
    return;
  }

  let improved = 0;
  results.forEach(result => {
    if (result.improved) {
      improved++;
      console.log(`✅ ${result.patternKey}`);
      result.changes.forEach(change => console.log(`   ${change}`));
    } else {
      console.log(`- ${result.patternKey} (no changes needed)`);
    }
  });

  console.log(`\n✅ Synthesis complete: ${improved} patterns improved.`);
}

function findDuplicatePatterns() {
  console.log('🔍 Finding duplicate patterns...\n');

  const suggestions = aggregationManager.findDuplicatePatterns();
  
  if (suggestions.length === 0) {
    console.log('✅ No duplicate patterns found.');
    return;
  }

  console.log(`Found ${suggestions.length} potential duplicates:\n`);

  suggestions.forEach((suggestion, i) => {
    console.log(`${i + 1}. ${suggestion.primaryPatternKey} ← ${suggestion.duplicatePatternKey}`);
    console.log(`   Reason: ${suggestion.reason}`);
    console.log(`   Confidence: ${(suggestion.confidence * 100).toFixed(0)}%`);
    console.log('');
  });

  console.log('To merge: npm run operational:merge -- <primary> <duplicate>');
}

function mergePatterns(primaryKey, duplicateKey) {
  const primary = memoryManager.get(primaryKey);
  const duplicate = memoryManager.get(duplicateKey);

  if (!primary) {
    console.error(`Primary pattern not found: ${primaryKey}`);
    process.exit(1);
  }

  if (!duplicate) {
    console.error(`Duplicate pattern not found: ${duplicateKey}`);
    process.exit(1);
  }

  console.log(`Merging ${duplicateKey} into ${primaryKey}...`);
  console.log(`  Primary recurrence: ${primary.recurrenceCount}`);
  console.log(`  Duplicate recurrence: ${duplicate.recurrenceCount}`);

  const merged = aggregationManager.mergePatterns(primaryKey, duplicateKey);
  
  if (merged) {
    console.log(`\n✅ Merge complete!`);
    console.log(`   New recurrence: ${merged.recurrenceCount}`);
    console.log(`   Evidence items: ${merged.evidence.length}`);
    console.log(`   Duplicate archived.`);
  }
}

function correlatePatterns(patternKey) {
  console.log(`🔗 Finding correlations for ${patternKey}...\n`);

  const correlations = aggregationManager.findCorrelatedPatterns(patternKey);
  
  if (correlations.length === 0) {
    console.log('✅ No correlated patterns found.');
    return;
  }

  console.log(`Found ${correlations.length} correlations:\n`);

  correlations.forEach((corr, i) => {
    console.log(`${i + 1}. ${corr.patternKey1} ${corr.correlationType} ${corr.patternKey2}`);
    console.log(`   Confidence: ${(corr.confidence * 100).toFixed(0)}%`);
    console.log(`   ${corr.explanation}`);
    console.log('');
  });
}

function testRetrieval(message) {
  console.log(`🔍 Testing retrieval for: "${message}"\n`);

  const context = { userMessage: message };
  
  (async () => {
    try {
      const { OperationalRetrievalManager } = await import('../dist/operational-retrieval.js');
      const retrieval = new OperationalRetrievalManager(process.env.HOME + '/.openclaw/workspace');
      
      const classification = retrieval.classifyTask(context);
      const retrievalResult = await retrieval.retrieveForTask(context);
      
      console.log(`Task Classification:`);
      console.log(`  Type: ${classification.taskType}`);
      console.log(`  Confidence: ${(classification.confidence * 100).toFixed(0)}%`);
      console.log(`  Should query operational: ${classification.shouldQueryOperational}`);
      console.log(`  Reasoning: ${classification.reasoning}`);
      console.log('');
      
      console.log(`Retrieval Result:`);
      console.log(`  Patterns found: ${retrievalResult.totalPatterns}`);
      console.log(`  Injection ready: ${retrievalResult.injectionReady}`);
      
      if (retrievalResult.patterns.length > 0) {
        console.log('\nPatterns to inject:');
        const formatted = retrieval.formatForInjection(retrievalResult.patterns);
        console.log(formatted);
      } else {
        console.log('  No relevant operational patterns found.');
      }
    } catch (err) {
      console.error('Error:', err.message);
    }
  })();
}

function showRetrievalHealth() {
  (async () => {
    try {
      const { OperationalRetrievalManager } = await import('../dist/operational-retrieval.js');
      const retrieval = new OperationalRetrievalManager(process.env.HOME + '/.openclaw/workspace');
      const summary = retrieval.getHealthSummary();
      
      console.log(`
📊 Operational Retrieval Health
================================

Total reviewed patterns: ${summary.totalReviewed}
High recurrence (≥3): ${summary.highRecurrence}

By Type:
`);
      
      Object.entries(summary.byType).forEach(([type, count]) => {
        console.log(`  ${type}: ${count}`);
      });
      
      console.log('\nBy Scope:');
      Object.entries(summary.byScope).forEach(([scope, count]) => {
        console.log(`  ${scope}: ${count}`);
      });
    } catch (err) {
      console.error('Error:', err.message);
    }
  })();
}

function generateReport() {
  console.log('📊 Operational Memory Aggregation Report\n');
  console.log('='.repeat(60));
  console.log('');

  const report = aggregationManager.getAggregationReport();

  console.log(`Total candidates: ${report.totalCandidates}`);
  console.log(`Synthesized: ${report.synthesized.length} patterns`);
  console.log(`Merge suggestions: ${report.mergeSuggestions.length}`);
  console.log(`High recurrence patterns (≥3): ${report.highRecurrencePatterns.length}`);
  console.log(`Patterns needing review: ${report.patternsNeedingReview.length}`);
  console.log('');

  if (report.patternsNeedingReview.length > 0) {
    console.log('⚠️  Patterns needing review:');
    report.patternsNeedingReview.forEach(p => {
      const issues = [];
      if (p.rootCause === 'TBD') issues.push('rootCause=TBD');
      if (p.fix === 'TBD') issues.push('fix=TBD');
      if (p.recurrenceCount >= 5 && p.confidence < 0.7) issues.push('low confidence');
      console.log(`   - ${p.patternKey}: ${issues.join(', ')}`);
    });
    console.log('');
  }

  if (report.mergeSuggestions.length > 0) {
    console.log('🔀 Merge suggestions:');
    report.mergeSuggestions.forEach(s => {
      console.log(`   - ${s.primaryPatternKey} ← ${s.duplicatePatternKey} (${(s.confidence * 100).toFixed(0)}%)`);
    });
    console.log('');
  }

  console.log('='.repeat(60));
  console.log('Run "npm run operational:synthesize" to auto-improve candidates');
  console.log('Run "npm run operational:merge:find" to find duplicates');
}

function showMaintenanceStatus() {
  const status = maintenanceManager.getStatus();
  console.log(JSON.stringify(status, null, 2));
}

function runMaintenanceJob(jobId) {
  if (!jobId) {
    const results = maintenanceManager.runDueJobs();
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  const result = maintenanceManager.runJob(jobId);
  console.log(JSON.stringify(result, null, 2));
}

function forceMaintenanceDue(jobId) {
  if (!jobId) {
    console.error('Usage: npm run operational:maintenance:force-due -- <jobId>');
    process.exit(1);
  }
  maintenanceManager.forceDueNow(jobId);
  console.log(`✅ Forced maintenance job due now: ${jobId}`);
}

// Export for programmatic use
export { memoryManager, captureManager, aggregationManager, reviewManager };
