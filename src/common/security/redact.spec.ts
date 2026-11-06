import { REDACTED, maskEmail, maskTail, redact } from './redact';

describe('redact', () => {
  it('replaces secrets regardless of key casing or separators', () => {
    expect(
      redact({ password: 'a', password_hash: 'b', 'Access-Token': 'c', jwtSecret: 'd', Authorization: 'e' }),
    ).toEqual({
      password: REDACTED,
      password_hash: REDACTED,
      'Access-Token': REDACTED,
      jwtSecret: REDACTED,
      Authorization: REDACTED,
    });
  });

  it('masks PII but keeps it distinguishable', () => {
    expect(redact({ owner_email: 'jane@acme.com', owner_phone: '+15550100', tax_id: 'US-EIN-987654321' })).toEqual(
      { owner_email: 'j***@acme.com', owner_phone: '*****0100', tax_id: '************4321' },
    );
  });

  it('walks nested objects and arrays without mutating the input', () => {
    const input = { user: { email: 'a@b.com', tags: [{ token: 'x' }] }, at: new Date(0), count: 3 };

    const out = redact(input);

    expect(out).toEqual({
      user: { email: 'a***@b.com', tags: [{ token: REDACTED }] },
      at: new Date(0),
      count: 3,
    });
    expect(input.user.email).toBe('a@b.com');
  });

  it('passes primitives and null through', () => {
    expect(redact(null)).toBeNull();
    expect(redact('text')).toBe('text');
    expect(redact({ email: null })).toEqual({ email: null });
  });
});

describe('maskEmail / maskTail', () => {
  it('masks emails and short values', () => {
    expect(maskEmail('jane@acme.com')).toBe('j***@acme.com');
    expect(maskEmail('no-at-sign')).toBe('******sign');
    expect(maskTail('1234')).toBe('****');
    expect(maskTail('123456789', 2)).toBe('*******89');
  });
});
