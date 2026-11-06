import { AdvancedConsoleLogger, QueryRunner } from 'typeorm';

// TypeORM's default logger prints bound parameters next to each query, which would put password
// hashes, emails and tax IDs into application logs whenever DB_LOGGING=true. This logger keeps the
// SQL (useful for debugging) and drops the values.
export class ParameterlessQueryLogger extends AdvancedConsoleLogger {
  logQuery(query: string, _parameters?: unknown, queryRunner?: QueryRunner): void {
    super.logQuery(query, undefined, queryRunner);
  }

  logQueryError(error: string, query: string, _parameters?: unknown, queryRunner?: QueryRunner): void {
    super.logQueryError(error, query, undefined, queryRunner);
  }

  logQuerySlow(time: number, query: string, _parameters?: unknown, queryRunner?: QueryRunner): void {
    super.logQuerySlow(time, query, undefined, queryRunner);
  }
}
