/**
 * Queue job contracts — single source of truth for job types.
 * Both producer and worker import from here, preventing circular dependencies
 * and ensuring type safety across the queue boundary.
 */

export const QUEUE_NAME = 'monitor-checks' as const;
export const DLQ_NAME = 'monitor-checks-dlq' as const;

/** Maximum number of attempts before a job is moved to the DLQ. */
export const MAX_JOB_ATTEMPTS = 3;

export interface CheckJobData {
  monitorId: string;
}

export interface DLQJobData extends CheckJobData {
  /** Error message from the final failed attempt. */
  finalError: string;
  /** Number of attempts the job ran before being moved to the DLQ. */
  attemptsMade: number;
  /** ISO timestamp of when the job was moved to the DLQ. */
  movedAt: string;
}

export type JobType = 'scheduled' | 'on-demand';
