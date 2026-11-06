import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ReviewDecision } from '../../../common/enums';
import { CreateReviewDto } from './create-review.dto';

const errorsFor = async (body: object) =>
  (await validate(plainToInstance(CreateReviewDto, body))).map((e) => e.property);

describe('CreateReviewDto', () => {
  it('lets APPROVE omit remarks', async () => {
    expect(await errorsFor({ decision: ReviewDecision.APPROVE })).toEqual([]);
  });

  it.each([ReviewDecision.REJECT, ReviewDecision.REQUEST_INFO])(
    'requires remarks for %s',
    async (decision) => {
      expect(await errorsFor({ decision })).toEqual(['remarks']);
      expect(await errorsFor({ decision, remarks: '' })).toEqual(['remarks']);
      expect(await errorsFor({ decision, remarks: 'Missing tax documents' })).toEqual([]);
    },
  );

  it('validates remarks when APPROVE sends them anyway', async () => {
    expect(await errorsFor({ decision: ReviewDecision.APPROVE, remarks: '' })).toEqual(['remarks']);
    expect(await errorsFor({ decision: ReviewDecision.APPROVE, remarks: 'x'.repeat(2001) })).toEqual([
      'remarks',
    ]);
  });

  it('rejects an unknown decision', async () => {
    expect(await errorsFor({ decision: 'ESCALATE', remarks: 'x' })).toEqual(['decision']);
  });
});
