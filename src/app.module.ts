import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { configuration, AppConfig } from './config/configuration';
import { dataSourceOptions, envFilePath } from './database/data-source';
import { AuthModule } from './modules/auth/auth.module';
import { MerchantApplicationsModule } from './modules/merchant-applications/merchant-applications.module';
import { ReviewsModule } from './modules/reviews/reviews.module';

@Module({
  imports: [
    // Single source of truth configuration
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath,
    }),

    // Reuse dataSourceOptions directly for NestJS runtime
    TypeOrmModule.forRoot({
      ...dataSourceOptions,
      autoLoadEntities: true,
    }),

    // Redis transport connection for BullMQ
    BullModule.forRootAsync({
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

    AuthModule,
    MerchantApplicationsModule,
    ReviewsModule,
  ],
})
export class AppModule {}
