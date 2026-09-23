export type ErrorCode =
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'UPSTREAM_UNAVAILABLE'
  | 'NOT_CONFIGURED';

export class DomainError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export const notFound = (what: string) => new DomainError('NOT_FOUND', `${what} no encontrado`);
export const conflict = (message: string, details?: unknown) =>
  new DomainError('CONFLICT', message, details);
export const invalid = (message: string, details?: unknown) =>
  new DomainError('VALIDATION', message, details);
