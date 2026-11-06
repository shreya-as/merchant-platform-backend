import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { MerchantApplication } from '../../merchant-applications/entities/merchant-application.entity';
import { User } from '../../users/entities/user.entity';
import { ReviewDecision } from '../../../common/enums';

@Entity('application_reviews')
export class ApplicationReview {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  application_id: string;

  @ManyToOne(() => MerchantApplication, (app) => app.reviews, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'application_id' })
  application: MerchantApplication;

  @Column({ type: 'uuid' })
  reviewer_id: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'reviewer_id' })
  reviewer: User;

  @Column({
    type: 'enum',
    enum: ReviewDecision,
  })
  decision: ReviewDecision;

  @Column({ type: 'text', nullable: true })
  remarks: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  decided_at: Date;
}