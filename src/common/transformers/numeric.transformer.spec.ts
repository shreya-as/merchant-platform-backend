import { numericTransformer } from './numeric.transformer';

describe('numericTransformer', () => {
  it('turns Postgres NUMERIC strings into numbers', () => {
    expect(numericTransformer.from('250000.50')).toBe(250000.5);
  });

  it('keeps null and undefined', () => {
    expect(numericTransformer.from(null)).toBeNull();
    expect(numericTransformer.from(undefined)).toBeUndefined();
  });

  it('writes numbers unchanged', () => {
    expect(numericTransformer.to(42.1)).toBe(42.1);
  });
});
