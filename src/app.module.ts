import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { configuration, AppConfig } from './config/configuration';
import { dataSourceOptions, envFilePath } from './database/data-source';
console.log(envFilePath,"envFilePath")
@Module({
  imports: [
    //Single source of truth configuration
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath
    }),

    //Reuse dataSourceOptions directly for NestJS runtime
    TypeOrmModule.forRoot({
      ...dataSourceOptions,
      autoLoadEntities: true,
    }),

    // Redis transport connection for BullMQ
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService<AppConfig, true>) => {
        const redis = configService.get('redis', { infer: true });
        return {
          connection: {
            host: redis.host,
            port: redis.port,
            password: redis.password,
            db: redis.db,
          },
        };
      },
    }),
  ],
})
export class AppModule {}