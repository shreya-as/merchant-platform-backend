import { ConfigService } from '@nestjs/config';
import { MIN_JWT_SECRET_LENGTH, requireJwtSecret } from './jwt-secret';

const configWith = (secret: string | undefined) => ({ get: () => secret }) as unknown as ConfigService;

describe('requireJwtSecret', () => {
  it('returns a sufficiently long secret', () => {
    const secret = 'a'.repeat(MIN_JWT_SECRET_LENGTH);
    expect(requireJwtSecret(configWith(secret))).toBe(secret);
  });

  it.each([undefined, ''])('refuses to start without a secret (%p)', (secret) => {
    expect(() => requireJwtSecret(configWith(secret))).toThrow('JWT_SECRET is not set');
  });

  it('refuses a short, guessable secret', () => {
    expect(() => requireJwtSecret(configWith('changeme'))).toThrow(/at least 32 characters/);
  });
});
