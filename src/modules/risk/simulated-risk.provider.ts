import { createHash } from 'crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RiskResult } from '../../common/enums';
import { AppConfig } from '../../config/configuration';

export interface RiskProviderRequest {
  idempotencyKey: string;
  country: string;
  businessTypeId: string;
  requestedVolume: number;
}

export interface RiskProviderResponse {
  score: number;
  result: RiskResult;
  providerReference: string;
  // Non-PII summary only: this is persisted as jsonb.
  summary: { checks: string[]; flagged: string[] };
}

export class TransientProviderError extends Error {
  constructor() {
    super('Simulated KYB provider temporarily unavailable');
    this.name = 'TransientProviderError';
  }
}

const HIGH_VOLUME = 100_000;

// Stand-in for a third-party KYB / risk API. The score is derived from the idempotency key, so the
// same submission always gets the same answer, like a real provider honouring an idempotency key.
@Injectable()
export class SimulatedRiskProvider {
  private readonly settings: AppConfig['riskSimulation'];

  constructor(config: ConfigService<AppConfig, true>) {
    this.settings = config.get('riskSimulation', { infer: true });
  }

  async assess(request: RiskProviderRequest): Promise<RiskProviderResponse> {
    await new Promise((resolve) => setTimeout(resolve, this.settings.simulatedLatencyMs));
    if (Math.random() < this.settings.transientFailureRate) {
      throw new TransientProviderError();
    }

    const digest = createHash('sha256').update(request.idempotencyKey).digest();
    const { minScore, maxScore, autoPassThreshold } = this.settings;
    let score = minScore + (digest.readUInt32BE(0) % (maxScore - minScore + 1));

    const flagged: string[] = [];
    if (request.requestedVolume >= HIGH_VOLUME) {
      flagged.push('high_volume');
      score = Math.max(minScore, score - 15);
    }

    return {
      score,
      result: score >= autoPassThreshold ? RiskResult.PASS : RiskResult.MANUAL_REVIEW,
      providerReference: `SIM-KYB-${digest.toString('hex').slice(0, 10).toUpperCase()}`,
      summary: { checks: ['sanctions', 'business_registry', 'adverse_media'], flagged },
    };
  }
}
