/**
 * ClawText Operational Memory Review Workflow
 *
 * Review system for candidates:
 * - Approve (mark as reviewed)
 * - Reject (with reason)
 * - Merge (combine with another pattern)
 * - Defer for later review
 * - Agent-facing review packets for conversational UX
 */

import { OperationalMemoryManager, OperationalMemory, Status, PatternType, Scope } from './operational.js';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Review decision
 */
export type ReviewDecision = 'approve' | 'reject' | 'merge' | 'defer';

/**
 * Review recommendation for agent-facing review packets
 */
export type ReviewRecommendation = 'approve' | 'defer' | 'reject';

/**
 * Review result
 */
export interface ReviewResult {
  patternKey: string;
  decision: ReviewDecision;
  previousStatus: Status;
  newStatus: Status;
  reason?: string;
  mergedWith?: string;
  timestamp: string;
}

/**
 * Review log entry
 */
export interface ReviewLog {
  patternKey: string;
  reviewer: string;
  decision: ReviewDecision;
  reason?: string;
  mergedWith?: string;
  timestamp: string;
  notes?: string;
}

/**
 * Agent-facing review packet item
 */
export interface ReviewPacketItem {
  rank: number;
  patternKey: string;
  type: PatternType;
  scope: Scope;
  summary: string;
  recurrenceCount: number;
  confidence: number;
  evidenceCount: number;
  deferCount: number;
  recurredAfterDeferral: boolean;
  priorityScore: number;
  issues: string[];
  suggestions: string[];
  recommendation: ReviewRecommendation;
  recommendationReason: string;
}

/**
 * Agent-facing review packet summary
 */
export interface ReviewPacketSummary {
  generatedAt: string;
  totalCandidates: number;
  shownCandidates: number;
  highPriorityCount: number;
  approveReadyCount: number;
  deferCount: number;
}

/**
 * Agent-facing review packet
 */
export interface ReviewPacket {
  summary: ReviewPacketSummary;
  items: ReviewPacketItem[];
}

export interface AgentReviewDecisionRequest {
  action: ReviewDecision;
  target: string;
  reason?: string;
  reviewer?: string;
  notes?: string;
  mergedWith?: string;
  packetLimit?: number;
}

export interface AgentReviewDecisionResponse {
  ok: boolean;
  action: ReviewDecision;
  patternKey?: string;
  message: string;
  result?: ReviewResult;
}

interface ReviewQueueItem {
  pattern: OperationalMemory;
  issues: string[];
  suggestions: string[];
}

/**
 * Operational review manager
 */
export class OperationalReviewManager {
  private memoryManager: OperationalMemoryManager;
  private workspacePath: string;
  private reviewLogPath: string;
  private reviewLog: ReviewLog[];

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath;
    this.memoryManager = new OperationalMemoryManager(workspacePath);
    this.reviewLogPath = path.join(workspacePath, 'memory', 'operational', 'review-log.json');
    this.reviewLog = [];

    this.loadReviewLog();
  }

  /**
   * Refresh memory/review state from disk so agent-owned wrappers see newly captured patterns.
   */
  private refreshState(): void {
    this.memoryManager = new OperationalMemoryManager(this.workspacePath);
    this.loadReviewLog();
  }

  /**
   * Load review log from disk
   */
  private loadReviewLog(): void {
    try {
      if (fs.existsSync(this.reviewLogPath)) {
        const data = JSON.parse(fs.readFileSync(this.reviewLogPath, 'utf8'));
        this.reviewLog = Array.isArray(data) ? data : [];
      }
    } catch (error) {
      console.error('[OperationalReview] Failed to load review log:', error);
      this.reviewLog = [];
    }
  }

  /**
   * Save review log to disk
   */
  private saveReviewLog(): void {
    try {
      const logDir = path.dirname(this.reviewLogPath);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      fs.writeFileSync(this.reviewLogPath, JSON.stringify(this.reviewLog, null, 2) + '\n');
    } catch (error) {
      console.error('[OperationalReview] Failed to save review log:', error);
    }
  }

  /**
   * Get candidates awaiting review
   */
  getCandidates(): OperationalMemory[] {
    this.refreshState();
    return this.memoryManager.getAllByStatus('candidate');
  }

  /**
   * Get pattern details for review
   */
  getReviewDetails(patternKey: string): OperationalMemory | null {
    this.refreshState();
    return this.memoryManager.get(patternKey);
  }

  /**
   * Approve a pattern (mark as reviewed)
   */
  approve(patternKey: string, reviewer: string = 'system', notes?: string): ReviewResult | null {
    this.refreshState();
    const pattern = this.memoryManager.get(patternKey);
    if (!pattern) return null;

    const previousStatus = pattern.status;
    const updated = this.memoryManager.changeStatus(patternKey, 'reviewed');

    if (updated) {
      this.logReview({
        patternKey,
        reviewer,
        decision: 'approve',
        timestamp: new Date().toISOString(),
        notes,
      });

      return {
        patternKey,
        decision: 'approve',
        previousStatus,
        newStatus: 'reviewed',
        timestamp: new Date().toISOString(),
      };
    }

    return null;
  }

  /**
   * Reject a pattern (archive with reason)
   */
  reject(patternKey: string, reason: string, reviewer: string = 'system'): ReviewResult | null {
    this.refreshState();
    const pattern = this.memoryManager.get(patternKey);
    if (!pattern) return null;

    const previousStatus = pattern.status;
    const updated = this.memoryManager.update(patternKey, {
      status: 'archived',
      evidence: [...pattern.evidence, `Rejected: ${reason}`],
    });

    if (updated) {
      this.logReview({
        patternKey,
        reviewer,
        decision: 'reject',
        reason,
        timestamp: new Date().toISOString(),
      });

      return {
        patternKey,
        decision: 'reject',
        previousStatus,
        newStatus: 'archived',
        reason,
        timestamp: new Date().toISOString(),
      };
    }

    return null;
  }

  /**
   * Defer a pattern (keep as candidate for later review)
   */
  defer(patternKey: string, reason: string, reviewer: string = 'system'): ReviewResult | null {
    this.refreshState();
    const pattern = this.memoryManager.get(patternKey);
    if (!pattern) return null;

    this.logReview({
      patternKey,
      reviewer,
      decision: 'defer',
      reason,
      timestamp: new Date().toISOString(),
    });

    return {
      patternKey,
      decision: 'defer',
      previousStatus: pattern.status,
      newStatus: pattern.status,
      reason,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Merge two patterns
   */
  merge(primaryKey: string, duplicateKey: string, reviewer: string = 'system'): ReviewResult | null {
    this.refreshState();
    const primary = this.memoryManager.get(primaryKey);
    const duplicate = this.memoryManager.get(duplicateKey);

    if (!primary || !duplicate) return null;

    const mergedEvidence = [...primary.evidence, ...duplicate.evidence].filter(
      (v, i, a) => a.indexOf(v) === i
    );

    const mergedRecurrence = primary.recurrenceCount + duplicate.recurrenceCount;

    const updated = this.memoryManager.update(primaryKey, {
      recurrenceCount: mergedRecurrence,
      evidence: mergedEvidence,
      status: 'reviewed',
      lastSeenAt: duplicate.lastSeenAt,
    });

    if (updated) {
      this.memoryManager.changeStatus(duplicateKey, 'archived');

      this.logReview({
        patternKey: primaryKey,
        reviewer,
        decision: 'merge',
        mergedWith: duplicateKey,
        timestamp: new Date().toISOString(),
        notes: `Merged recurrence: ${mergedRecurrence}, Evidence: ${mergedEvidence.length} items`,
      });

      return {
        patternKey: primaryKey,
        decision: 'merge',
        previousStatus: primary.status,
        newStatus: 'reviewed',
        mergedWith: duplicateKey,
        timestamp: new Date().toISOString(),
      };
    }

    return null;
  }

  /**
   * Apply a review decision programmatically
   */
  applyDecision(
    decision: ReviewDecision,
    patternKey: string,
    options?: {
      reviewer?: string;
      reason?: string;
      notes?: string;
      mergedWith?: string;
    }
  ): ReviewResult | null {
    const reviewer = options?.reviewer || 'system';

    switch (decision) {
      case 'approve':
        return this.approve(patternKey, reviewer, options?.notes || options?.reason);
      case 'reject':
        return this.reject(patternKey, options?.reason || 'No reason provided', reviewer);
      case 'defer':
        return this.defer(patternKey, options?.reason || 'Deferred for later review', reviewer);
      case 'merge':
        if (!options?.mergedWith) return null;
        return this.merge(patternKey, options.mergedWith, reviewer);
      default:
        return null;
    }
  }

  /**
   * Log a review action
   */
  private logReview(log: ReviewLog): void {
    this.reviewLog.push(log);
    this.saveReviewLog();
  }

  /**
   * Get review statistics
   */
  getReviewStats(): {
    totalReviews: number;
    byDecision: Record<ReviewDecision, number>;
    recentReviews: ReviewLog[];
  } {
    const byDecision: Record<ReviewDecision, number> = {
      approve: 0,
      reject: 0,
      merge: 0,
      defer: 0,
    };

    this.reviewLog.forEach((log) => {
      byDecision[log.decision]++;
    });

    return {
      totalReviews: this.reviewLog.length,
      byDecision,
      recentReviews: this.reviewLog.slice(-10),
    };
  }

  /**
   * Get review queue with details
   */
  getReviewQueueWithDetails(): ReviewQueueItem[] {
    const candidates = this.getCandidates();
    const queue: ReviewQueueItem[] = [];

    for (const pattern of candidates) {
      const issues: string[] = [];
      const suggestions: string[] = [];

      if (pattern.rootCause === 'TBD') {
        issues.push('Root cause not identified');
        suggestions.push('Investigate and document the root cause');
      }

      if (pattern.fix === 'TBD') {
        issues.push('Fix not identified');
        suggestions.push('Document the fix or workaround');
      }

      if (pattern.evidence.length === 0) {
        issues.push('No evidence collected');
        suggestions.push('Add evidence (logs, session IDs, error messages)');
      }

      if (pattern.confidence < 0.7) {
        issues.push(`Low confidence (${pattern.confidence.toFixed(2)})`);
        suggestions.push('Gather more evidence or increase recurrence');
      }

      if (pattern.recurrenceCount === 1) {
        issues.push('Single occurrence');
        suggestions.push('Wait for more occurrences or manually verify');
      }

      queue.push({ pattern, issues, suggestions });
    }

    return queue;
  }

  /**
   * Build an agent-facing review packet with ranked candidates
   */
  getReviewPacket(limit: number = 5): ReviewPacket {
    const queue = this.getReviewQueueWithDetails();
    const ranked = queue
      .map((item) => this.toPacketItem(item))
      .sort((a, b) => b.priorityScore - a.priorityScore);

    const items = ranked.slice(0, Math.max(1, limit)).map((item, idx) => ({ ...item, rank: idx + 1 }));

    const summary: ReviewPacketSummary = {
      generatedAt: new Date().toISOString(),
      totalCandidates: ranked.length,
      shownCandidates: items.length,
      highPriorityCount: ranked.filter((item) => item.priorityScore >= 60).length,
      approveReadyCount: ranked.filter((item) => item.recommendation === 'approve').length,
      deferCount: ranked.filter((item) => item.recommendation === 'defer').length,
    };

    return { summary, items };
  }

  /**
   * Get the single highest-priority review candidate
   */
  getNextReviewCandidate(): ReviewPacketItem | null {
    const packet = this.getReviewPacket(1);
    return packet.items[0] || null;
  }

  /**
   * Get previously deferred candidates that have recurred and are now approve-ready
   */
  getMaturedDeferredCandidates(limit: number = 3): ReviewPacketItem[] {
    const packet = this.getReviewPacket(50);
    return packet.items
      .filter((item) => item.deferCount > 0 && item.recurredAfterDeferral && item.recommendation === 'approve')
      .slice(0, Math.max(1, limit));
  }

  /**
   * Resolve a review target by patternKey or ranked packet number
   */
  resolveReviewTarget(target: string, packetLimit: number = 10): ReviewPacketItem | null {
    const normalized = String(target || '').trim();
    if (!normalized) return null;

    const byKey = this.getReviewDetails(normalized);
    if (byKey && byKey.status === 'candidate') {
      const packet = this.getReviewPacket(Math.max(packetLimit, 10));
      return packet.items.find((item) => item.patternKey === normalized) || this.toPacketItem({ pattern: byKey, issues: [], suggestions: [] });
    }

    const numeric = Number.parseInt(normalized.replace(/^#/, ''), 10);
    if (Number.isFinite(numeric) && numeric > 0) {
      const packet = this.getReviewPacket(Math.max(packetLimit, numeric));
      return packet.items[numeric - 1] || null;
    }

    return null;
  }

  /**
   * Agent-owned wrapper for applying review decisions without raw CLI ceremony
   */
  applyAgentDecision(request: AgentReviewDecisionRequest): AgentReviewDecisionResponse {
    const target = this.resolveReviewTarget(request.target, request.packetLimit || 10);
    if (!target) {
      return {
        ok: false,
        action: request.action,
        message: `Could not resolve review target: ${request.target}`,
      };
    }

    const result = this.applyDecision(request.action, target.patternKey, {
      reviewer: request.reviewer || 'agent',
      reason: request.reason,
      notes: request.notes,
      mergedWith: request.mergedWith,
    });

    if (!result) {
      return {
        ok: false,
        action: request.action,
        patternKey: target.patternKey,
        message: `Failed to apply ${request.action} to ${target.patternKey}`,
      };
    }

    const detail = request.reason || request.notes;
    const actionVerb = request.action === 'approve'
      ? 'approved'
      : request.action === 'reject'
        ? 'rejected'
        : request.action === 'defer'
          ? 'deferred'
          : 'merged';

    const extra = detail ? ` (${detail})` : '';

    return {
      ok: true,
      action: request.action,
      patternKey: target.patternKey,
      result,
      message: `Operational candidate ${target.patternKey} ${actionVerb}${extra}.`,
    };
  }

  /**
   * Format a concise proactive review nudge for matured deferred candidates
   */
  formatMaturedDeferredNudge(items: ReviewPacketItem[]): string {
    if (!items.length) return '';

    let output = '## Deferred Review Follow-up\n';
    output += 'The following previously deferred operational patterns have continued to recur and now look stronger:\n\n';

    items.forEach((item, idx) => {
      output += `${idx + 1}. **${item.patternKey}**\n`;
      output += `   - Summary: ${item.summary}\n`;
      output += `   - Recurrence: ${item.recurrenceCount}\n`;
      output += `   - Confidence: ${(item.confidence * 100).toFixed(0)}%\n`;
      output += `   - Deferred before: ${item.deferCount} time(s)\n`;
      output += `   - Why it matters now: ${item.recommendationReason}\n\n`;
    });

    output += 'If helpful, proactively ask the user whether they want to review/approve these candidates now.\n';
    return output;
  }

  /**
   * Format a review packet for agent-led conversational review
   */
  formatReviewPacket(packet: ReviewPacket): string {
    let output = '## Operational Review Packet\n\n';
    output += `Candidates awaiting review: ${packet.summary.totalCandidates}\n`;
    output += `Shown now: ${packet.summary.shownCandidates}\n`;
    output += `High priority: ${packet.summary.highPriorityCount}\n`;
    output += `Likely approve-ready: ${packet.summary.approveReadyCount}\n\n`;

    if (packet.items.length === 0) {
      output += 'No operational candidates need review right now.\n';
      return output;
    }

    output += 'Top candidates:\n\n';

    for (const item of packet.items) {
      output += `${item.rank}. **${item.patternKey}**\n`;
      output += `   - Summary: ${item.summary}\n`;
      output += `   - Type/Scope: ${item.type} / ${item.scope}\n`;
      output += `   - Recurrence: ${item.recurrenceCount}\n`;
      output += `   - Confidence: ${(item.confidence * 100).toFixed(0)}%\n`;
      output += `   - Evidence items: ${item.evidenceCount}\n`;
      output += `   - Recommendation: **${item.recommendation}** — ${item.recommendationReason}\n`;

      if (item.issues.length > 0) {
        output += `   - Issues:\n`;
        item.issues.forEach((issue) => {
          output += `     - ${issue}\n`;
        });
      }

      if (item.suggestions.length > 0) {
        output += `   - Suggestions:\n`;
        item.suggestions.forEach((suggestion) => {
          output += `     - ${suggestion}\n`;
        });
      }

      output += '\n';
    }

    output += 'Suggested agent workflow:\n';
    output += '1. Present the top candidates conversationally\n';
    output += '2. Ask user for approve / reject / defer decisions only where judgment is needed\n';
    output += '3. Apply backend review actions programmatically\n';
    output += '4. Keep raw CLI as admin/debug fallback only\n';

    return output;
  }

  /**
   * Generate review report (admin-facing)
   */
  generateReviewReport(): string {
    const stats = this.getReviewStats();
    const queue = this.getReviewQueueWithDetails();

    let report = '📋 Operational Memory Review Report\n';
    report += '='.repeat(60) + '\n\n';

    report += `Total reviews: ${stats.totalReviews}\n`;
    report += `  Approved: ${stats.byDecision.approve}\n`;
    report += `  Rejected: ${stats.byDecision.reject}\n`;
    report += `  Merged: ${stats.byDecision.merge}\n`;
    report += `  Deferred: ${stats.byDecision.defer}\n\n`;

    report += `Candidates awaiting review: ${queue.length}\n\n`;

    if (queue.length > 0) {
      report += 'Review Queue:\n';
      report += '-'.repeat(60) + '\n\n';

      queue.forEach((item, i) => {
        const p = item.pattern;
        report += `${i + 1}. [${p.patternKey}]\n`;
        report += `   Type: ${p.type} | Scope: ${p.scope} | Recurrence: ${p.recurrenceCount}\n`;
        report += `   Confidence: ${(p.confidence * 100).toFixed(0)}%\n`;
        report += `   Summary: ${p.summary}\n`;

        if (item.issues.length > 0) {
          report += `   Issues:\n`;
          item.issues.forEach((issue) => (report += `     - ${issue}\n`));
        }

        if (item.suggestions.length > 0) {
          report += `   Suggestions:\n`;
          item.suggestions.forEach((suggestion) => (report += `     - ${suggestion}\n`));
        }

        report += '\n';
      });
    }

    report += '='.repeat(60) + '\n';
    report += 'Actions:\n';
    report += '  npm run operational:review -- approve <patternKey>\n';
    report += '  npm run operational:review -- reject <patternKey> "<reason>"\n';
    report += '  npm run operational:review -- defer <patternKey> "<reason>"\n';
    report += '  npm run operational:review:packet -- [limit]\n';
    report += '  npm run operational:review:next\n';
    report += '  npm run operational:merge -- <primary> <duplicate>\n';

    return report;
  }

  /**
   * Convert review queue item into ranked review packet item
   */
  private toPacketItem(item: ReviewQueueItem): ReviewPacketItem {
    const { pattern, issues, suggestions } = item;
    const deferStats = this.getDeferralStats(pattern.patternKey, pattern.lastSeenAt);
    const priorityScore = this.computePriorityScore(pattern, issues, deferStats);
    const recommendation = this.recommendReviewAction(pattern, issues, deferStats);
    const recommendationReason = this.explainRecommendation(pattern, issues, recommendation, deferStats);

    return {
      rank: 0,
      patternKey: pattern.patternKey,
      type: pattern.type,
      scope: pattern.scope,
      summary: pattern.summary,
      recurrenceCount: pattern.recurrenceCount,
      confidence: pattern.confidence,
      evidenceCount: pattern.evidence.length,
      deferCount: deferStats.deferCount,
      recurredAfterDeferral: deferStats.recurredAfterDeferral,
      priorityScore,
      issues,
      suggestions,
      recommendation,
      recommendationReason,
    };
  }

  /**
   * Compute priority for ranking review candidates
   */
  private computePriorityScore(
    pattern: OperationalMemory,
    issues: string[],
    deferStats: { deferCount: number; recurredAfterDeferral: boolean }
  ): number {
    let score = 0;

    score += Math.min(pattern.recurrenceCount, 5) * 15;
    score += Math.round(pattern.confidence * 40);
    score += Math.min(pattern.evidence.length, 5) * 3;

    if (pattern.scope === 'tool' || pattern.scope === 'gateway') {
      score += 5;
    }

    if (pattern.rootCause !== 'TBD') {
      score += 8;
    } else {
      score -= 10;
    }

    if (pattern.fix !== 'TBD') {
      score += 8;
    } else {
      score -= 10;
    }

    if (deferStats.deferCount > 0) {
      score += Math.min(deferStats.deferCount, 3) * 4;
    }

    if (deferStats.recurredAfterDeferral) {
      score += 12;
    }

    score -= issues.length * 4;

    return Math.max(0, score);
  }

  /**
   * Recommend approve/defer/reject for agent-facing review
   */
  private recommendReviewAction(
    pattern: OperationalMemory,
    issues: string[],
    deferStats: { deferCount: number; recurredAfterDeferral: boolean }
  ): ReviewRecommendation {
    const isApproveReady =
      pattern.recurrenceCount >= 2 &&
      pattern.confidence >= 0.7 &&
      pattern.rootCause !== 'TBD' &&
      pattern.fix !== 'TBD' &&
      pattern.evidence.length > 0;

    if (isApproveReady) {
      return 'approve';
    }

    const maturedAfterDeferral =
      deferStats.deferCount > 0 &&
      deferStats.recurredAfterDeferral &&
      pattern.recurrenceCount >= 3 &&
      pattern.confidence >= 0.6 &&
      pattern.rootCause !== 'TBD' &&
      pattern.fix !== 'TBD' &&
      pattern.evidence.length > 0;

    if (maturedAfterDeferral) {
      return 'approve';
    }

    const isWeakPattern =
      pattern.recurrenceCount <= 1 &&
      pattern.confidence < 0.35 &&
      pattern.evidence.length === 0 &&
      issues.length >= 3;

    if (isWeakPattern) {
      return 'reject';
    }

    return 'defer';
  }

  /**
   * Explain recommendation for conversational review
   */
  private explainRecommendation(
    pattern: OperationalMemory,
    issues: string[],
    recommendation: ReviewRecommendation,
    deferStats: { deferCount: number; recurredAfterDeferral: boolean }
  ): string {
    if (recommendation === 'approve') {
      if (deferStats.deferCount > 0 && deferStats.recurredAfterDeferral) {
        return `Previously deferred ${deferStats.deferCount} time(s), but it kept recurring and now has enough weight/detail to approve.`;
      }
      return `Repeated ${pattern.recurrenceCount} times with ${(pattern.confidence * 100).toFixed(0)}% confidence and enough detail to promote into reviewed status.`;
    }

    if (recommendation === 'reject') {
      return 'Very weak pattern with too little evidence or confidence to keep in the active review queue.';
    }

    if (deferStats.deferCount > 0 && !deferStats.recurredAfterDeferral) {
      return `Deferred ${deferStats.deferCount} time(s) and has not yet accumulated enough new signal to justify approval.`;
    }

    if (issues.length > 0) {
      return `Needs more judgment/evidence before approval: ${issues.slice(0, 2).join('; ')}.`;
    }

    return 'Promising candidate, but better handled with user review before approval.';
  }

  /**
   * Get deferral history and whether the pattern has recurred since the last deferral
   */
  private getDeferralStats(
    patternKey: string,
    lastSeenAt: string
  ): { deferCount: number; recurredAfterDeferral: boolean } {
    const deferrals = this.reviewLog
      .filter((log) => log.patternKey === patternKey && log.decision === 'defer')
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    if (deferrals.length === 0) {
      return { deferCount: 0, recurredAfterDeferral: false };
    }

    const lastDeferral = deferrals[deferrals.length - 1];
    const recurredAfterDeferral = new Date(lastSeenAt).getTime() > new Date(lastDeferral.timestamp).getTime();

    return {
      deferCount: deferrals.length,
      recurredAfterDeferral,
    };
  }
}

export default OperationalReviewManager;
