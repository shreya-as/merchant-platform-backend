import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfig } from '../../config/configuration';
import { AuditModule } from '../audit/audit.module';
import { MerchantApplication } from '../merchant-applications/entities/merchant-application.entity';
import { RiskAssessment } from './entities/risk-assessment.entity';
import { RISK_QUEUE } from './risk.constants';
import { RiskReviewProcessor } from './risk-review.processor';
import { RiskReviewQueue } from './risk-review.queue';
import { SimulatedRiskProvider } from './simulated-risk.provider';

@Module({
  imports: [
    TypeOrmModule.forFeature([RiskAssessment, MerchantApplication]),
    BullModule.registerQueueAsync({
      name: RISK_QUEUE,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => {
        const queue = config.get('queue', { infer: true });
        return {
          defaultJobOptions: {
            attempts: queue.attempts,
            backoff: { type: 'exponential', delay: queue.backoffDelayMs }, // 2s, 4s, 8s, ...
            removeOnComplete: { count: 1000 },
            removeOnFail: { count: 5000 }, // keep failures around for inspection
          },
        };
      },
    }),
    AuditModule,
  ],
  // The worker runs in the API process for now; move RiskReviewProcessor into a separate
  // worker entrypoint to scale it independently.
  providers: [RiskReviewQueue, RiskReviewProcessor, SimulatedRiskProvider],
  exports: [RiskReviewQueue],
})
export class RiskModule {}
