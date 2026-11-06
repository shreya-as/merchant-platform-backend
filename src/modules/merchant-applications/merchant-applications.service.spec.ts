import { Test, TestingModule } from '@nestjs/testing';
import { MerchantApplicationsService } from './merchant-applications.service';

describe('MerchantApplicationsService', () => {
  let service: MerchantApplicationsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MerchantApplicationsService],
    }).compile();

    service = module.get<MerchantApplicationsService>(MerchantApplicationsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
