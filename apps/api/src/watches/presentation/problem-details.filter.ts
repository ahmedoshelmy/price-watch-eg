import { Catch, HttpException, HttpStatus, Logger, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common'
import type { Request, Response } from 'express'
import { DomainError, NotFoundError } from '../domain/errors'

/** Every error leaves as RFC 9457 problem+json; domain errors map to 400/404, anything unknown to 500. */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name)

  catch(error: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp()
    const response = http.getResponse<Response>()
    const request = http.getRequest<Request>()
    const { status, title, detail } = this.describe(error)
    if (status >= 500) this.logger.error(error instanceof Error ? (error.stack ?? error.message) : String(error))
    response
      .status(status)
      .type('application/problem+json')
      .json({ type: 'about:blank', title, status, detail, instance: request.url })
  }

  private describe(error: unknown): { status: number; title: string; detail: string } {
    if (error instanceof DomainError) return { status: 400, title: 'Bad Request', detail: error.message }
    if (error instanceof NotFoundError) return { status: 404, title: 'Not Found', detail: error.message }
    if (error instanceof HttpException) {
      const body = error.getResponse()
      const message = typeof body === 'object' && body !== null && 'message' in body ? body.message : error.message
      return { status: error.getStatus(), title: error.name, detail: Array.isArray(message) ? message.join('; ') : String(message) }
    }
    return { status: HttpStatus.INTERNAL_SERVER_ERROR, title: 'Internal Server Error', detail: 'Unexpected error' }
  }
}
