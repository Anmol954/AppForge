import { NextResponse } from 'next/server';
import { MetricsTracker } from '@/lib/evaluation/metrics';

const metricsTracker = new MetricsTracker();

export async function GET() {
  try {
    const metrics = metricsTracker.getMetrics();
    const costAnalysis = metricsTracker.computeCostAnalysis();
    return NextResponse.json({ metrics, costAnalysis });
  } catch (error) {
    console.error('[API /api/metrics] Error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve metrics', details: (error as Error).message },
      { status: 500 }
    );
  }
}
