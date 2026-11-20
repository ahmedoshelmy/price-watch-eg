import './instrumentation'
import { Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { Transport, type MicroserviceOptions } from '@nestjs/microservices'
import { PROTO_LOADER_OPTIONS, SCRAPER_PACKAGE, SCRAPER_PROTO_PATH } from '@price-watch/contracts'
import { AppModule } from './app.module'
import { loadConfig } from './config'

async function bootstrap(): Promise<void> {
  const config = loadConfig()
  const app = await NestFactory.create(AppModule)
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: SCRAPER_PACKAGE,
      protoPath: SCRAPER_PROTO_PATH,
      url: config.grpcUrl,
      loader: PROTO_LOADER_OPTIONS,
    },
  })
  app.enableShutdownHooks()
  await app.startAllMicroservices()
  await app.listen(config.httpPort)
  Logger.log(
    `Scraper sidecar (${config.mode} mode): gRPC ${config.grpcUrl}, HTTP :${config.httpPort}`,
    'Bootstrap',
  )
}

void bootstrap()
