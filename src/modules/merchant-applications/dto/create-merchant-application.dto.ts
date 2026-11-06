import {
  IsEmail,
  IsISO31661Alpha2,
  IsISO4217CurrencyCode,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
} from 'class-validator';

export class CreateMerchantApplicationDto {
  // --- Business ---
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  businessName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  legalName: string;

  @IsUUID()
  businessTypeId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  registrationNumber: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  taxId?: string;

  @IsISO31661Alpha2()
  country: string;

  // --- Owner / contact ---
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  ownerName: string;

  @IsEmail()
  @MaxLength(255)
  ownerEmail: string;

  @IsOptional()
  @Matches(/^\+[1-9]\d{6,14}$/, { message: 'ownerPhone must be E.164, e.g. +15550100' })
  ownerPhone?: string;

  // --- Requested processing ---
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(9_999_999_999_999.99) // numeric(15,2)
  requestedVolume: number;

  @IsOptional()
  @IsISO4217CurrencyCode()
  currency?: string;
}
