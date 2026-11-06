import { Module } from '@nestjs/common';
import { MerchantApplicationsService } from './merchant-applications.service';
import { MerchantApplicationsController } from './merchant-applications.controller';

@Module({
  providers: [MerchantApplicationsService],
  controllers: [MerchantApplicationsController]
})
export class MerchantApplicationsModule {}
