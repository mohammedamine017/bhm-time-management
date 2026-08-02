import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const frontendUrl = config.get('FRONTEND_URL', 'http://127.0.0.1:4202');
  const mobileScanUrl = config.get(
    'MOBILE_SCAN_URL',
    'http://127.0.0.1:4202/mobile-scan',
  );

  app.enableCors({
    origin: [
      frontendUrl,
      frontendUrl.replace('127.0.0.1', 'localhost'),
      new URL(mobileScanUrl).origin,
    ],
  });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );

  const port = config.get('PORT', 3006);
  await app.listen(port, '0.0.0.0');
}

void bootstrap();
