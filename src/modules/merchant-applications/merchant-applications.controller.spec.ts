import { Test, TestingModule } from '@nestjs/testing';
import { MerchantApplicationsController } from './merchant-applications.controller';

describe('MerchantApplicationsController', () => {
  let controller: MerchantApplicationsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MerchantApplicationsController],
    }).compile();

    controller = module.get<MerchantApplicationsController>(MerchantApplicationsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
