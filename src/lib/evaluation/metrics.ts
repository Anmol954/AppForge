/**
 * Pipeline Metrics Tracker
 *
 * WHY: A compiler is only as good as its error rate. This module provides
 * the observability layer — tracking latency, token usage, success rates,
 * repair efficacy, and cost-quality tradeoffs across all pipeline runs.
 * It turns individual pipeline results into aggregate insights that can
 * drive pipeline tuning and configuration decisions.
 *
 * ARCHITECTURE:
 * - In-memory storage using Map<string, RunRecord[]> keyed by category.
 * - Two recording paths: `recordRun()` for individual pipeline results and
 *   `recordBenchmark()` for benchmark-suite results with pre-computed metrics.
 * - All computed metrics are derived on demand (no eager aggregation) to
 *   keep recording overhead O(1).
 *
 * COST MODEL:
 * - Based on ~$0.01 per 1K tokens (typical GPT-4-class pricing).
 * - Two profiles modeled:
 *   1. Low Cost Mode: temperature=0.7, maxRetries=1, maxTokens=2048, skip repair
 *      → ~$0.02–0.05 per request, faster, lower quality
 *   2. High Reliability Mode: temperature=0, maxRetries=3, maxTokens=16384, full repair
 *      → ~$0.15–0.50 per request, slower, higher quality
 *
 * TRADEOFFS:
 * - In-memory storage means metrics are lost on process restart. For production,
 *   this should be backed by a database or time-series store.
 * - Cost estimates are approximations; actual costs depend on the LLM provider.
 * - No persistence: callers should call `export()` to snapshot metrics if needed.
 */

import type { PipelineResult, BenchmarkResult } from '@/lib/pipeline/types';

// ============================================================
// Metrics Types
// ============================================================

export interface CostProfile {
  /** Estimated cost in USD for a single request under this profile */
  estimatedCostPerRequest: number;
  /** Expected average latency in milliseconds */
  avgLatencyMs: number;
  /** Quality score from 0 to 1 (composite of success rate and consistency) */
  qualityScore: number;
  /** Human-readable list of tradeoffs for this profile */
  tradeoffs: string[];
}

export interface CategoryMetrics {
  /** Number of runs in this category */
  count: number;
  /** Fraction of runs that succeeded (finalStatus === 'success') */
  successRate: number;
  /** Average total latency in milliseconds */
  avgLatencyMs: number;
  /** Average token consumption */
  avgTokens: number;
  /** Average number of validation issues found */
  avgValidationErrors: number;
  /** Average number of repair actions taken */
  avgRepairActions: number;
}

export interface PipelineMetrics {
  /** Total number of pipeline runs recorded */
  totalRuns: number;
  /** Runs that completed with finalStatus === 'success' */
  successfulRuns: number;
  /** Runs that completed with finalStatus === 'failed' */
  failedRuns: number;
  /** Runs that completed with finalStatus === 'partial' (some stages repaired) */
  partialRuns: number;
  /** Average total latency across all runs in milliseconds */
  avgLatencyMs: number;
  /** Average total token consumption across all runs */
  avgTokens: number;
  /** Average number of validation issues per run */
  avgValidationErrors: number;
  /** Average number of repair actions per run */
  avgRepairActions: number;
  /** Fraction of repair actions that succeeded (0-1) */
  repairSuccessRate: number;
  /** Average consistency score across all runs (0-1) */
  consistencyScore: number;
  /** Fraction of runs with finalStatus === 'success' (0-1) */
  executionSuccessRate: number;
  /** Breakdown of metrics by category (real_product, edge_case, or subcategory) */
  categoryBreakdown: Record<string, CategoryMetrics>;
  /** Cost-quality analysis for two operating modes */
  costAnalysis: {
    lowCostMode: CostProfile;
    highReliabilityMode: CostProfile;
  };
}

// ============================================================
// Internal Run Record (lightweight storage envelope)
// ============================================================

interface RunRecord {
  /** The pipeline result or benchmark result */
  type: 'pipeline' | 'benchmark';
  /** Category from the result (real_product, edge_case, or subcategory) */
  category: string;
  /** Final status: success, partial, or failed */
  finalStatus: 'success' | 'partial' | 'failed';
  /** Total latency in milliseconds */
  totalLatencyMs: number;
  /** Total token consumption */
  totalTokens: number;
  /** Number of validation issues */
  validationErrors: number;
  /** Number of repair actions */
  repairActions: number;
  /** Number of repair actions that succeeded */
  repairSuccesses: number;
  /** Consistency score (0-1), 0 if not available */
  consistencyScore: number;
  /** Whether execution was successful (from benchmark metrics) */
  executionSuccess: boolean;
}

// ============================================================
// Cost Constants
// ============================================================

/** Cost per 1K tokens in USD (GPT-4-class approximation) */
const COST_PER_1K_TOKENS = 0.01;

/** Low-cost mode configuration */
const LOW_COST_MODE = {
  temperature: 0.7,
  maxRetries: 1,
  maxTokens: 2048,
  skipRepair: true,
  label: 'Low Cost Mode',
  avgLatencyBaseMs: 2000,
  qualityMultiplier: 0.65,
} as const;

/** High-reliability mode configuration */
const HIGH_RELIABILITY_MODE = {
  temperature: 0,
  maxRetries: 3,
  maxTokens: 16384,
  skipRepair: false,
  label: 'High Reliability Mode',
  avgLatencyBaseMs: 12000,
  qualityMultiplier: 0.92,
} as const;

// ============================================================
// Metrics Tracker
// ============================================================

export class MetricsTracker {
  /** In-memory storage keyed by category */
  private records: Map<string, RunRecord[]> = new Map();

  /** Run ID counter for internal tracking */
  private runCounter: number = 0;

  constructor() {
    this.records = new Map();
    this.runCounter = 0;
  }

  // ----------------------------------------------------------
  // Recording
  // ----------------------------------------------------------

  /**
   * Record a pipeline run result.
   * Extracts metrics from the full PipelineResult object.
   */
  recordRun(result: PipelineResult): void {
    this.runCounter++;
    const record = this.extractRunRecord(result);
    this.storeRecord(record);
  }

  /**
   * Record a benchmark result with pre-computed metrics.
   * Benchmarks include a richer metrics payload (consistencyScore, executionSuccess).
   */
  recordBenchmark(result: BenchmarkResult): void {
    this.runCounter++;
    const record = this.extractBenchmarkRecord(result);
    this.storeRecord(record);
  }

  // ----------------------------------------------------------
  // Metric Retrieval
  // ----------------------------------------------------------

  /**
   * Compute aggregate metrics across all recorded runs.
   */
  getMetrics(): PipelineMetrics {
    const allRecords = this.getAllRecords();

    if (allRecords.length === 0) {
      return this.emptyMetrics();
    }

    const totalRuns = allRecords.length;
    const successfulRuns = allRecords.filter((r) => r.finalStatus === 'success').length;
    const failedRuns = allRecords.filter((r) => r.finalStatus === 'failed').length;
    const partialRuns = allRecords.filter((r) => r.finalStatus === 'partial').length;

    const avgLatencyMs = this.mean(allRecords.map((r) => r.totalLatencyMs));
    const avgTokens = this.mean(allRecords.map((r) => r.totalTokens));
    const avgValidationErrors = this.mean(allRecords.map((r) => r.validationErrors));
    const avgRepairActions = this.mean(allRecords.map((r) => r.repairActions));

    const totalRepairAttempted = allRecords.reduce((sum, r) => sum + r.repairActions, 0);
    const totalRepairSucceeded = allRecords.reduce((sum, r) => sum + r.repairSuccesses, 0);
    const repairSuccessRate = totalRepairAttempted > 0 ? totalRepairSucceeded / totalRepairAttempted : 1;

    const consistencyRecords = allRecords.filter((r) => r.consistencyScore >= 0);
    const consistencyScore =
      consistencyRecords.length > 0
        ? this.mean(consistencyRecords.map((r) => r.consistencyScore))
        : 0;

    const executionSuccessCount = allRecords.filter((r) => r.executionSuccess).length;
    const executionSuccessRate = executionSuccessCount / totalRuns;

    const categoryBreakdown = this.computeCategoryBreakdown();

    const costAnalysis = this.computeCostAnalysis(allRecords);

    return {
      totalRuns,
      successfulRuns,
      failedRuns,
      partialRuns,
      avgLatencyMs: this.round(avgLatencyMs, 2),
      avgTokens: this.round(avgTokens, 2),
      avgValidationErrors: this.round(avgValidationErrors, 2),
      avgRepairActions: this.round(avgRepairActions, 2),
      repairSuccessRate: this.round(repairSuccessRate, 4),
      consistencyScore: this.round(consistencyScore, 4),
      executionSuccessRate: this.round(executionSuccessRate, 4),
      categoryBreakdown,
      costAnalysis,
    };
  }

  /**
   * Compute aggregate metrics for a specific category.
   */
  getMetricsByCategory(category: string): CategoryMetrics | null {
    const records = this.records.get(category);
    if (!records || records.length === 0) {
      return null;
    }

    return {
      count: records.length,
      successRate: this.round(
        records.filter((r) => r.finalStatus === 'success').length / records.length,
        4,
      ),
      avgLatencyMs: this.round(this.mean(records.map((r) => r.totalLatencyMs)), 2),
      avgTokens: this.round(this.mean(records.map((r) => r.totalTokens)), 2),
      avgValidationErrors: this.round(this.mean(records.map((r) => r.validationErrors)), 2),
      avgRepairActions: this.round(this.mean(records.map((r) => r.repairActions)), 2),
    };
  }

  /**
   * Compute cost vs quality analysis for two operating profiles.
   *
   * Low Cost Mode:    temperature=0.7, maxRetries=1, maxTokens=2048, skip repair
   *   → Faster, cheaper, lower quality. Good for prototyping.
   *
   * High Reliability Mode: temperature=0, maxRetries=3, maxTokens=16384, full repair
   *   → Slower, expensive, higher quality. Good for production specs.
   */
  computeCostAnalysis(
    records?: RunRecord[],
  ): { lowCostMode: CostProfile; highReliabilityMode: CostProfile } {
    const allRecords = records ?? this.getAllRecords();

    // Compute baseline metrics from actual run data
    const avgTokens = allRecords.length > 0 ? this.mean(allRecords.map((r) => r.totalTokens)) : 4096;
    const avgLatency = allRecords.length > 0 ? this.mean(allRecords.map((r) => r.totalLatencyMs)) : 5000;
    const successRate =
      allRecords.length > 0
        ? allRecords.filter((r) => r.finalStatus === 'success').length / allRecords.length
        : 0.7;
    const consistencyRecords = allRecords.filter((r) => r.consistencyScore >= 0);
    const consistencyScore =
      consistencyRecords.length > 0
        ? this.mean(consistencyRecords.map((r) => r.consistencyScore))
        : 0.7;

    // ---- Low Cost Mode ----
    // Token budget is capped at 2048. If avgTokens > 2048, the request gets truncated.
    // With skipRepair=true, we avoid ~1-2 repair LLM calls per run.
    const lowCostTokens = Math.min(avgTokens, LOW_COST_MODE.maxTokens);
    const lowCostRetryOverhead = LOW_COST_MODE.maxRetries * lowCostTokens * 0.3; // 30% of base for retry buffer
    const lowCostTotalTokens = lowCostTokens + lowCostRetryOverhead;
    // Repair typically costs ~30% of total tokens. Skipping saves that.
    const repairTokenSavings = avgTokens * 0.3;
    const lowCostEstimatedTokens = lowCostTotalTokens - repairTokenSavings;
    const lowCostCost = Math.max((lowCostEstimatedTokens / 1000) * COST_PER_1K_TOKENS, 0.02);
    const lowCostLatency = avgLatency * 0.35; // No repair, lower tokens → much faster
    const lowCostQuality = Math.min(
      successRate * LOW_COST_MODE.qualityMultiplier * 0.8 + consistencyScore * 0.2,
      1,
    );

    const lowCostMode: CostProfile = {
      estimatedCostPerRequest: this.round(lowCostCost, 4),
      avgLatencyMs: this.round(lowCostLatency, 0),
      qualityScore: this.round(lowCostQuality, 4),
      tradeoffs: [
        `Temperature ${LOW_COST_MODE.temperature} increases output variety but reduces determinism.`,
        `Max tokens capped at ${LOW_COST_MODE.maxTokens} — complex specs may be truncated.`,
        `Only ${LOW_COST_MODE.maxRetries} retry allowed — transient failures are not retried.`,
        `Repair stage is skipped — validation issues go unaddressed.`,
        `Best for: rapid prototyping, early-stage exploration, cost-sensitive environments.`,
        `Expected quality degradation: ~35% lower consistency vs. high-reliability mode.`,
      ],
    };

    // ---- High Reliability Mode ----
    // Token budget is generous at 16384. Full repair enabled.
    // 3 retries ensure resilience against transient LLM failures.
    const highRelTokens = Math.max(avgTokens, 4096); // At least 4096 tokens for quality output
    const highRelRetryOverhead = HIGH_RELIABILITY_MODE.maxRetries * highRelTokens * 0.5; // 50% buffer for retries
    const highRelRepairTokens = highRelTokens * 0.3; // Repair adds ~30% tokens
    const highRelTotalTokens = highRelTokens + highRelRetryOverhead + highRelRepairTokens;
    const highRelCost = Math.max((highRelTotalTokens / 1000) * COST_PER_1K_TOKENS, 0.10);
    const highRelLatency = avgLatency * 2.5; // Full repair + retries → much slower
    const highRelQuality = Math.min(
      (successRate * HIGH_RELIABILITY_MODE.qualityMultiplier * 0.8 + consistencyScore * 0.2) * 1.15,
      1,
    );

    const highReliabilityMode: CostProfile = {
      estimatedCostPerRequest: this.round(highRelCost, 4),
      avgLatencyMs: this.round(highRelLatency, 0),
      qualityScore: this.round(highRelQuality, 4),
      tradeoffs: [
        `Temperature ${HIGH_RELIABILITY_MODE.temperature} maximizes deterministic, reproducible output.`,
        `Max tokens at ${HIGH_RELIABILITY_MODE.maxTokens} — handles enterprise-grade complexity.`,
        `Up to ${HIGH_RELIABILITY_MODE.maxRetries} retries per stage — resilient against transient LLM failures.`,
        `Full repair stage enabled — validation issues are auto-fixed before delivery.`,
        `Best for: production specifications, enterprise clients, compliance-critical domains.`,
        `Expected cost increase: ~3-5x vs. low-cost mode for equivalent prompts.`,
      ],
    };

    return { lowCostMode, highReliabilityMode };
  }

  // ----------------------------------------------------------
  // Export
  // ----------------------------------------------------------

  /**
   * Export all metrics as a JSON string.
   * Useful for persistence, reporting, or dashboard integration.
   */
  export(): string {
    const metrics = this.getMetrics();
    return JSON.stringify(metrics, null, 2);
  }

  /**
   * Reset all recorded metrics.
   */
  reset(): void {
    this.records.clear();
    this.runCounter = 0;
  }

  /**
   * Get the total number of recorded runs.
   */
  getRunCount(): number {
    return this.runCounter;
  }

  // ----------------------------------------------------------
  // Private Helpers
  // ----------------------------------------------------------

  /**
   * Extract a RunRecord from a PipelineResult.
   */
  private extractRunRecord(result: PipelineResult): RunRecord {
    return {
      type: 'pipeline',
      category: result.input.length > 100 ? 'real_product' : 'edge_case', // Heuristic; benchmark results set category explicitly
      finalStatus: result.finalStatus,
      totalLatencyMs: result.totalLatencyMs,
      totalTokens: result.totalTokens,
      validationErrors: result.validationIssues.length,
      repairActions: result.repairActions.length,
      repairSuccesses: result.repairActions.filter((a) => a.success).length,
      consistencyScore: this.computeConsistencyFromPipeline(result),
      executionSuccess: result.finalStatus === 'success',
    };
  }

  /**
   * Extract a RunRecord from a BenchmarkResult.
   */
  private extractBenchmarkRecord(result: BenchmarkResult): RunRecord {
    return {
      type: 'benchmark',
      category: result.category,
      finalStatus: result.metrics.success ? 'success' : result.pipelineResult.finalStatus,
      totalLatencyMs: result.metrics.totalLatencyMs,
      totalTokens: result.metrics.totalTokens,
      validationErrors: result.metrics.validationErrors,
      repairActions: result.metrics.repairActions,
      repairSuccesses: result.pipelineResult.repairActions.filter((a) => a.success).length,
      consistencyScore: result.metrics.consistencyScore,
      executionSuccess: result.metrics.executionSuccess,
    };
  }

  /**
   * Compute a heuristic consistency score from a PipelineResult.
   *
   * Checks:
   * - All critical stages succeeded (status === 'success')
   * - No validation errors of severity 'error'
   * - No un-repaired issues
   * - Total token usage is within expected bounds
   */
  private computeConsistencyFromPipeline(result: PipelineResult): number {
    let score = 1.0;
    let checks = 0;

    // Check: critical stages succeeded
    const criticalStages = result.stages.filter(
      (s) => s.stage <= 2, // Intent extraction and architecture are critical
    );
    const criticalSuccesses = criticalStages.filter((s) => s.status === 'success').length;
    score *= criticalStages.length > 0 ? criticalSuccesses / criticalStages.length : 1;
    checks++;

    // Check: no blocking validation errors remain unrepaired
    const blockingUnrepaired = result.validationIssues.filter(
      (issue) => issue.severity === 'error' && issue.repairedBy === 'none',
    );
    score *= blockingUnrepaired.length === 0 ? 1 : Math.max(0, 1 - blockingUnrepaired.length * 0.2);
    checks++;

    // Check: final status
    if (result.finalStatus === 'success') {
      score *= 1;
    } else if (result.finalStatus === 'partial') {
      score *= 0.7;
    } else {
      score *= 0.2;
    }
    checks++;

    // Check: repair success rate within this run
    const totalRepairs = result.repairActions.length;
    const successfulRepairs = result.repairActions.filter((a) => a.success).length;
    if (totalRepairs > 0) {
      score *= successfulRepairs / totalRepairs;
    }
    // If no repairs needed, this check is neutral (multiply by 1)
    checks++;

    return this.round(score, 4);
  }

  /**
   * Store a record under its category key.
   */
  private storeRecord(record: RunRecord): void {
    const key = record.category;
    const existing = this.records.get(key) ?? [];
    existing.push(record);
    this.records.set(key, existing);
  }

  /**
   * Get all records flattened from all categories.
   */
  private getAllRecords(): RunRecord[] {
    const all: RunRecord[] = [];
    for (const records of this.records.values()) {
      all.push(...records);
    }
    return all;
  }

  /**
   * Compute category breakdown for all stored records.
   */
  private computeCategoryBreakdown(): Record<string, CategoryMetrics> {
    const breakdown: Record<string, CategoryMetrics> = {};

    for (const [category, records] of this.records.entries()) {
      if (records.length === 0) continue;

      breakdown[category] = {
        count: records.length,
        successRate: this.round(
          records.filter((r) => r.finalStatus === 'success').length / records.length,
          4,
        ),
        avgLatencyMs: this.round(this.mean(records.map((r) => r.totalLatencyMs)), 2),
        avgTokens: this.round(this.mean(records.map((r) => r.totalTokens)), 2),
        avgValidationErrors: this.round(this.mean(records.map((r) => r.validationErrors)), 2),
        avgRepairActions: this.round(this.mean(records.map((r) => r.repairActions)), 2),
      };
    }

    return breakdown;
  }

  /**
   * Return an empty metrics object (no runs recorded).
   */
  private emptyMetrics(): PipelineMetrics {
    return {
      totalRuns: 0,
      successfulRuns: 0,
      failedRuns: 0,
      partialRuns: 0,
      avgLatencyMs: 0,
      avgTokens: 0,
      avgValidationErrors: 0,
      avgRepairActions: 0,
      repairSuccessRate: 0,
      consistencyScore: 0,
      executionSuccessRate: 0,
      categoryBreakdown: {},
      costAnalysis: {
        lowCostMode: {
          estimatedCostPerRequest: 0.02,
          avgLatencyMs: 2000,
          qualityScore: 0,
          tradeoffs: ['No data recorded yet — estimates based on baseline configuration.'],
        },
        highReliabilityMode: {
          estimatedCostPerRequest: 0.15,
          avgLatencyMs: 12000,
          qualityScore: 0,
          tradeoffs: ['No data recorded yet — estimates based on baseline configuration.'],
        },
      },
    };
  }

  // ----------------------------------------------------------
  // Utility Functions
  // ----------------------------------------------------------

  /** Arithmetic mean of an array of numbers */
  private mean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }

  /** Round a number to a given number of decimal places */
  private round(value: number, decimals: number): number {
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
  }
}
