import { NextRequest, NextResponse } from 'next/server';
import { compilePipeline } from '@/lib/pipeline/orchestrator';
import { benchmarkPrompts } from '@/lib/evaluation/datasets';
import { MetricsTracker } from '@/lib/evaluation/metrics';
import type { BenchmarkResult, PipelineResult } from '@/lib/pipeline/types';

const metricsTracker = new MetricsTracker();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      promptIds,
      category,
      runAll = false,
    } = body as {
      promptIds?: string[];
      category?: 'real_product' | 'edge_case';
      runAll?: boolean;
    };

    // Select prompts to benchmark
    let selectedPrompts = benchmarkPrompts;
    if (promptIds && promptIds.length > 0) {
      selectedPrompts = benchmarkPrompts.filter((p) => promptIds.includes(p.id));
    } else if (category) {
      selectedPrompts = benchmarkPrompts.filter((p) => p.category === category);
    }
    if (!runAll && !promptIds && !category) {
      // Default: run first 3 of each category
      const real = benchmarkPrompts.filter((p) => p.category === 'real_product').slice(0, 3);
      const edge = benchmarkPrompts.filter((p) => p.category === 'edge_case').slice(0, 3);
      selectedPrompts = [...real, ...edge];
    }

    const results: BenchmarkResult[] = [];
    const errors: { prompt: string; error: string }[] = [];

    for (const prompt of selectedPrompts) {
      try {
        const pipelineResult = await compilePipeline(prompt.prompt, {
          maxRepairCycles: 1, // Faster benchmarks
          skipRuntime: false,
        });

        const errorsCount = pipelineResult.validationIssues.filter((i) => i.severity === 'error').length;
        const warningsCount = pipelineResult.validationIssues.filter((i) => i.severity === 'warning').length;
        const successStages = pipelineResult.stages.filter((s) => s.status === 'success').length;

        const benchmarkResult: BenchmarkResult = {
          id: prompt.id,
          prompt: prompt.prompt,
          category: prompt.category,
          subcategory: prompt.subcategory,
          pipelineResult,
          metrics: {
            success: pipelineResult.finalStatus === 'success',
            totalLatencyMs: pipelineResult.totalLatencyMs,
            totalTokens: pipelineResult.totalTokens,
            validationErrors: errorsCount,
            repairActions: pipelineResult.repairActions.length,
            stagesCompleted: successStages,
            consistencyScore: errorsCount === 0 && warningsCount === 0
              ? 1
              : errorsCount === 0
                ? 0.8
                : Math.max(0, 1 - (errorsCount * 0.15) - (warningsCount * 0.05)),
            executionSuccess: pipelineResult.stages[5]?.status === 'success' ||
              pipelineResult.stages[5]?.status === 'repaired',
          },
          createdAt: new Date().toISOString(),
        };

        results.push(benchmarkResult);
        metricsTracker.recordBenchmark(benchmarkResult);
      } catch (error) {
        errors.push({
          prompt: prompt.prompt.substring(0, 100),
          error: (error as Error).message,
        });
      }
    }

    const metrics = metricsTracker.getMetrics();

    return NextResponse.json({
      results,
      errors,
      totalPrompts: selectedPrompts.length,
      successfulRuns: results.filter((r) => r.metrics.success).length,
      metrics,
    });
  } catch (error) {
    console.error('[API /api/benchmark] Error:', error);
    return NextResponse.json(
      { error: 'Benchmark execution failed', details: (error as Error).message },
      { status: 500 }
    );
  }
}
