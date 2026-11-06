export const RISK_QUEUE = 'risk-assessment';
export const RISK_ASSESS_JOB = 'assess';

export interface RiskJobData {
  applicationId: string;
  idempotencyKey: string;
}

// One key per submission: a resubmission after NEEDS_INFO gets a new key (and a new assessment),
// while retries and duplicate deliveries of the same submission share one.
// BullMQ job ids may not contain ":", so "-" is used as separator.
export function riskIdempotencyKey(applicationId: string, submittedAt: Date): string {
  return `risk-${applicationId}-${submittedAt.getTime()}`;
}
