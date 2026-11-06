import { EntityManager } from 'typeorm';
import { AuditAction } from '../../common/enums';
import { REDACTED } from '../../common/security/redact';
import { AuditLog } from './entities/audit-log.entity';
import { AuditService } from './audit.service';

describe('AuditService', () => {
  const service = new AuditService();
  let manager: { insert: jest.Mock };

  beforeEach(() => {
    manager = { insert: jest.fn() };
  });

  it('writes the entry through the caller-supplied manager (same transaction)', async () => {
    await service.record(manager as unknown as EntityManager, {
      action: AuditAction.APPLICATION_SUBMITTED,
      applicationId: 'app-1',
      actorId: 'user-1',
      metadata: { from: 'DRAFT', to: 'SUBMITTED' },
    });

    expect(manager.insert).toHaveBeenCalledWith(AuditLog, {
      action: AuditAction.APPLICATION_SUBMITTED,
      application_id: 'app-1',
      actor_id: 'user-1',
      metadata: { from: 'DRAFT', to: 'SUBMITTED' },
    });
  });

  it('defaults metadata to {} and allows a system actor (null)', async () => {
    await service.record(manager as unknown as EntityManager, {
      action: AuditAction.RISK_ASSESSMENT_COMPLETED,
      applicationId: 'app-1',
      actorId: null,
    });

    expect(manager.insert).toHaveBeenCalledWith(
      AuditLog,
      expect.objectContaining({ actor_id: null, metadata: {} }),
    );
  });

  it('redacts secrets and masks PII before persisting', async () => {
    await service.record(manager as unknown as EntityManager, {
      action: AuditAction.APPLICATION_UPDATED,
      applicationId: 'app-1',
      actorId: 'user-1',
      metadata: { password: 'hunter2', ownerEmail: 'jane@acme.com', taxId: 'US-EIN-987654321' },
    });

    expect(manager.insert.mock.calls[0][1].metadata).toEqual({
      password: REDACTED,
      ownerEmail: 'j***@acme.com',
      taxId: '************4321',
    });
  });
});
