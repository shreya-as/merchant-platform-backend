import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { AuditAction } from '../../common/enums';
import { redact } from '../../common/security/redact';
import { AuditLog } from './entities/audit-log.entity';

export interface AuditEntry {
  action: AuditAction;
  applicationId: string | null;
  actorId: string | null; // null = system (e.g. the risk worker)
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  async record(manager: EntityManager, entry: AuditEntry): Promise<void> {
    await manager.insert(AuditLog, {
      action: entry.action,
      application_id: entry.applicationId,
      actor_id: entry.actorId,
      metadata: redact(entry.metadata ?? {}) as Record<string, any>,
    });
  }
}
