import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { RiskModule } from '../risk/risk.module';
import { MerchantApplication } from './entities/merchant-application.entity';
import { BusinessType } from './entities/business-type.entity';
import { MerchantApplicationsService } from './merchant-applications.service';
import { MerchantApplicationsController } from './merchant-applications.controller';

@Module({
  imports: [TypeOrmModule.forFeature([MerchantApplication, BusinessType]), AuditModule, RiskModule],
  providers: [MerchantApplicationsService],
  controllers: [MerchantApplicationsController],
})
export class MerchantApplicationsModule {}
