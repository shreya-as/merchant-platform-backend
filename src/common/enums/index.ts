export enum RoleType {
  ADMIN = 'ADMIN',
  REVIEWER = 'REVIEWER',
  SALES = 'SALES',
}

export enum ApplicationStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  UNDER_REVIEW = 'UNDER_REVIEW',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  NEEDS_INFO = 'NEEDS_INFO',
}

export enum RiskStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export enum ReviewDecision {
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
  REQUEST_INFO = 'REQUEST_INFO',
}

// Application states that count as "in progress" (one per business at a time).
export const OPEN_APPLICATION_STATUSES = [
  ApplicationStatus.DRAFT,
  ApplicationStatus.SUBMITTED,
  ApplicationStatus.UNDER_REVIEW,
  ApplicationStatus.NEEDS_INFO,
] as const;

// Application states in which the creator may still edit it.
export const EDITABLE_APPLICATION_STATUSES = [
  ApplicationStatus.DRAFT,
  ApplicationStatus.NEEDS_INFO,
] as const;

export enum RiskResult {
  PASS = 'PASS', // score >= RISK_PASS_THRESHOLD
  MANUAL_REVIEW = 'MANUAL_REVIEW', // below threshold: reviewer must look closer
}

export enum AuditAction {
  APPLICATION_CREATED = 'APPLICATION_CREATED',
  APPLICATION_UPDATED = 'APPLICATION_UPDATED',
  APPLICATION_SUBMITTED = 'APPLICATION_SUBMITTED',
  APPLICATION_ASSIGNED = 'APPLICATION_ASSIGNED',
  APPLICATION_REVIEWED = 'APPLICATION_REVIEWED',
  RISK_ASSESSMENT_COMPLETED = 'RISK_ASSESSMENT_COMPLETED',
  RISK_ASSESSMENT_FAILED = 'RISK_ASSESSMENT_FAILED',
  RISK_ASSESSMENT_REQUEUED = 'RISK_ASSESSMENT_REQUEUED',
}
