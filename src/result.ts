/** Shared result envelope (production-style AsRes). */

export type Ok<T> = { data: T; error?: undefined }
export type Err<E> = { error: E; data?: undefined }
export type Result<T, E = AppError> = Ok<T> | Err<E>

export type AppError = {
  code: string
  message: string
  /** Upstream HTTP status when relevant. */
  status?: number
  details?: unknown
}

export function ok<T>(data: T): Ok<T> {
  return { data }
}

export function err<E extends AppError>(error: E): Err<E> {
  return { error }
}

export function isOk<T, E>(r: Result<T, E>): r is Ok<T> {
  return r.error === undefined
}

export function isErr<T, E>(r: Result<T, E>): r is Err<E> {
  return r.error !== undefined
}
