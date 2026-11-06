import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Check,
} from 'typeorm';
import { MerchantApplication } from '../../merchant-applications/entities/merchant-application.entity';

@Entity('risk_assessments')
@Check(`"risk_score" >= 0 AND "risk_score" <= 100`)
export class RiskAssessment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  application_id: string;

  @ManyToOne(() => MerchantApplication, (app) => app.risk_assessments, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'application_id' })
  application: MerchantApplication;

  @Column({ unique: true, length: 150 })
  idempotency_key: string;

  @Column({ type: 'int' })
  risk_score: number;

  @Column({ length: 50 })
  result: string;

  @Column({ length: 100, nullable: true })
  provider_reference: string;

  @Column({ type: 'jsonb', default: {} })
  response_summary: Record<string, any>;

  @CreateDateColumn({ type: 'timestamptz' })
  processed_at: Date;
}