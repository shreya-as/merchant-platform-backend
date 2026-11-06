import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateMerchantApplicationDto } from './create-merchant-application.dto';
import { UpdateMerchantApplicationDto } from './update-merchant-application.dto';
import { ListMerchantApplicationsDto } from './list-merchant-applications.dto';

const errorsFor = async <T extends object>(cls: new () => T, body: object) =>
  (await validate(plainToInstance(cls, body))).map((e) => e.property);

const validCreate = {
  businessName: 'Acme',
  legalName: 'Acme LLC',
  businessTypeId: '20eebc99-9c0b-4ef8-bb6d-6bb9bd380a01',
  registrationNumber: 'REG-1',
  country: 'US',
  ownerName: 'Jane Doe',
  ownerEmail: 'jane@acme.com',
  requestedVolume: 1000.5,
};

describe('CreateMerchantApplicationDto', () => {
  it('accepts a complete application', async () => {
    expect(await errorsFor(CreateMerchantApplicationDto, validCreate)).toEqual([]);
  });

  it('requires the business, owner and volume fields', async () => {
    expect(await errorsFor(CreateMerchantApplicationDto, {})).toEqual(
      expect.arrayContaining([
        'businessName',
        'legalName',
        'businessTypeId',
        'registrationNumber',
        'country',
        'ownerName',
        'ownerEmail',
        'requestedVolume',
      ]),
    );
  });

  it.each([
    ['country', 'USA'],
    ['ownerEmail', 'not-an-email'],
    ['ownerPhone', '5550100'],
    ['requestedVolume', -5],
    ['requestedVolume', 10.123],
    ['currency', 'XXX1'],
    ['businessTypeId', 'not-a-uuid'],
  ])('rejects an invalid %s (%p)', async (field, value) => {
    expect(await errorsFor(CreateMerchantApplicationDto, { ...validCreate, [field]: value })).toEqual([
      field,
    ]);
  });
});

describe('UpdateMerchantApplicationDto', () => {
  it('accepts an empty patch', async () => {
    expect(await errorsFor(UpdateMerchantApplicationDto, {})).toEqual([]);
  });

  it('rejects null on required columns instead of letting it reach the database', async () => {
    expect(
      await errorsFor(UpdateMerchantApplicationDto, { businessName: null, requestedVolume: null }),
    ).toEqual(['businessName', 'requestedVolume']);
  });

  it('allows null to clear the nullable columns', async () => {
    expect(await errorsFor(UpdateMerchantApplicationDto, { taxId: null, ownerPhone: null })).toEqual([]);
  });
});

describe('ListMerchantApplicationsDto', () => {
  it('converts query-string numbers', async () => {
    const dto = plainToInstance(ListMerchantApplicationsDto, { page: '2', limit: '20' });
    expect(await validate(dto)).toEqual([]);
    expect(dto).toMatchObject({ page: 2, limit: 20 });
  });

  it('rejects an oversized page and an unknown status', async () => {
    expect(await errorsFor(ListMerchantApplicationsDto, { limit: '500', status: 'NOPE' })).toEqual([
      'status',
      'limit',
    ]);
  });
});
