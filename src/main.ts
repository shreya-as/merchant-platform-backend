import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { AppConfig } from './config/configuration';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);

  const config = app.get<ConfigService<AppConfig, true>>(ConfigService);
  const port = config.get('port', { infer: true });
  await app.listen(port);

  const swagger = config.get('swagger', { infer: true });
  if (swagger.enabled) {
    Logger.log(`Swagger UI available at http://localhost:${port}/${swagger.path}`, 'Bootstrap');
  }
}
void bootstrap();
