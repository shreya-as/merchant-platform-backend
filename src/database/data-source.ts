import 'reflect-metadata';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { DataSource, DataSourceOptions } from 'typeorm';
import { configuration } from '../config/configuration';

// Runs outside Nest (typeorm CLI, seeds), so load the same env file ConfigModule uses.
export const envFilePath = path.resolve(
  process.cwd(),
  `src/config/env/.env.${process.env.NODE_ENV ?? 'local'}`,
);
dotenv.config({ path: envFilePath });

const config = configuration();
export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: config.database.host,
  port: config.database.port,
  username: config.database.username,
  password: config.database.password,
  database: config.database.name,
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  synchronize: config.database.synchronize, // strictly false
  logging: config.database.logging,
  ssl: config.database.ssl ? { rejectUnauthorized: false } : false,
};

export const AppDataSource = new DataSource(dataSourceOptions);
