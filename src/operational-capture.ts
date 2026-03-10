/**
 * ClawText Operational Memory Capture Pipeline
 * 
 * Captures operational events from various sources:
 * - Tool failures
 * - Command failures
 * - Gateway issues
 * - Health degradations
 * - Manual entry
 * 
 * Automatically aggregates repeating patterns into candidates.
 */

import { OperationalMemoryManager, OperationalMemory, PatternType, Scope } from './operational.js';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Captured event data
 */
export interface CapturedEvent {
  type: PatternType;
  summary: string;
  symptom: string;
  trigger: string;
  rootCause?: string;
  fix?: string;
  scope: Scope;
  evidence: string[];
  metadata?: Record<string, any>;
  timestamp?: string;
}

/**
 * Pattern signature for grouping similar events
 */
export interface PatternSignature {
  type: PatternType;
  scope: Scope;
  symptomHash: string;
  triggerPattern: string;
}

/**
 * Operational capture manager
 */
export class OperationalCaptureManager {
  private memoryManager: OperationalMemoryManager;
  private workspacePath: string;
  private aggregationThreshold: number;
  private signatureIndex: Map<string, string[]>; // signature → patternKeys

  constructor(workspacePath: string, aggregationThreshold: number = 3) {
    this.workspacePath = workspacePath;
    this.memoryManager = new OperationalMemoryManager(workspacePath);
    this.aggregationThreshold = aggregationThreshold;
    this.signatureIndex = new Map();
    
    this.loadSignatureIndex();
  }

  /**
   * Load signature index from disk
   */
  private loadSignatureIndex(): void {
    try {
      const indexPath = path.join(this.workspacePath, 'memory', 'operational', 'signatures.json');
      if (fs.existsSync(indexPath)) {
        const data = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
        this.signatureIndex = new Map(Object.entries(data));
      }
    } catch (error) {
      console.error('[OperationalCapture] Failed to load signature index:', error);
      this.signatureIndex = new Map();
    }
  }

  /**
   * Save signature index to disk
   */
  private saveSignatureIndex(): void {
    try {
      const indexPath = path.join(this.workspacePath, 'memory', 'operational', 'signatures.json');
      const data = Object.fromEntries(this.signatureIndex);
      fs.writeFileSync(indexPath, JSON.stringify(data, null, 2) + '\n');
    } catch (error) {
      console.error('[OperationalCapture] Failed to save signature index:', error);
    }
  }

  /**
   * Generate pattern signature for grouping similar events
   */
  private generateSignature(event: CapturedEvent): PatternSignature {
    // Use error type and scope as primary grouping, not specific trigger details
    // This ensures similar errors get grouped regardless of minor trigger variations
    const symptomHash = this.simpleHash(event.symptom.split('\n')[0].slice(0, 50)); // First line only
    
    return {
      type: event.type,
      scope: event.scope,
      symptomHash,
      triggerPattern: event.type, // Use type instead of trigger for grouping
    };
  }

  /**
   * Simple hash function for pattern grouping
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).slice(0, 8);
  }

  /**
   * Capture an operational event
   */
  capture(event: CapturedEvent): OperationalMemory {
    const signature = this.generateSignature(event);
    const signatureKey = this.signatureToString(signature);

    // Check if this signature already has a pattern
    const existingKeys = this.signatureIndex.get(signatureKey) || [];
    
    let memory: OperationalMemory;

    if (existingKeys.length > 0) {
      // Increment recurrence on the primary (first) pattern
      const primaryKey = existingKeys[0];
      const updated = this.memoryManager.incrementRecurrence(primaryKey);
      
      if (updated) {
        memory = updated;
        // Auto-promote to candidate if recurrence >= 2
        if (memory.recurrenceCount >= 2 && memory.status === 'raw') {
          const promoted = this.memoryManager.changeStatus(memory.patternKey, 'candidate');
          if (promoted) {
            memory = promoted;
            console.log(`[OperationalCapture] Pattern "${memory.patternKey}" promoted to candidate (recurrence: ${memory.recurrenceCount})`);
          }
        }
      } else {
        // Fallback: create new if increment fails
        memory = this.memoryManager.create(this.eventToMemory(event, 'raw'));
        existingKeys.push(memory.patternKey);
        this.signatureIndex.set(signatureKey, existingKeys);
        this.saveSignatureIndex();
      }
    } else {
      // Create new raw entry
      memory = this.memoryManager.create(this.eventToMemory(event, 'raw'));
      
      // Index the signature
      this.signatureIndex.set(signatureKey, [memory.patternKey]);
      this.saveSignatureIndex();
    }

    return memory;
  }

  /**
   * Convert event to memory entry
   */
  private eventToMemory(event: CapturedEvent, status: 'raw' | 'candidate'): OperationalMemory {
    const now = new Date().toISOString();
    
    return {
      patternKey: '', // Will be generated by manager
      type: event.type,
      summary: event.summary,
      symptom: event.symptom,
      trigger: event.trigger,
      rootCause: event.rootCause || 'TBD',
      fix: event.fix || 'TBD',
      scope: event.scope,
      confidence: 0.5,
      recurrenceCount: 1,
      firstSeenAt: event.timestamp || now,
      lastSeenAt: event.timestamp || now,
      status,
      evidence: event.evidence,
      relatedPatterns: [],
      tags: [],
      id: '',
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Convert signature to string key
   */
  private signatureToString(signature: PatternSignature): string {
    return `${signature.type}.${signature.scope}.${signature.symptomHash}.${signature.triggerPattern}`;
  }

  /**
   * Capture tool failure
   */
  captureToolFailure(
    toolName: string,
    error: Error | string,
    context?: {
      inputs?: Record<string, any>;
      workdir?: string;
      sessionId?: string;
    }
  ): OperationalMemory {
    const errorMessage = typeof error === 'string' ? error : error.message;
    
    const event: CapturedEvent = {
      type: 'error-pattern',
      summary: `Tool ${toolName} failed`,
      symptom: errorMessage,
      trigger: `Tool ${toolName} called${context?.workdir ? ` with workdir ${context.workdir}` : ''}`,
      rootCause: 'TBD',
      fix: 'TBD',
      scope: 'tool',
      evidence: [
        `Tool: ${toolName}`,
        `Error: ${errorMessage}`,
        context?.sessionId ? `Session: ${context.sessionId}` : '',
        context?.inputs ? `Inputs: ${JSON.stringify(context.inputs)}` : '',
      ].filter(Boolean),
      timestamp: new Date().toISOString(),
    };

    return this.capture(event);
  }

  /**
   * Capture command failure
   */
  captureCommandFailure(
    command: string,
    error: Error | string,
    context?: {
      workdir?: string;
      exitCode?: number;
      sessionId?: string;
    }
  ): OperationalMemory {
    const errorMessage = typeof error === 'string' ? error : error.message;
    
    const event: CapturedEvent = {
      type: 'error-pattern',
      summary: `Command "${command}" failed`,
      symptom: errorMessage,
      trigger: `Executed command "${command}"${context?.workdir ? ` in ${context.workdir}` : ''}`,
      rootCause: 'TBD',
      fix: 'TBD',
      scope: 'agent',
      evidence: [
        `Command: ${command}`,
        `Error: ${errorMessage}`,
        context?.exitCode ? `Exit code: ${context.exitCode}` : '',
        context?.sessionId ? `Session: ${context.sessionId}` : '',
      ].filter(Boolean),
      timestamp: new Date().toISOString(),
    };

    return this.capture(event);
  }

  /**
   * Capture gateway/compaction failure
   */
  captureGatewayIssue(
    issueType: string,
    error: Error | string,
    context?: {
      contextSize?: number;
      sessionId?: string;
    }
  ): OperationalMemory {
    const errorMessage = typeof error === 'string' ? error : error.message;
    
    const event: CapturedEvent = {
      type: 'error-pattern',
      summary: `Gateway ${issueType} issue`,
      symptom: errorMessage,
      trigger: `Gateway ${issueType} operation${context?.contextSize ? ` with context size ${context.contextSize}` : ''}`,
      rootCause: 'TBD',
      fix: 'TBD',
      scope: 'gateway',
      evidence: [
        `Issue type: ${issueType}`,
        `Error: ${errorMessage}`,
        context?.contextSize ? `Context size: ${context.contextSize}` : '',
        context?.sessionId ? `Session: ${context.sessionId}` : '',
      ].filter(Boolean),
      timestamp: new Date().toISOString(),
    };

    return this.capture(event);
  }

  /**
   * Capture user correction
   */
  captureUserCorrection(
    correction: string,
    context?: {
      originalAction?: string;
      sessionId?: string;
    }
  ): OperationalMemory {
    const event: CapturedEvent = {
      type: 'anti-pattern',
      summary: `User correction: ${correction.slice(0, 50)}`,
      symptom: `User indicated approach was wrong: "${correction}"`,
      trigger: `After action: ${context?.originalAction || 'unknown'}`,
      rootCause: 'TBD',
      fix: 'Follow user correction guidance',
      scope: 'agent',
      evidence: [
        `Correction: ${correction}`,
        context?.originalAction ? `Original action: ${context.originalAction}` : '',
        context?.sessionId ? `Session: ${context.sessionId}` : '',
      ].filter(Boolean),
      timestamp: new Date().toISOString(),
    };

    return this.capture(event);
  }

  /**
   * Capture success pattern
   */
  captureSuccess(
    summary: string,
    whatWorked: string,
    context?: {
      task?: string;
      sessionId?: string;
      scope?: Scope;
    }
  ): OperationalMemory {
    const event: CapturedEvent = {
      type: 'success-pattern',
      summary,
      symptom: `Successfully completed: ${whatWorked}`,
      trigger: `Task: ${context?.task || 'unknown'}`,
      rootCause: whatWorked,
      fix: 'Follow this approach',
      scope: context?.scope || 'global',
      evidence: [
        `What worked: ${whatWorked}`,
        context?.task ? `Task: ${context.task}` : '',
        context?.sessionId ? `Session: ${context.sessionId}` : '',
      ].filter(Boolean),
      timestamp: new Date().toISOString(),
    };

    return this.capture(event);
  }

  /**
   * Capture health degradation
   */
  captureHealthDegradation(
    metric: string,
    currentValue: number,
    threshold: number,
    context?: {
      sessionId?: string;
    }
  ): OperationalMemory {
    const event: CapturedEvent = {
      type: 'error-pattern',
      summary: `Health metric ${metric} degraded`,
      symptom: `${metric} is ${currentValue} (threshold: ${threshold})`,
      trigger: `Health check detected degradation`,
      rootCause: 'TBD',
      fix: 'Investigate and address root cause',
      scope: 'gateway',
      evidence: [
        `Metric: ${metric}`,
        `Current: ${currentValue}`,
        `Threshold: ${threshold}`,
        context?.sessionId ? `Session: ${context.sessionId}` : '',
      ].filter(Boolean),
      timestamp: new Date().toISOString(),
    };

    return this.capture(event);
  }

  /**
   * Get aggregation stats
   */
  getAggregationStats(): {
    totalSignatures: number;
    patternsWithRecurrence: number;
    candidates: number;
  } {
    const patternsWithRecurrence = Array.from(this.signatureIndex.values())
      .filter(keys => keys.length > 1).length;

    const candidates = this.memoryManager.getAllByStatus('candidate').length;

    return {
      totalSignatures: this.signatureIndex.size,
      patternsWithRecurrence,
      candidates,
    };
  }
}

export default OperationalCaptureManager;
