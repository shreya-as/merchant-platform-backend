import { PartialType } from '@nestjs/swagger';
import { CreateMerchantApplicationDto } from './create-merchant-application.dto';

// Status, risk and reviewer fields are not editable here; they change through dedicated endpoints.
// skipNullProperties: false -> omitted fields are skipped, but an explicit null on a required field
// (e.g. "businessName": null) fails validation instead of reaching a NOT NULL column as a 500.
// Fields marked @IsOptional() on the create DTO (taxId, ownerPhone) can still be cleared with null.
export class UpdateMerchantApplicationDto extends PartialType(CreateMerchantApplicationDto, {
  skipNullProperties: false,
}) {}
