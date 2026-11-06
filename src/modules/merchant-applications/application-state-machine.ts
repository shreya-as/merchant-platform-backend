import { ConflictException } from '@nestjs/common';
import { ApplicationStatus, ReviewDecision } from '../../common/enums';

const { DRAFT, SUBMITTED, UNDER_REVIEW, APPROVED, REJECTED, NEEDS_INFO } = ApplicationStatus;

// The only legal status changes. Every write to application_status goes through assertTransition.
//
//   DRAFT ──submit──▶ SUBMITTED ──risk job done──▶ UNDER_REVIEW ──approve──▶ APPROVED
//                        ▲                              │ ──reject───▶ REJECTED
//   NEEDS_INFO ──submit──┘ ◀────request info────────────┘
const TRANSITIONS: Record<ApplicationStatus, readonly ApplicationStatus[]> = {
  [DRAFT]: [SUBMITTED],
  [NEEDS_INFO]: [SUBMITTED],
  [SUBMITTED]: [UNDER_REVIEW],
  [UNDER_REVIEW]: [APPROVED, REJECTED, NEEDS_INFO],
  [APPROVED]: [],
  [REJECTED]: [],
};

export const DECISION_TO_STATUS: Record<ReviewDecision, ApplicationStatus> = {
  [ReviewDecision.APPROVE]: APPROVED,
  [ReviewDecision.REJECT]: REJECTED,
  [ReviewDecision.REQUEST_INFO]: NEEDS_INFO,
};

// Statuses in which a reviewer may be (re)assigned: after submission, before a final decision.
export const ASSIGNABLE_STATUSES: readonly ApplicationStatus[] = [SUBMITTED, UNDER_REVIEW];

export function canTransition(from: ApplicationStatus, to: ApplicationStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: ApplicationStatus, to: ApplicationStatus): void {
  if (!canTransition(from, to)) {
    throw new ConflictException(`Invalid status transition ${from} -> ${to}`);
  }
}
