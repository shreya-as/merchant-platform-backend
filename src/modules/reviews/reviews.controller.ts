import { Body, Controller, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { RoleType } from '../../common/enums';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SWAGGER_BEARER } from '../../common/swagger.constants';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { User } from '../users/entities/user.entity';
import { CreateReviewDto } from './dto/create-review.dto';
import { ReviewsService } from './reviews.service';

@ApiTags('reviews')
@ApiBearerAuth(SWAGGER_BEARER)
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@Controller('merchant-applications/:id/reviews')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Post()
  @Roles(RoleType.REVIEWER)
  @ApiOperation({
    summary: 'Record a decision (assigned REVIEWER only)',
    description:
      'APPROVE -> APPROVED, REJECT -> REJECTED, REQUEST_INFO -> NEEDS_INFO. ' +
      'Requires status UNDER_REVIEW and a completed risk review. Remarks are required unless approving.',
  })
  @ApiForbiddenResponse({ description: 'Not a REVIEWER, or not the reviewer assigned to this application' })
  @ApiNotFoundResponse({ description: 'Application not found' })
  @ApiConflictResponse({ description: 'Invalid status transition or risk review not completed' })
  decide(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateReviewDto,
    @CurrentUser() user: User,
  ) {
    return this.reviewsService.decide(id, dto, user);
  }
}
