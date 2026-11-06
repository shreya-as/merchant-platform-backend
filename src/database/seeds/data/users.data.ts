import { RoleType } from '../../../common/enums';

// Demo staff accounts (dev only). No passwords here: the seed runner sets all of them to
// SEED_USER_PASSWORD, or to a random one it prints once.
export const SEED_USERS = [
  {
    id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    email: 'admin@merchantplatform.com',
    role: RoleType.ADMIN,
  },
  {
    id: 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
    email: 'reviewer@merchantplatform.com',
    role: RoleType.REVIEWER,
  },
  {
    id: 'c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
    email: 'sales@merchantplatform.com',
    role: RoleType.SALES,
  },
];
