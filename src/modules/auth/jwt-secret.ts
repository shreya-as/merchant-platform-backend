import { ConfigService } from '@nestjs/config';

export const MIN_JWT_SECRET_LENGTH = 32;

// Anyone who knows the signing secret can mint an ADMIN token, so there is no default and short
// secrets are refused at startup. Generate one with: openssl rand -base64 48
export function requireJwtSecret(config: ConfigService): string {
  const secret = config.get<string>('auth.jwtSecret');
  if (!secret) {
    throw new Error('JWT_SECRET is not set. Generate one with: openssl rand -base64 48');
  }
  if (secret.length < MIN_JWT_SECRET_LENGTH) {
    throw new Error(`JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters long`);
  }
  return secret;
}
