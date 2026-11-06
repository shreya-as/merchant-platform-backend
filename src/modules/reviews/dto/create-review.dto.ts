import { IsEnum, IsNotEmpty, IsString, MaxLength, ValidateIf } from 'class-validator';
import { ReviewDecision } from '../../../common/enums';

export class CreateReviewDto {
  @IsEnum(ReviewDecision)
  decision: ReviewDecision;

  // Required for REJECT and REQUEST_INFO (the merchant/sales need to know why); optional for APPROVE.
  @ValidateIf((dto: CreateReviewDto) => dto.decision !== ReviewDecision.APPROVE || dto.remarks !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  remarks?: string;
}
