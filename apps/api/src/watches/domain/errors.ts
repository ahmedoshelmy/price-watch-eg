/** A request broke a domain rule (maps to HTTP 400). */
export class DomainError extends Error {
  override readonly name = 'DomainError'
}

/** The aggregate does not exist (maps to HTTP 404). */
export class NotFoundError extends Error {
  override readonly name = 'NotFoundError'
}
