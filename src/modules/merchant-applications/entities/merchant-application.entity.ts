import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { BusinessType } from './business-type.entity';
import { ApplicationStatus, OPEN_APPLICATION_STATUSES, RiskStatus } from '../../../common/enums';
import { numericTransformer } from '../../../common/transformers/numeric.transformer';
import { User } from '../../users/entities/user.entity';
import { RiskAssessment } from '../../risk/entities/risk-assessment.entity';
import { ApplicationReview } from '../../reviews/entities/application-review.entity';
// Built from OPEN_APPLICATION_STATUSES so the index and the service check cannot drift apart.
// Changing that list changes this predicate: generate a migration afterwards.
const OPEN_STATUS_PREDICATE = `"application_status" IN (${OPEN_APPLICATION_STATUSES.map((s) => `'${s}'`).join(', ')})`;

@Entity('merchant_applications')
@Index(['created_by_id', 'created_at'])
@Index(['assigned_reviewer_id', 'application_status'])
// A business may have only one application in progress at a time.
@Index('uq_open_application_per_business', ['registration_number'], {
  unique: true,
  where: OPEN_STATUS_PREDICATE,
})
export class MerchantApplication {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // --- Business ---
  @Column({ length: 255 })
  business_name: string;

  @Column({ length: 255 })
  legal_name: string;

  @Column({ type: 'uuid' })
  business_type_id: string;

  @ManyToOne(() => BusinessType, { eager: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'business_type_id' })
  business_type: BusinessType;

  @Column({ length: 100 })
  registration_number: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  tax_id: string | null;

  @Column({ type: 'char', length: 2 })
  country: string;

  // --- Owner / contact ---
  @Column({ length: 200 })
  owner_name: string;

  @Column({ length: 255 })
  owner_email: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  owner_phone: string | null;

  // --- Requested processing ---
  @Column({ type: 'numeric', precision: 15, scale: 2, transformer: numericTransformer })
  requested_volume: number;

  @Column({ type: 'char', length: 3, default: 'USD' })
  currency: string;

  @Column({
    type: 'enum',
    enum: ApplicationStatus,
    enumName: 'merchant_application_status_enum',
    default: ApplicationStatus.DRAFT,
  })
  application_status: ApplicationStatus;

  @Column({
    type: 'enum',
    enum: RiskStatus,
    enumName: 'merchant_risk_status_enum',
    default: RiskStatus.PENDING,
  })
  risk_status: RiskStatus;

  // Object-level ownership boundary: creator (SALES or ADMIN)
  @Column({ type: 'uuid' })
  created_by_id: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'created_by_id' })
  created_by: User;

  // Only this reviewer may record a decision.
  @Column({ type: 'uuid', nullable: true })
  assigned_reviewer_id: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assigned_reviewer_id' })
  assigned_reviewer: User | null;

  @OneToMany(() => RiskAssessment, (risk) => risk.application)
  risk_assessments: RiskAssessment[];

  @OneToMany(() => ApplicationReview, (review) => review.application)
  reviews: ApplicationReview[];

  // --- Timestamps ---
  @Column({ type: 'timestamptz', nullable: true })
  submitted_at: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  decided_at: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
