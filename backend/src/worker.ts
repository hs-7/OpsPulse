import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { startObservability } from './common/observability';
import { WorkerModule } from './worker.module';

async function bootstrap(): Promise<void> {
  startObservability();
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks();
}

void bootstrap().catch((error: unknown) => {
  const logger = new Logger('WorkerBootstrap');
  logger.error('Worker failed to start', error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
