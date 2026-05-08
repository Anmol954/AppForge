import { NextRequest, NextResponse } from 'next/server';
import { getJob } from '@/lib/job-store';

/**
 * GET /api/compile/[id]
 *
 * Returns the current status and result of an async compile job.
 * Client polls this endpoint every 2 seconds until status is 'completed' or 'failed'.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const job = getJob(id);

  if (!job) {
    return NextResponse.json(
      { error: 'Job not found or expired' },
      { status: 404 }
    );
  }

  return NextResponse.json({
    jobId: job.id,
    status: job.status,
    result: job.status === 'completed' ? job.result : undefined,
    error: job.status === 'failed' ? job.error : undefined,
    createdAt: job.createdAt,
    completedAt: job.completedAt,
  });
}
