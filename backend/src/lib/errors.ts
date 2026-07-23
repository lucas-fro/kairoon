export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 400,
    /** Código estável para o cliente tratar casos específicos (ex.: 'TRIAL_EXPIRED'). */
    public readonly code?: string,
  ) {
    super(message)
    this.name = 'AppError'
  }
}
