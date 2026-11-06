import { ConfigService } from '@nestjs/config';
import { RiskResult } from '../../common/enums';
import { AppConfig } from '../../config/configuration';
import { SimulatedRiskProvider, TransientProviderError } from './simulated-risk.provider';

const settings: AppConfig['riskSimulation'] = {
  minScore: 0,
  maxScore: 100,
  autoPassThreshold: 70,
  simulatedLatencyMs: 0,
  transientFailureRate: 0,
};

const providerWith = (overrides: Partial<AppConfig['riskSimulation']> = {}) =>
  new SimulatedRiskProvider({
    get: () => ({ ...settings, ...overrides }),
  } as unknown as ConfigService<AppConfig, true>);

const request = (idempotencyKey: string, requestedVolume = 1000) => ({
  idempotencyKey,
  country: 'US',
  businessTypeId: 'type-1',
  requestedVolume,
});

describe('SimulatedRiskProvider', () => {
  it('is deterministic per idempotency key (same submission, same answer)', async () => {
    const provider = providerWith();

    const first = await provider.assess(request('risk-app-1-1000'));
    const second = await provider.assess(request('risk-app-1-1000'));

    expect(second).toEqual(first);
    expect(first.providerReference).toMatch(/^SIM-KYB-[0-9A-F]{10}$/);
  });

  it('keeps scores in range and derives PASS / MANUAL_REVIEW from the threshold', async () => {
    const provider = providerWith();

    for (let i = 0; i < 50; i++) {
      const { score, result } = await provider.assess(request(`key-${i}`));
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
      expect(result).toBe(score >= 70 ? RiskResult.PASS : RiskResult.MANUAL_REVIEW);
    }
  });

  it('flags high volume and lowers the score', async () => {
    const provider = providerWith();

    const normal = await provider.assess(request('same-key', 1000));
    const high = await provider.assess(request('same-key', 100_000));

    expect(high.summary.flagged).toContain('high_volume');
    expect(high.score).toBe(Math.max(0, normal.score - 15));
  });

  it('never puts request PII into the persisted summary', async () => {
    const response = await providerWith().assess(request('k'));

    expect(Object.keys(response.summary).sort()).toEqual(['checks', 'flagged']);
  });

  it('throws a transient error at the configured failure rate', async () => {
    await expect(providerWith({ transientFailureRate: 1 }).assess(request('k'))).rejects.toBeInstanceOf(
      TransientProviderError,
    );
  });
});
