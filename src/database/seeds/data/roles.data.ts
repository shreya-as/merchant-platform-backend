import { RoleType } from '../../../common/enums';

export const SEED_ROLES = [
  { id: '10eebc99-9c0b-4ef8-bb6d-6bb9bd380a01', name: RoleType.ADMIN },
  { id: '10eebc99-9c0b-4ef8-bb6d-6bb9bd380a02', name: RoleType.REVIEWER },
  { id: '10eebc99-9c0b-4ef8-bb6d-6bb9bd380a03', name: RoleType.SALES },
];

export const SEED_BUSINESS_TYPES = [
  { id: '20eebc99-9c0b-4ef8-bb6d-6bb9bd380a01', code: 'ECOMMERCE', name: 'E-Commerce' },
  { id: '20eebc99-9c0b-4ef8-bb6d-6bb9bd380a02', code: 'RETAIL', name: 'Retail' },
  { id: '20eebc99-9c0b-4ef8-bb6d-6bb9bd380a03', code: 'SAAS', name: 'Software as a Service' },
];
