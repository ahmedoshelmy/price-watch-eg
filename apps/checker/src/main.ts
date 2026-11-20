import './instrumentation'
import { Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { loadConfig } from './config'

async function bootstrap(): Promise<void> {
  const config = loadConfig()
  const app = await NestFactory.create(AppModule)
  app.enableShutdownHooks()
  await app.listen(config.port)
  Logger.log(`Checker worker up (health on :${config.port}, concurrency ${config.concurrency})`, 'Bootstrap')
}

void bootstrap()
