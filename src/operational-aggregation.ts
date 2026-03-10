/**
 * ClawText Operational Memory Aggregation & Synthesis
 * 
 * Advanced pattern detection and synthesis:
 * - Pattern correlation (detect related patterns)
 * - Merge logic for duplicate/similar patterns
 * - Evidence aggregation and prioritization
 * - Synthesis rules (raw → candidate quality improvements)
 */

import { OperationalMemoryManager, OperationalMemory, PatternType } from './operational.js';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Pattern correlation result
 */
export interface PatternCorrelation {
  patternKey1: string;
  patternKey2: string;
  correlationType: 'related' | 'causes' | 'symptom' | 'fix';
  confidence: number;
  explanation: string;
}

/**
 * Merge suggestion
 */
export interface MergeSuggestion {
  primaryPatternKey: string;
  duplicatePatternKey: string;
  reason: string;
  confidence: number;
  evidence: string[];
}

/**
 * Synthesis result
 */
export interface SynthesisResult {
  patternKey: string;
  improved: boolean;
  changes: string[];
  confidence: number;
}

/**
 * Operational aggregation manager
 */
export class OperationalAggregationManager {
  private memoryManager: OperationalMemoryManager;
  private workspacePath: string;
  private correlationThreshold: number;
  private similarityThreshold: number;

  constructor(workspacePath: string, correlationThreshold: number = 0.7, similarityThreshold: number = 0.8) {
    this.workspacePath = workspacePath;
    this.memoryManager = new OperationalMemoryManager(workspacePath);
    this.correlationThreshold = correlationThreshold;
    this.similarityThreshold = similarityThreshold;
  }

  /**
   * Find all candidate patterns needing synthesis
   */
  findCandidatesForSynthesis(): OperationalMemory[] {
    return this.memoryManager.getAllByStatus('candidate');
  }

  /**
   * Synthesize a candidate pattern (improve quality)
   */
  synthesize(patternKey: string): SynthesisResult | null {
    const pattern = this.memoryManager.get(patternKey);
    if (!pattern) return null;

    const changes: string[] = [];
    let improved = false;
    let confidence = pattern.confidence;

    // Rule 1: If recurrence >= 3, boost confidence
    if (pattern.recurrenceCount >= 3) {
      const newConfidence = Math.min(0.9, pattern.confidence + 0.1);
      if (newConfidence > confidence) {
        confidence = newConfidence;
        changes.push(`Boosted confidence from ${pattern.confidence.toFixed(2)} to ${confidence.toFixed(2)} (recurrence: ${pattern.recurrenceCount})`);
        improved = true;
      }
    }

    // Rule 2: If evidence >= 3 items, boost confidence
    if (pattern.evidence.length >= 3) {
      const newConfidence = Math.min(0.95, confidence + 0.05);
      if (newConfidence > confidence) {
        confidence = newConfidence;
        changes.push(`Boosted confidence to ${confidence.toFixed(2)} (evidence: ${pattern.evidence.length} items)`);
        improved = true;
      }
    }

    // Rule 3: If rootCause is "TBD" but recurrence >= 2, flag for review
    if (pattern.rootCause === 'TBD' && pattern.recurrenceCount >= 2) {
      changes.push('⚠️  Root cause marked as TBD - needs investigation');
    }

    // Rule 4: If fix is "TBD", flag for review
    if (pattern.fix === 'TBD') {
      changes.push('⚠️  Fix marked as TBD - needs resolution');
    }

    // Rule 5: If pattern has high recurrence but low confidence, investigate
    if (pattern.recurrenceCount >= 5 && pattern.confidence < 0.7) {
      changes.push(`⚠️  High recurrence (${pattern.recurrenceCount}) but low confidence (${pattern.confidence.toFixed(2)}) - verify pattern validity`);
    }

    // Apply improvements if any
    if (improved) {
      const updated = this.memoryManager.update(patternKey, { confidence });
      if (updated) {
        return {
          patternKey,
          improved: true,
          changes,
          confidence: updated.confidence,
        };
      }
    }

    return {
      patternKey,
      improved: false,
      changes,
      confidence,
    };
  }

  /**
   * Synthesize all candidates
   */
  synthesizeAll(): SynthesisResult[] {
    const candidates = this.findCandidatesForSynthesis();
    const results: SynthesisResult[] = [];

    for (const candidate of candidates) {
      const result = this.synthesize(candidate.patternKey);
      if (result) {
        results.push(result);
      }
    }

    return results;
  }

  /**
   * Find similar patterns that might be duplicates
   */
  findDuplicatePatterns(): MergeSuggestion[] {
    const allPatterns = this.memoryManager.getAllByStatus('candidate');
    const suggestions: MergeSuggestion[] = [];

    for (let i = 0; i < allPatterns.length; i++) {
      for (let j = i + 1; j < allPatterns.length; j++) {
        const pattern1 = allPatterns[i];
        const pattern2 = allPatterns[j];

        const similarity = this.calculateSimilarity(pattern1, pattern2);
        if (similarity >= this.similarityThreshold) {
          suggestions.push({
            primaryPatternKey: pattern1.patternKey,
            duplicatePatternKey: pattern2.patternKey,
            reason: this.generateMergeReason(pattern1, pattern2, similarity),
            confidence: similarity,
            evidence: [
              `Similarity score: ${similarity.toFixed(2)}`,
              `Pattern 1 recurrence: ${pattern1.recurrenceCount}`,
              `Pattern 2 recurrence: ${pattern2.recurrenceCount}`,
            ],
          });
        }
      }
    }

    return suggestions;
  }

  /**
   * Calculate similarity between two patterns
   */
  private calculateSimilarity(pattern1: OperationalMemory, pattern2: OperationalMemory): number {
    let score = 0;
    let checks = 0;

    // Same type
    if (pattern1.type === pattern2.type) {
      score += 0.3;
    }
    checks++;

    // Same scope
    if (pattern1.scope === pattern2.scope) {
      score += 0.2;
    }
    checks++;

    // Similar symptom (string similarity)
    const symptomSimilarity = this.stringSimilarity(pattern1.symptom, pattern2.symptom);
    score += symptomSimilarity * 0.3;

    // Similar trigger
    const triggerSimilarity = this.stringSimilarity(pattern1.trigger, pattern2.trigger);
    score += triggerSimilarity * 0.2;

    return score;
  }

  /**
   * Generate merge reason
   */
  private generateMergeReason(pattern1: OperationalMemory, pattern2: OperationalMemory, similarity: number): string {
    const reasons: string[] = [];

    if (pattern1.type === pattern2.type) {
      reasons.push(`Same type (${pattern1.type})`);
    }

    if (pattern1.scope === pattern2.scope) {
      reasons.push(`Same scope (${pattern1.scope})`);
    }

    const symptomSimilarity = this.stringSimilarity(pattern1.symptom, pattern2.symptom);
    if (symptomSimilarity > 0.7) {
      reasons.push(`Similar symptoms (${(symptomSimilarity * 100).toFixed(0)}% match)`);
    }

    const triggerSimilarity = this.stringSimilarity(pattern1.trigger, pattern2.trigger);
    if (triggerSimilarity > 0.7) {
      reasons.push(`Similar triggers (${(triggerSimilarity * 100).toFixed(0)}% match)`);
    }

    return `Merge candidate: ${reasons.join(', ')}`;
  }

  /**
   * Simple string similarity (Jaccard-like)
   */
  private stringSimilarity(str1: string, str2: string): number {
    const tokens1 = new Set(str1.toLowerCase().split(/\s+/));
    const tokens2 = new Set(str2.toLowerCase().split(/\s+/));

    const intersection = new Set([...tokens1].filter(t => tokens2.has(t)));
    const union = new Set([...tokens1, ...tokens2]);

    if (union.size === 0) return 0;
    return intersection.size / union.size;
  }

  /**
   * Merge two patterns
   */
  mergePatterns(primaryKey: string, duplicateKey: string): OperationalMemory | null {
    const primary = this.memoryManager.get(primaryKey);
    const duplicate = this.memoryManager.get(duplicateKey);

    if (!primary || !duplicate) return null;

    // Merge evidence
    const mergedEvidence = [
      ...primary.evidence,
      ...duplicate.evidence,
    ].filter((v, i, a) => a.indexOf(v) === i); // Dedupe

    // Merge recurrence
    const mergedRecurrence = primary.recurrenceCount + duplicate.recurrenceCount;

    // Update primary
    const updated = this.memoryManager.update(primaryKey, {
      recurrenceCount: mergedRecurrence,
      evidence: mergedEvidence,
      lastSeenAt: duplicate.lastSeenAt,
    });

    if (updated) {
      // Archive duplicate
      this.memoryManager.changeStatus(duplicateKey, 'archived');

      console.log(`[OperationalAggregation] Merged ${duplicateKey} into ${primaryKey}`);
      console.log(`  New recurrence: ${updated.recurrenceCount}`);
      console.log(`  Evidence items: ${updated.evidence.length}`);
    }

    return updated;
  }

  /**
   * Find correlated patterns
   */
  findCorrelatedPatterns(patternKey: string): PatternCorrelation[] {
    const pattern = this.memoryManager.get(patternKey);
    if (!pattern) return [];

    const allPatterns = this.memoryManager.getAllByStatus('reviewed');
    const correlations: PatternCorrelation[] = [];

    for (const other of allPatterns) {
      if (other.patternKey === patternKey) continue;

      const correlation = this.analyzeCorrelation(pattern, other);
      if (correlation && correlation.confidence >= this.correlationThreshold) {
        correlations.push(correlation);
      }
    }

    return correlations;
  }

  /**
   * Analyze correlation between two patterns
   */
  private analyzeCorrelation(pattern1: OperationalMemory, pattern2: OperationalMemory): PatternCorrelation | null {
    // Check if fix of one matches symptom of another (causes relationship)
    if (this.stringsOverlap(pattern1.fix, pattern2.symptom)) {
      return {
        patternKey1: pattern1.patternKey,
        patternKey2: pattern2.patternKey,
        correlationType: 'causes',
        confidence: 0.8,
        explanation: `${pattern1.patternKey} fix addresses symptom of ${pattern2.patternKey}`,
      };
    }

    if (this.stringsOverlap(pattern2.fix, pattern1.symptom)) {
      return {
        patternKey1: pattern1.patternKey,
        patternKey2: pattern2.patternKey,
        correlationType: 'causes',
        confidence: 0.8,
        explanation: `${pattern2.patternKey} fix addresses symptom of ${pattern1.patternKey}`,
      };
    }

    // Check if symptoms are similar (related relationship)
    const symptomSimilarity = this.stringSimilarity(pattern1.symptom, pattern2.symptom);
    if (symptomSimilarity > 0.6) {
      return {
        patternKey1: pattern1.patternKey,
        patternKey2: pattern2.patternKey,
        correlationType: 'related',
        confidence: symptomSimilarity,
        explanation: `Similar symptoms (${(symptomSimilarity * 100).toFixed(0)}% match)`,
      };
    }

    // Check if same root cause (related relationship)
    if (pattern1.rootCause !== 'TBD' && pattern2.rootCause !== 'TBD') {
      const causeSimilarity = this.stringSimilarity(pattern1.rootCause, pattern2.rootCause);
      if (causeSimilarity > 0.7) {
        return {
          patternKey1: pattern1.patternKey,
          patternKey2: pattern2.patternKey,
          correlationType: 'related',
          confidence: causeSimilarity,
          explanation: `Similar root causes (${(causeSimilarity * 100).toFixed(0)}% match)`,
        };
      }
    }

    return null;
  }

  /**
   * Check if two strings have significant overlap
   */
  private stringsOverlap(str1: string, str2: string): boolean {
    const words1 = str1.toLowerCase().split(/\s+/);
    const words2 = str2.toLowerCase().split(/\s+/);

    const overlap = words1.filter(w => words2.includes(w));
    return overlap.length >= 2; // At least 2 common words
  }

  /**
   * Get aggregation report
   */
  getAggregationReport(): {
    totalCandidates: number;
    synthesized: SynthesisResult[];
    mergeSuggestions: MergeSuggestion[];
    highRecurrencePatterns: OperationalMemory[];
    patternsNeedingReview: OperationalMemory[];
  } {
    const candidates = this.findCandidatesForSynthesis();
    const synthesized = this.synthesizeAll();
    const mergeSuggestions = this.findDuplicatePatterns();

    const highRecurrencePatterns = candidates.filter(p => p.recurrenceCount >= 3);

    const patternsNeedingReview = candidates.filter(p =>
      p.rootCause === 'TBD' ||
      p.fix === 'TBD' ||
      (p.recurrenceCount >= 5 && p.confidence < 0.7)
    );

    return {
      totalCandidates: candidates.length,
      synthesized,
      mergeSuggestions,
      highRecurrencePatterns,
      patternsNeedingReview,
    };
  }
}

export default OperationalAggregationManager;
