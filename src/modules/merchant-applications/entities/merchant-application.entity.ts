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
import { ApplicationStatus, RiskStatus } from '../../../common/enums';
import { User } from '../../users/entities/user.entity';
import { RiskAssessment } from '../../risk/entities/risk-assessment.entity';
import { ApplicationReview } from '../../reviews/entities/application-review.entity';

@Entity('merchant_applications')
@Index(['created_by_id', 'created_at'])
@Index(['assigned_reviewer_id', 'application_status'])
export class MerchantApplication {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255 })
  business_name: string;

  @Column({ length: 255 })
  legal_name: string;

  @Column({ type: 'uuid' })
  business_type_id: string;

  @ManyToOne(() => BusinessType, { eager: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'business_type_id' })
  business_type: BusinessType;

  @Column({ length: 255 })
  owner_email: string;

  @Column({ length: 50 })
  owner_phone: string;

  @Column({ type: 'numeric', precision: 15, scale: 2 })
  requested_volume: number;

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

  @Column({ type: 'uuid', nullable: true })
  assigned_reviewer_id: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assigned_reviewer_id' })
  assigned_reviewer: User | null;

  @OneToMany(() => RiskAssessment, (risk) => risk.application)
  risk_assessments: RiskAssessment[];

  @OneToMany(() => ApplicationReview, (review) => review.application)
  reviews: ApplicationReview[];
  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
