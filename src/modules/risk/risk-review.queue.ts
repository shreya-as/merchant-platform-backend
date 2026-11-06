import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { RISK_ASSESS_JOB, RISK_QUEUE, RiskJobData, riskIdempotencyKey } from './risk.constants';

@Injectable()
export class RiskReviewQueue {
  constructor(@InjectQueue(RISK_QUEUE) private readonly queue: Queue<RiskJobData>) {}

  // jobId = idempotency key, so enqueuing the same submission twice is a no-op in BullMQ.
  // `manualRetry` gets a fresh jobId (the failed job still holds the old one) but keeps the
  // idempotency key, so the worker still cannot create a second assessment for this submission.
  async enqueue(applicationId: string, submittedAt: Date, manualRetry = false): Promise<void> {
    const idempotencyKey = riskIdempotencyKey(applicationId, submittedAt);
    await this.queue.add(
      RISK_ASSESS_JOB,
      { applicationId, idempotencyKey },
      { jobId: manualRetry ? `${idempotencyKey}-retry-${Date.now()}` : idempotencyKey },
    );
  }
}
