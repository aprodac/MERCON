/**
 * Typed error base class for new/touched controller code. Not retrofitted
 * across the whole codebase in one pass — existing string-sentinel errors
 * (`error.message === 'CUSTOMER_NOT_FOUND'`) keep working as before.
 */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly httpStatus: number,
    public readonly code: string,
    public readonly userSafe: boolean = true,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message = 'This operation conflicts with existing data') {
    super(message, 409, 'CONFLICT');
  }
}

/** Translates known Prisma error codes into an AppError; returns null for
 *  anything else so the caller can fall back to its own handling. */
export function mapPrismaError(err: any): AppError | null {
  if (err?.code === 'P2002') return new ConflictError('A record with this value already exists');
  if (err?.code === 'P2025') return new NotFoundError();
  return null;
}
