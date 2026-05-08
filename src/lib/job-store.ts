/**
 * In-Memory Job Store
 *
 * WHY: The compile pipeline takes 30-60+ seconds due to sequential LLM calls.
 * This exceeds the ALB idle timeout (~30s), causing 502 Bad Gateway errors.
 * Solution: POST returns a job ID immediately, client polls for results.
 *
 * TRADEOFFS:
 * - In-memory only: jobs lost on server restart (acceptable for dev/demo)
 * - No persistence needed: compile results are ephemeral by nature
 * - Auto-cleanup prevents memory leaks from abandoned jobs
 */

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface Job<T = unknown> {
  id: string;
  status: JobStatus;
  result?: T;
  error?: string;
  createdAt: number;
  completedAt?: number;
}

// In-memory store — no persistence, no database needed
const jobs = new Map<string, Job>();

// Auto-cleanup: remove jobs older than 10 minutes every 60 seconds
const JOB_TTL_MS = 10 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 1000;

if (typeof globalThis !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [id, job] of jobs) {
      if (now - job.createdAt > JOB_TTL_MS) {
        jobs.delete(id);
      }
    }
  }, CLEANUP_INTERVAL_MS);
}

/** Generate a short, unique job ID */
export function createJobId(): string {
  return `job_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

/** Create a new pending job */
export function createJob<T = unknown>(id: string): Job<T> {
  const job: Job<T> = {
    id,
    status: 'pending',
    createdAt: Date.now(),
  };
  jobs.set(id, job);
  return job;
}

/** Mark a job as running */
export function startJob(id: string): void {
  const job = jobs.get(id);
  if (job) job.status = 'running';
}

/** Mark a job as completed with a result */
export function completeJob<T>(id: string, result: T): void {
  const job = jobs.get(id);
  if (job) {
    job.status = 'completed';
    job.result = result;
    job.completedAt = Date.now();
  }
}

/** Mark a job as failed */
export function failJob(id: string, error: string): void {
  const job = jobs.get(id);
  if (job) {
    job.status = 'failed';
    job.error = error;
    job.completedAt = Date.now();
  }
}

/** Get a job by ID (or undefined if not found/expired) */
export function getJob<T = unknown>(id: string): Job<T> | undefined {
  return jobs.get(id) as Job<T> | undefined;
}
