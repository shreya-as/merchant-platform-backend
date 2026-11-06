import { RoleType } from '../../../common/enums';

// Plain-text passwords are hashed with bcrypt by the seed runner. Dev only.
export const SEED_USERS = [
  {
    id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    email: 'admin@merchantplatform.com',
    password: 'Password123!',
    role: RoleType.ADMIN,
  },
  {
    id: 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
    email: 'reviewer@merchantplatform.com',
    password: 'Password123!',
    role: RoleType.REVIEWER,
  },
  {
    id: 'c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
    email: 'sales@merchantplatform.com',
    password: 'Password123!',
    role: RoleType.SALES,
  },
];
