// Central list of what must never be written to logs or the audit trail in clear text.
// Keys are compared case-insensitively with "_" and "-" removed, so password_hash, passwordHash
// and Password-Hash all match.

const SECRET_KEYS = new Set([
  'password',
  'passwordhash',
  'token',
  'accesstoken',
  'refreshtoken',
  'authorization',
  'secret',
  'jwtsecret',
  'apikey',
  'cookie',
]);

// Personal / tax data: kept partially visible so a human can still tell records apart.
const PII_KEYS = new Set(['taxid', 'owneremail', 'ownerphone', 'email', 'phone']);

export const REDACTED = '[REDACTED]';

const normalise = (key: string) => key.toLowerCase().replace(/[_-]/g, '');

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return maskTail(email);
  return `${local.slice(0, 1)}***@${domain}`;
}

// Keeps the last 4 characters: "US-EIN-987654321" -> "************4321".
export function maskTail(value: string, visible = 4): string {
  if (value.length <= visible) return '*'.repeat(value.length);
  return '*'.repeat(value.length - visible) + value.slice(-visible);
}

function maskPii(key: string, value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return key.includes('email') ? maskEmail(value) : maskTail(value);
}

// Deep copy of `input` with secrets replaced and PII masked. Safe for logs and audit metadata.
export function redact<T>(input: T, depth = 0): T {
  if (depth > 10 || input === null || typeof input !== 'object') return input;
  if (input instanceof Date) return input;
  if (Array.isArray(input)) return input.map((item) => redact(item, depth + 1)) as T;

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const k = normalise(key);
    if (SECRET_KEYS.has(k)) out[key] = REDACTED;
    else if (PII_KEYS.has(k)) out[key] = maskPii(k, value);
    else out[key] = redact(value, depth + 1);
  }
  return out as T;
}
