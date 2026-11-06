import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ApplicationStatus, AuditAction, RiskStatus } from '../../common/enums';
import { AuditService } from '../audit/audit.service';
import { User } from '../users/entities/user.entity';
import { MerchantApplication } from '../merchant-applications/entities/merchant-application.entity';
import {
  DECISION_TO_STATUS,
  assertTransition,
} from '../merchant-applications/application-state-machine';
import { ApplicationReview } from './entities/application-review.entity';
import { CreateReviewDto } from './dto/create-review.dto';

const FINAL_STATUSES: readonly ApplicationStatus[] = [ApplicationStatus.APPROVED, ApplicationStatus.REJECTED];

@Injectable()
export class ReviewsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
  ) {}

  // Records a decision by the assigned reviewer and moves the application:
  // APPROVE -> APPROVED, REJECT -> REJECTED, REQUEST_INFO -> NEEDS_INFO (editable again by sales).
  async decide(applicationId: string, dto: CreateReviewDto, user: User): Promise<ApplicationReview> {
    return this.dataSource.transaction(async (manager) => {
      const application = await manager.findOne(MerchantApplication, {
        where: { id: applicationId },
        lock: { mode: 'pessimistic_write' },
        loadEagerRelations: false,
      });
      if (!application) {
        throw new NotFoundException(`Application ${applicationId} not found`);
      }
      if (application.assigned_reviewer_id !== user.id) {
        throw new ForbiddenException('Only the assigned reviewer can decide on this application');
      }
      if (application.risk_status !== RiskStatus.COMPLETED) {
        throw new ConflictException('Risk review has not completed for this application');
      }

      const from = application.application_status;
      const to = DECISION_TO_STATUS[dto.decision];
      assertTransition(from, to);

      const review = await manager.save(
        manager.create(ApplicationReview, {
          application_id: applicationId,
          reviewer_id: user.id,
          decision: dto.decision,
          remarks: dto.remarks ?? null,
        }),
      );

      application.application_status = to;
      application.decided_at = FINAL_STATUSES.includes(to) ? review.decided_at : null;
      await manager.save(application);

      await this.auditService.record(manager, {
        action: AuditAction.APPLICATION_REVIEWED,
        applicationId,
        actorId: user.id,
        // Remarks are free text and may contain personal data: record only that they exist.
        metadata: { reviewId: review.id, decision: dto.decision, from, to, hasRemarks: !!dto.remarks },
      });
      return review;
    });
  }
}
