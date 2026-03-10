/**
 * ClawText Scheduled Maintenance / Review Orchestration
 *
 * Agent-owned maintenance layer:
 * - schedule review digests and operational health checks
 * - detect due jobs
 * - run jobs programmatically
 * - log cadence + results for later agent surfacing
 */

import * as fs from 'fs';
import * as path from 'path';
import OperationalReviewManager from './operational-review.js';
import OperationalRetrievalManager from './operational-retrieval.js';
import { OperationalMemoryManager } from './operational.js';

export type MaintenanceJobId =
  | 'review-digest'
  | 'candidate-backlog'
  | 'operational-health';

export interface MaintenanceScheduleEntry {
  id: MaintenanceJobId;
  enabled: boolean;
  cadenceHours: number;
  lastRunAt?: string;
  nextRunAt?: string;
  requiresApproval: boolean;
  description: string;
}

export interface MaintenanceRunResult {
  id: MaintenanceJobId;
  ranAt: string;
  ok: boolean;
  summary: string;
  detailsPath?: string;
  nextRunAt?: string;
}

export interface MaintenanceStatus {
  generatedAt: string;
  dueNow: MaintenanceScheduleEntry[];
  upcoming: MaintenanceScheduleEntry[];
  schedule: MaintenanceScheduleEntry[];
}

export class OperationalMaintenanceManager {
  private workspacePath: string;
  private schedulePath: string;
  private runLogPath: string;
  private reportsDir: string;
  private reviewManager: OperationalReviewManager;
  private retrievalManager: OperationalRetrievalManager;
  private memoryManager: OperationalMemoryManager;

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath;
    this.schedulePath = path.join(workspacePath, 'memory', 'operational', 'maintenance-schedule.json');
    this.runLogPath = path.join(workspacePath, 'memory', 'operational', 'maintenance-run-log.json');
    this.reportsDir = path.join(workspacePath, 'memory', 'operational', 'maintenance-reports');
    this.reviewManager = new OperationalReviewManager(workspacePath);
    this.retrievalManager = new OperationalRetrievalManager(workspacePath);
    this.memoryManager = new OperationalMemoryManager(workspacePath);

    this.ensureDirs();
    this.ensureDefaultSchedule();
  }

  private ensureDirs(): void {
    const dirs = [
      path.dirname(this.schedulePath),
      this.reportsDir,
    ];
    dirs.forEach((dir) => {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    });
  }

  private ensureDefaultSchedule(): void {
    if (fs.existsSync(this.schedulePath)) return;

    const defaults: MaintenanceScheduleEntry[] = [
      {
        id: 'review-digest' as MaintenanceJobId,
        enabled: true,
        cadenceHours: 24,
        requiresApproval: false,
        description: 'Generate a concise operational review digest for agent-led review surfacing.',
      },
      {
        id: 'candidate-backlog' as MaintenanceJobId,
        enabled: true,
        cadenceHours: 12,
        requiresApproval: true,
        description: 'Check whether candidate backlog is building up enough to warrant a user review prompt.',
      },
      {
        id: 'operational-health' as MaintenanceJobId,
        enabled: true,
        cadenceHours: 24,
        requiresApproval: false,
        description: 'Generate an operational health summary for the self-improvement lane.',
      },
    ].map((entry) => this.withNextRun(entry));

    fs.writeFileSync(this.schedulePath, JSON.stringify(defaults, null, 2) + '\n');
  }

  private readSchedule(): MaintenanceScheduleEntry[] {
    this.ensureDefaultSchedule();
    const data = JSON.parse(fs.readFileSync(this.schedulePath, 'utf8'));
    return Array.isArray(data) ? data : [];
  }

  private writeSchedule(schedule: MaintenanceScheduleEntry[]): void {
    fs.writeFileSync(this.schedulePath, JSON.stringify(schedule, null, 2) + '\n');
  }

  private readRunLog(): MaintenanceRunResult[] {
    if (!fs.existsSync(this.runLogPath)) return [];
    const data = JSON.parse(fs.readFileSync(this.runLogPath, 'utf8'));
    return Array.isArray(data) ? data : [];
  }

  private writeRunLog(log: MaintenanceRunResult[]): void {
    fs.writeFileSync(this.runLogPath, JSON.stringify(log, null, 2) + '\n');
  }

  private withNextRun(entry: MaintenanceScheduleEntry): MaintenanceScheduleEntry {
    const base = entry.lastRunAt ? new Date(entry.lastRunAt).getTime() : Date.now();
    const nextRunAt = new Date(base + entry.cadenceHours * 3600 * 1000).toISOString();
    return { ...entry, nextRunAt };
  }

  getStatus(now: Date = new Date()): MaintenanceStatus {
    const schedule = this.readSchedule().map((entry) => this.withNextRun(entry));
    const nowMs = now.getTime();

    const dueNow = schedule.filter((entry) => entry.enabled && entry.nextRunAt && new Date(entry.nextRunAt).getTime() <= nowMs);
    const upcoming = schedule.filter((entry) => entry.enabled && entry.nextRunAt && new Date(entry.nextRunAt).getTime() > nowMs)
      .sort((a, b) => new Date(a.nextRunAt || 0).getTime() - new Date(b.nextRunAt || 0).getTime());

    return {
      generatedAt: now.toISOString(),
      dueNow,
      upcoming,
      schedule,
    };
  }

  setLastRun(id: MaintenanceJobId, when: string): void {
    const schedule = this.readSchedule().map((entry) => {
      if (entry.id !== id) return entry;
      return this.withNextRun({ ...entry, lastRunAt: when });
    });
    this.writeSchedule(schedule);
  }

  forceDueNow(id: MaintenanceJobId): void {
    const oldTime = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    this.setLastRun(id, oldTime);
  }

  runDueJobs(limit: number = 10): MaintenanceRunResult[] {
    const status = this.getStatus();
    return status.dueNow.slice(0, limit).map((entry) => this.runJob(entry.id));
  }

  runJob(id: MaintenanceJobId): MaintenanceRunResult {
    switch (id) {
      case 'review-digest':
        return this.runReviewDigest();
      case 'candidate-backlog':
        return this.runCandidateBacklogCheck();
      case 'operational-health':
        return this.runOperationalHealth();
      default:
        return {
          id,
          ranAt: new Date().toISOString(),
          ok: false,
          summary: `Unknown maintenance job: ${id}`,
        };
    }
  }

  private runReviewDigest(): MaintenanceRunResult {
    const packet = this.reviewManager.getReviewPacket(5);
    const content = this.reviewManager.formatReviewPacket(packet);
    const reportPath = path.join(this.reportsDir, `review-digest-${Date.now()}.md`);
    fs.writeFileSync(reportPath, content, 'utf8');

    const summary = packet.summary.totalCandidates > 0
      ? `Review digest generated with ${packet.summary.totalCandidates} candidate(s); ${packet.summary.approveReadyCount} approve-ready.`
      : 'Review digest generated; no review candidates pending.';

    return this.completeRun('review-digest', summary, reportPath);
  }

  private runCandidateBacklogCheck(): MaintenanceRunResult {
    const packet = this.reviewManager.getReviewPacket(10);
    const candidates = packet.summary.totalCandidates;
    const highPriority = packet.summary.highPriorityCount;
    const approveReady = packet.summary.approveReadyCount;

    const content = [
      '# Candidate Backlog Check',
      '',
      `Generated: ${new Date().toISOString()}`,
      `Candidates: ${candidates}`,
      `High priority: ${highPriority}`,
      `Approve-ready: ${approveReady}`,
      '',
      this.reviewManager.formatReviewPacket(packet),
    ].join('\n');

    const reportPath = path.join(this.reportsDir, `candidate-backlog-${Date.now()}.md`);
    fs.writeFileSync(reportPath, content, 'utf8');

    const summary = candidates === 0
      ? 'Backlog check complete; no review candidates pending.'
      : `Backlog check complete; ${candidates} candidate(s), ${highPriority} high priority, ${approveReady} approve-ready.`;

    return this.completeRun('candidate-backlog', summary, reportPath);
  }

  private runOperationalHealth(): MaintenanceRunResult {
    const retrievalHealth = this.retrievalManager.getHealthSummary();
    const memoryStats = this.memoryManager.getStats();

    const content = [
      '# Operational Health Report',
      '',
      `Generated: ${new Date().toISOString()}`,
      '',
      '## Retrieval Health',
      `Reviewed patterns: ${retrievalHealth.totalReviewed}`,
      `High recurrence reviewed patterns: ${retrievalHealth.highRecurrence}`,
      '',
      '## Operational Memory Stats',
      `Total patterns: ${memoryStats.total}`,
      `Candidates: ${memoryStats.byStatus.candidate}`,
      `Reviewed: ${memoryStats.byStatus.reviewed}`,
      `Promoted: ${memoryStats.byStatus.promoted}`,
      `Archived: ${memoryStats.byStatus.archived}`,
      '',
      '## Scope Breakdown',
      ...Object.entries(memoryStats.byScope).map(([scope, count]) => `- ${scope}: ${count}`),
    ].join('\n');

    const reportPath = path.join(this.reportsDir, `operational-health-${Date.now()}.md`);
    fs.writeFileSync(reportPath, content, 'utf8');

    const summary = `Operational health generated; ${memoryStats.byStatus.candidate} candidate(s), ${memoryStats.byStatus.reviewed} reviewed, ${memoryStats.byStatus.promoted} promoted.`;

    return this.completeRun('operational-health', summary, reportPath);
  }

  private completeRun(id: MaintenanceJobId, summary: string, detailsPath: string): MaintenanceRunResult {
    const ranAt = new Date().toISOString();
    this.setLastRun(id, ranAt);
    const refreshed = this.readSchedule().find((entry) => entry.id === id);

    const result: MaintenanceRunResult = {
      id,
      ranAt,
      ok: true,
      summary,
      detailsPath,
      nextRunAt: refreshed?.nextRunAt,
    };

    const log = this.readRunLog();
    log.push(result);
    this.writeRunLog(log);
    return result;
  }
}

export default OperationalMaintenanceManager;
