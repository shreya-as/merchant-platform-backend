import { Queue } from 'bullmq';
import { RISK_ASSESS_JOB, RiskJobData, riskIdempotencyKey } from './risk.constants';
import { RiskReviewQueue } from './risk-review.queue';

const SUBMITTED_AT = new Date('2026-11-06T10:00:00Z');

describe('riskIdempotencyKey', () => {
  it('is stable for a submission and changes on resubmission', () => {
    const key = riskIdempotencyKey('app-1', SUBMITTED_AT);

    expect(key).toBe(`risk-app-1-${SUBMITTED_AT.getTime()}`);
    expect(riskIdempotencyKey('app-1', new Date(SUBMITTED_AT))).toBe(key);
    expect(riskIdempotencyKey('app-1', new Date(SUBMITTED_AT.getTime() + 1))).not.toBe(key);
  });

  it('contains no ":" (BullMQ rejects it in custom job ids)', () => {
    expect(riskIdempotencyKey('app-1', SUBMITTED_AT)).not.toContain(':');
  });
});

describe('RiskReviewQueue', () => {
  const queue = { add: jest.fn() };
  const riskQueue = new RiskReviewQueue(queue as unknown as Queue<RiskJobData>);
  const key = riskIdempotencyKey('app-1', SUBMITTED_AT);

  beforeEach(() => queue.add.mockReset());

  it('uses the idempotency key as job id so duplicate submits collapse into one job', async () => {
    await riskQueue.enqueue('app-1', SUBMITTED_AT);

    expect(queue.add).toHaveBeenCalledWith(
      RISK_ASSESS_JOB,
      { applicationId: 'app-1', idempotencyKey: key },
      { jobId: key },
    );
  });

  it('gives a manual retry a fresh job id but keeps the idempotency key', async () => {
    await riskQueue.enqueue('app-1', SUBMITTED_AT, true);

    const [, data, opts] = queue.add.mock.calls[0];
    expect(data.idempotencyKey).toBe(key);
    expect(opts.jobId).toMatch(new RegExp(`^${key}-retry-\\d+$`));
  });
});
