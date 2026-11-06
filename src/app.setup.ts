import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { SWAGGER_BEARER } from './common/swagger.constants';
import { AppConfig } from './config/configuration';

// Shared by main.ts and the e2e tests, so the API under test is wired exactly like production.
export function configureApp(app: INestApplication): void {
  const config = app.get<ConfigService<AppConfig, true>>(ConfigService);

  app.setGlobalPrefix(config.get('apiPrefix', { infer: true }));

  // Without this, class-validator decorators on DTOs are ignored.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip properties not declared on the DTO
      forbidNonWhitelisted: true, // ...and reject the request if any were sent (e.g. "role" on login)
      transform: true, // turn plain JSON into DTO class instances
    }),
  );

  // Close DB / Redis connections cleanly on SIGTERM (container stop, rolling deploy).
  app.enableShutdownHooks();

  const swagger = config.get('swagger', { infer: true });
  if (swagger.enabled) {
    setupSwagger(app, swagger.path);
  }
}

// OpenAPI docs: UI at /<path>, raw spec at /<path>-json.
export function setupSwagger(app: INestApplication, path: string): void {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Merchant Platform API')
      .setDescription(
        'Merchant onboarding: applications, asynchronous risk review and reviewer decisions.\n\n' +
          'Log in with `POST /auth/login`, copy `accessToken`, then click **Authorize**.',
      )
      .setVersion('1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, SWAGGER_BEARER)
      .build(),
  );
  SwaggerModule.setup(path, app, document, {
    swaggerOptions: { persistAuthorization: true },
  });
}
