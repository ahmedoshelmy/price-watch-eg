import './instrumentation'
import { Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { configureApp } from './bootstrap'
import { loadConfig } from './config'

async function bootstrap(): Promise<void> {
  const config = loadConfig()
  const app = configureApp(await NestFactory.create(AppModule))
  await app.listen(config.port)
  Logger.log(`Price Watch API listening on :${config.port}`, 'Bootstrap')
}

void bootstrap()
