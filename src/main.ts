import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import morgan from 'morgan';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import { Environments } from './common/enum/environments.enum';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });
  app.use(morgan('dev'));
  app.useGlobalPipes(new ValidationPipe());

  // Only enable Swagger in non-production environments
  // Swagger documentation should not be accessible in production for security
  const configService = new ConfigService();
  const nodeEnv = configService.get('NODE_ENV');
  const isProduction = nodeEnv === Environments.PRODUCTION;

  if (!isProduction) {
    // Set up Swagger options
    const config = new DocumentBuilder()
      .setTitle('')
      .setDescription('')
      .setVersion('0.0.1')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api', app, document);
  }

  await app.listen(configService.get("PORT") || 8080);
}

bootstrap();