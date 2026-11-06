import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBadRequestResponse,
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
import { User } from '../users/entities/user.entity';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { MerchantApplicationsService } from './merchant-applications.service';
import { CreateMerchantApplicationDto } from './dto/create-merchant-application.dto';
import { UpdateMerchantApplicationDto } from './dto/update-merchant-application.dto';
import { ListMerchantApplicationsDto } from './dto/list-merchant-applications.dto';
import { AssignReviewerDto } from './dto/assign-reviewer.dto';

@ApiTags('merchant-applications')
@ApiBearerAuth(SWAGGER_BEARER)
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@Controller('merchant-applications')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class MerchantApplicationsController {
  constructor(private readonly applicationsService: MerchantApplicationsService) {}

  @Post()
  @Roles(RoleType.ADMIN, RoleType.SALES)
  @ApiOperation({ summary: 'Create a DRAFT application (ADMIN, SALES)' })
  @ApiForbiddenResponse({ description: 'Caller is REVIEWER' })
  @ApiConflictResponse({ description: 'Business already has an application in progress' })
  @ApiBadRequestResponse({ description: 'Validation failed or unknown businessTypeId' })
  create(@Body() dto: CreateMerchantApplicationDto, @CurrentUser() user: User) {
    return this.applicationsService.create(dto, user);
  }

  @Get()
  @ApiOperation({
    summary: 'List applications (paginated)',
    description: 'SALES see only their own applications; ADMIN and REVIEWER see all. PII is masked.',
  })
  findAll(@CurrentUser() user: User, @Query() query: ListMerchantApplicationsDto) {
    return this.applicationsService.findAll(user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one application with risk assessments and reviews' })
  @ApiNotFoundResponse({ description: 'Not found, or owned by another SALES user' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.applicationsService.findOne(id, user);
  }

  @Patch(':id')
  @Roles(RoleType.ADMIN, RoleType.SALES)
  @ApiOperation({ summary: 'Edit a DRAFT / NEEDS_INFO application (creator or ADMIN)' })
  @ApiForbiddenResponse({ description: 'Not the creator and not ADMIN' })
  @ApiNotFoundResponse({ description: 'Not found, or owned by another SALES user' })
  @ApiConflictResponse({ description: 'Application is not editable in its current status' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMerchantApplicationDto,
    @CurrentUser() user: User,
  ) {
    return this.applicationsService.update(id, dto, user);
  }

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  @Roles(RoleType.ADMIN, RoleType.SALES)
  @ApiOperation({
    summary: 'Submit for review (DRAFT / NEEDS_INFO -> SUBMITTED)',
    description: 'Queues an asynchronous risk assessment. On success the application moves to UNDER_REVIEW.',
  })
  @ApiConflictResponse({ description: 'Invalid status transition' })
  submit(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.applicationsService.submit(id, user);
  }

  @Post(':id/assign')
  @HttpCode(HttpStatus.OK)
  @Roles(RoleType.ADMIN)
  @ApiOperation({ summary: 'Assign a REVIEWER (ADMIN only)' })
  @ApiForbiddenResponse({ description: 'Caller is not ADMIN' })
  @ApiBadRequestResponse({ description: 'reviewerId is not a REVIEWER' })
  @ApiConflictResponse({ description: 'Application is not SUBMITTED or UNDER_REVIEW' })
  assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignReviewerDto,
    @CurrentUser() user: User,
  ) {
    return this.applicationsService.assignReviewer(id, dto.reviewerId, user);
  }

  @Post(':id/risk-review/retry')
  @HttpCode(HttpStatus.OK)
  @Roles(RoleType.ADMIN)
  @ApiOperation({ summary: 'Requeue a FAILED risk review (ADMIN only)' })
  @ApiForbiddenResponse({ description: 'Caller is not ADMIN' })
  @ApiConflictResponse({ description: 'Risk review is not FAILED' })
  retryRiskReview(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.applicationsService.requeueRiskReview(id, user);
  }
}
