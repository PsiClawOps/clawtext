/**
 * ClawText Operational Memory Promotion Workflow
 *
 * Agent-owned promotion proposal + apply flow:
 * - choose promotion targets
 * - explain why the target fits
 * - require user-discretion approval before durable guidance changes
 * - record provenance in promotion log
 */

import { OperationalMemoryManager, OperationalMemory } from './operational.js';
import { classifyDurability, DurabilityAssessment } from './durability-classifier.js';
import * as fs from 'fs';
import * as path from 'path';

export type PromotionTarget =
  | 'SOUL.md'
  | 'AGENTS.md'
  | 'TOOLS.md'
  | 'skills/clawtext/docs/OPERATIONAL_LEARNING.md'
  | 'project-docs';

export interface PromotionProposal {
  patternKey: string;
  target: PromotionTarget;
  confidence: number;
  rationale: string[];
  requiresApproval: boolean;
  destinationPath?: string;
  snippet: string;
}

export interface PromotionLogEntry {
  patternKey: string;
  target: PromotionTarget | string;
  destinationPath?: string;
  reviewer: string;
  timestamp: string;
  notes?: string;
}

export interface AgentPromotionApplyRequest {
  patternKey: string;
  reviewer?: string;
  notes?: string;
  targetOverride?: string;
  applyToDocument?: boolean;
}

export interface AgentPromotionApplyResponse {
  ok: boolean;
  patternKey: string;
  target?: PromotionTarget | string;
  destinationPath?: string;
  message: string;
  status?: string;
  wroteDocument?: boolean;
}

export class OperationalPromotionManager {
  private memoryManager: OperationalMemoryManager;
  private workspacePath: string;
  private promotionLogPath: string;

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath;
    this.memoryManager = new OperationalMemoryManager(workspacePath);
    this.promotionLogPath = path.join(workspacePath, 'memory', 'operational', 'promotion-log.json');
  }

  private refreshState(): void {
    this.memoryManager = new OperationalMemoryManager(this.workspacePath);
  }

  private isDurabilityClassifierEnabled(): boolean {
    return process.env.CLAWTEXT_DURABILITY_CLASSIFIER_ENABLED === 'true';
  }

  getProposal(patternKey: string): PromotionProposal | null {
    this.refreshState();
    const entry = this.memoryManager.get(patternKey);
    if (!entry) return null;
    if (entry.status !== 'reviewed' && entry.status !== 'promoted') return null;

    const target = this.selectTarget(entry);
    const destinationPath = this.resolveDestinationPath(target);
    const durability = this.isDurabilityClassifierEnabled() ? classifyDurability(entry) : null;
    const rationale = this.buildRationale(entry, target, durability);
    const confidence = this.computeProposalConfidence(entry, target, durability);
    const snippet = this.buildSnippet(entry, target);

    return {
      patternKey: entry.patternKey,
      target,
      confidence,
      rationale,
      requiresApproval: true,
      destinationPath,
      snippet,
    };
  }

  applyAgentPromotion(request: AgentPromotionApplyRequest): AgentPromotionApplyResponse {
    this.refreshState();
    const proposal = this.getProposal(request.patternKey);
    if (!proposal) {
      return {
        ok: false,
        patternKey: request.patternKey,
        message: `Could not build promotion proposal for ${request.patternKey}`,
      };
    }

    const reviewer = request.reviewer || 'agent';
    const target = request.targetOverride || proposal.target;
    const destinationPath = request.targetOverride || proposal.destinationPath;
    const applyToDocument = request.applyToDocument !== false;

    let wroteDocument = false;
    if (applyToDocument) {
      if (!destinationPath || target === 'project-docs') {
        return {
          ok: false,
          patternKey: proposal.patternKey,
          target,
          message: `Promotion target ${target} needs an explicit destination path before document write.`,
        };
      }
      this.appendSnippet(destinationPath, proposal.snippet);
      wroteDocument = true;
    }

    const promoted = this.memoryManager.promote(proposal.patternKey, String(target));
    if (!promoted) {
      return {
        ok: false,
        patternKey: proposal.patternKey,
        target,
        destinationPath,
        message: `Failed to mark ${proposal.patternKey} as promoted.`,
      };
    }

    this.logPromotion({
      patternKey: proposal.patternKey,
      target,
      destinationPath,
      reviewer,
      timestamp: new Date().toISOString(),
      notes: request.notes,
    });

    return {
      ok: true,
      patternKey: proposal.patternKey,
      target,
      destinationPath,
      wroteDocument,
      status: promoted.status,
      message: `Promoted ${proposal.patternKey} -> ${target}${wroteDocument ? ' and wrote guidance snippet' : ''}.`,
    };
  }

  private selectTarget(entry: OperationalMemory): PromotionTarget {
    const text = `${entry.patternKey} ${entry.summary} ${entry.symptom} ${entry.trigger} ${entry.rootCause} ${entry.fix}`.toLowerCase();
    const clawtextKeywords = ['clawtext', 'rag', 'cluster', 'memory', 'ingest', 'retrieval', 'operational'];

    if (entry.scope === 'tool') return 'TOOLS.md';
    if (entry.scope === 'agent' || entry.scope === 'gateway') return 'AGENTS.md';
    if (entry.scope === 'project') {
      if (clawtextKeywords.some((kw) => text.includes(kw))) {
        return 'skills/clawtext/docs/OPERATIONAL_LEARNING.md';
      }
      return 'project-docs';
    }
    if (clawtextKeywords.some((kw) => text.includes(kw))) {
      return 'skills/clawtext/docs/OPERATIONAL_LEARNING.md';
    }
    return 'SOUL.md';
  }

  private buildRationale(
    entry: OperationalMemory,
    target: PromotionTarget,
    durability?: DurabilityAssessment | null
  ): string[] {
    const reasons: string[] = [];
    reasons.push(`Scope ${entry.scope} maps naturally to ${target}.`);
    reasons.push(`Pattern is ${entry.status}, so it is stable enough for promotion review.`);
    reasons.push(`Recurrence ${entry.recurrenceCount} with confidence ${(entry.confidence * 100).toFixed(0)}% supports durable guidance.`);

    if (target === 'TOOLS.md') reasons.push('This is a tool-specific gotcha or workflow rule.');
    if (target === 'AGENTS.md') reasons.push('This affects agent/gateway behavior or operational workflow.');
    if (target === 'SOUL.md') reasons.push('This reads as a durable behavioral principle.');
    if (target === 'skills/clawtext/docs/OPERATIONAL_LEARNING.md') reasons.push('This belongs in ClawText operational learning documentation.');
    if (target === 'project-docs') reasons.push('This is project-specific and should land in the relevant project docs.');

    if (durability) {
      reasons.push(`Durability classifier: ${durability.label} (${(durability.score * 100).toFixed(0)}%).`);
      durability.reasons.slice(0, 2).forEach((r) => reasons.push(`Durability note: ${r}`));
    }

    return reasons;
  }

  private computeProposalConfidence(
    entry: OperationalMemory,
    target: PromotionTarget,
    durability?: DurabilityAssessment | null
  ): number {
    let score = entry.confidence;
    if (entry.recurrenceCount >= 3) score += 0.1;
    if (entry.rootCause !== 'TBD') score += 0.05;
    if (entry.fix !== 'TBD') score += 0.05;
    if (target !== 'project-docs') score += 0.05;
    if (durability) score += durability.adjustment;
    return Math.max(0, Math.min(1, score));
  }

  private resolveDestinationPath(target: PromotionTarget): string | undefined {
    switch (target) {
      case 'SOUL.md':
      case 'AGENTS.md':
      case 'TOOLS.md':
        return path.join(this.workspacePath, target);
      case 'skills/clawtext/docs/OPERATIONAL_LEARNING.md':
        return path.join(this.workspacePath, target);
      case 'project-docs':
      default:
        return undefined;
    }
  }

  private buildSnippet(entry: OperationalMemory, target: PromotionTarget): string {
    const start = `<!-- CLAWTEXT_PROMOTION_START ${entry.patternKey} -->`;
    const end = `<!-- CLAWTEXT_PROMOTION_END ${entry.patternKey} -->`;

    return [
      '',
      start,
      `### ${entry.summary}`,
      `- Pattern key: \`${entry.patternKey}\``,
      `- Promoted from operational learning to **${target}**`,
      `- Symptom: ${entry.symptom}`,
      `- Trigger: ${entry.trigger}`,
      `- Root cause: ${entry.rootCause}`,
      `- Guidance: ${entry.fix}`,
      `- Recurrence: ${entry.recurrenceCount}`,
      `- Confidence: ${(entry.confidence * 100).toFixed(0)}%`,
      end,
      '',
    ].join('\n');
  }

  private appendSnippet(destinationPath: string, snippet: string): void {
    const existing = fs.existsSync(destinationPath) ? fs.readFileSync(destinationPath, 'utf8') : '';
    if (existing.includes(snippet.trim())) {
      return;
    }
    fs.appendFileSync(destinationPath, snippet, 'utf8');
  }

  private logPromotion(entry: PromotionLogEntry): void {
    let current: PromotionLogEntry[] = [];
    try {
      if (fs.existsSync(this.promotionLogPath)) {
        const data = JSON.parse(fs.readFileSync(this.promotionLogPath, 'utf8'));
        current = Array.isArray(data) ? data : [];
      }
    } catch {
      current = [];
    }

    current.push(entry);
    const dir = path.dirname(this.promotionLogPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.promotionLogPath, JSON.stringify(current, null, 2) + '\n');
  }
}

export default OperationalPromotionManager;
