import { NextRequest, NextResponse } from 'next/server';
import { compilePipeline } from '@/lib/pipeline/orchestrator';
import { createJobId, createJob, startJob, completeJob, failJob } from '@/lib/job-store';

/**
 * POST /api/compile
 *
 * Starts the compile pipeline asynchronously and returns a job ID immediately.
 * Client polls GET /api/compile/[id] for results.
 *
 * WHY: The pipeline takes 30-60+ seconds (sequential LLM calls).
 * A synchronous response would hit the ALB timeout and return 502.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { prompt, options } = body;

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length < 3) {
      return NextResponse.json(
        { error: 'A prompt of at least 3 characters is required' },
        { status: 400 }
      );
    }

    const jobId = createJobId();
    createJob(jobId);

    // Run pipeline in background — don't await
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    (async () => {
      try {
        startJob(jobId);
        console.log(`[compile] Job ${jobId} started`);
        const result = await compilePipeline(prompt.trim(), options || {});
        completeJob(jobId, result);
        console.log(`[compile] Job ${jobId} completed: ${result.finalStatus}`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`[compile] Job ${jobId} failed:`, msg);
        failJob(jobId, msg);
      }
    })().catch((err) => {
      // Double-catch: prevent unhandled rejection from crashing the process
      console.error(`[compile] Unhandled error in job ${jobId}:`, err);
      failJob(jobId, String(err));
    });

    // Return immediately with the job ID
    return NextResponse.json({ jobId, status: 'pending' });
  } catch (error) {
    console.error('[API /api/compile] Error:', error);
    return NextResponse.json(
      { error: 'Failed to start pipeline', details: (error as Error).message },
      { status: 500 }
    );
  }
}
