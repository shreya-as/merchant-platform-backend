import { ApplicationStatus, ReviewDecision, RiskStatus } from '../../../common/enums';

const SALES_ID = 'c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33';
const REVIEWER_ID = 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';

export const SEED_APPLICATIONS = [
  {
    id: 'e4eebc99-9c0b-4ef8-bb6d-6bb9bd380a55',
    business_name: 'Acme Global Commerce',
    legal_name: 'Acme Global Commerce LLC',
    businessTypeCode: 'ECOMMERCE',
    owner_email: 'jane.doe@acme-corp.com',
    owner_phone: '+1-555-0100',
    requested_volume: 250000,
    application_status: ApplicationStatus.UNDER_REVIEW,
    risk_status: RiskStatus.COMPLETED,
    created_by_id: SALES_ID,
    assigned_reviewer_id: REVIEWER_ID,
  },
  {
    id: 'f5eebc99-9c0b-4ef8-bb6d-6bb9bd380a66',
    business_name: 'Acme Retail Outlet',
    legal_name: 'Acme Global Commerce LLC',
    businessTypeCode: 'RETAIL',
    owner_email: 'jane.doe@acme-corp.com',
    owner_phone: '+1-555-0100',
    requested_volume: 50000,
    application_status: ApplicationStatus.APPROVED,
    risk_status: RiskStatus.COMPLETED,
    created_by_id: SALES_ID,
    assigned_reviewer_id: REVIEWER_ID,
  },
  {
    id: '06eebc99-9c0b-4ef8-bb6d-6bb9bd380a99',
    business_name: 'Northwind Cloud',
    legal_name: 'Northwind Cloud Inc.',
    businessTypeCode: 'SAAS',
    owner_email: 'ops@northwind.io',
    owner_phone: '+1-555-0199',
    requested_volume: 120000,
    application_status: ApplicationStatus.DRAFT,
    risk_status: RiskStatus.PENDING,
    created_by_id: SALES_ID,
    assigned_reviewer_id: null,
  },
];

export const SEED_RISK_ASSESSMENTS = [
  {
    id: '03eebc99-9c0b-4ef8-bb6d-6bb9bd380a01',
    application_id: 'e4eebc99-9c0b-4ef8-bb6d-6bb9bd380a55',
    idempotency_key: 'seed-risk-e4eebc99',
    risk_score: 62,
    result: 'MANUAL_REVIEW',
    provider_reference: 'SIM-KYB-0001',
    response_summary: { checks: ['sanctions', 'business_registry'], flagged: ['high_volume'] },
  },
  {
    id: '03eebc99-9c0b-4ef8-bb6d-6bb9bd380a02',
    application_id: 'f5eebc99-9c0b-4ef8-bb6d-6bb9bd380a66',
    idempotency_key: 'seed-risk-f5eebc99',
    risk_score: 88,
    result: 'PASS',
    provider_reference: 'SIM-KYB-0002',
    response_summary: { checks: ['sanctions', 'business_registry'], flagged: [] },
  },
];

export const SEED_REVIEWS = [
  {
    id: '04eebc99-9c0b-4ef8-bb6d-6bb9bd380a01',
    application_id: 'f5eebc99-9c0b-4ef8-bb6d-6bb9bd380a66',
    reviewer_id: REVIEWER_ID,
    decision: ReviewDecision.APPROVE,
    remarks: 'Documents verified, risk score above threshold.',
  },
];
