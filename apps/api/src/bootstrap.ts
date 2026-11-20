import { ValidationPipe, type INestApplication } from '@nestjs/common'
import { ProblemDetailsFilter } from './watches/presentation/problem-details.filter'

/** HTTP pipeline shared by main.ts and the end-to-end tests, so tests exercise the real configuration. */
export function configureApp(app: INestApplication): INestApplication {
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  app.useGlobalFilters(new ProblemDetailsFilter())
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? true })
  app.enableShutdownHooks()
  return app
}
