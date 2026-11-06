import { ConflictException } from '@nestjs/common';
import { ApplicationStatus, ReviewDecision } from '../../common/enums';
import {
  ASSIGNABLE_STATUSES,
  DECISION_TO_STATUS,
  assertTransition,
  canTransition,
} from './application-state-machine';

const { DRAFT, SUBMITTED, UNDER_REVIEW, APPROVED, REJECTED, NEEDS_INFO } = ApplicationStatus;
const ALL = Object.values(ApplicationStatus);

const ALLOWED: Array<[ApplicationStatus, ApplicationStatus]> = [
  [DRAFT, SUBMITTED],
  [NEEDS_INFO, SUBMITTED],
  [SUBMITTED, UNDER_REVIEW],
  [UNDER_REVIEW, APPROVED],
  [UNDER_REVIEW, REJECTED],
  [UNDER_REVIEW, NEEDS_INFO],
];

const isAllowed = (from: ApplicationStatus, to: ApplicationStatus) =>
  ALLOWED.some(([f, t]) => f === from && t === to);

describe('application state machine', () => {
  it.each(ALLOWED)('allows %s -> %s', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
    expect(() => assertTransition(from, to)).not.toThrow();
  });

  // Every other pair of statuses (36 combinations minus the 6 allowed ones) is rejected.
  const forbidden = ALL.flatMap((from) => ALL.map((to) => [from, to] as const)).filter(
    ([from, to]) => !isAllowed(from, to),
  );

  it.each(forbidden)('rejects %s -> %s with 409', (from, to) => {
    expect(canTransition(from, to)).toBe(false);
    expect(() => assertTransition(from, to)).toThrow(ConflictException);
  });

  it('treats APPROVED and REJECTED as terminal', () => {
    for (const to of ALL) {
      expect(canTransition(APPROVED, to)).toBe(false);
      expect(canTransition(REJECTED, to)).toBe(false);
    }
  });

  it('cannot skip the risk review: DRAFT/SUBMITTED never jump straight to a decision', () => {
    for (const from of [DRAFT, SUBMITTED, NEEDS_INFO]) {
      for (const to of [APPROVED, REJECTED]) {
        expect(canTransition(from, to)).toBe(false);
      }
    }
  });

  it('maps every review decision to a status reachable from UNDER_REVIEW', () => {
    expect(DECISION_TO_STATUS).toEqual({
      [ReviewDecision.APPROVE]: APPROVED,
      [ReviewDecision.REJECT]: REJECTED,
      [ReviewDecision.REQUEST_INFO]: NEEDS_INFO,
    });
    for (const status of Object.values(DECISION_TO_STATUS)) {
      expect(canTransition(UNDER_REVIEW, status)).toBe(true);
    }
  });

  it('only allows reviewer assignment between submission and decision', () => {
    expect([...ASSIGNABLE_STATUSES].sort()).toEqual([SUBMITTED, UNDER_REVIEW].sort());
  });
});
