import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import type { Env } from './config/env.schema';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  const config = app.get(ConfigService<Env, true>);
  const logger = new Logger('Bootstrap');

  // Rate limiting IP-based chhe, etle proxy pachhal saacho client IP joiye.
  // ⚠️ Production ma aa number tamara actual proxy hops jetlo j rakhvo —
  // vadhare rakhso to X-Forwarded-For spoof kari ne rate limit bypass thai shake.
  app.set('trust proxy', 1);

  app.use(helmet());

  app.enableCors({
    origin: true,
    credentials: true,
  });

  app.setGlobalPrefix(config.get('API_PREFIX', { infer: true }));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  app.enableShutdownHooks();

  const port = config.get('PORT', { infer: true });
  await app.listen(port);

  const prefix = config.get('API_PREFIX', { infer: true });
  logger.log(`API ready  →  http://localhost:${port}/${prefix}`);
  logger.log(`Health     →  http://localhost:${port}/${prefix}/health`);

  if (config.get('OTP_EXPOSE_IN_RESPONSE', { infer: true })) {
    logger.warn(
      'OTP_EXPOSE_IN_RESPONSE=true — OTP API response ma dekhaay chhe (dev only!)',
    );
  }

  if (!config.get('SHOPIFY_CLIENT_ID', { infer: true })) {
    logger.warn(
      'Shopify credentials nathi — /products endpoints fail thashe. ' +
        '.env ma SHOPIFY_CLIENT_ID ane SHOPIFY_CLIENT_SECRET bharo ' +
        '(Dev Dashboard → abd-mobile-api → Settings), pachhi: npm run shopify:verify',
    );
  }
}

void bootstrap();
