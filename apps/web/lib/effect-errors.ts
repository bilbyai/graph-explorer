import { Data } from "effect"

export class AuthRequired extends Data.TaggedError("AuthRequired")<{
  readonly message: string
}> {}

export class InvalidRequest extends Data.TaggedError("InvalidRequest")<{
  readonly message: string
  readonly details?: unknown
}> {}

export class InvalidCypher extends Data.TaggedError("InvalidCypher")<{
  readonly message: string
}> {}

export class ConnectionNotFound extends Data.TaggedError("ConnectionNotFound")<{
  readonly message: string
  readonly connectionId: string
}> {}

export class QueryFailed extends Data.TaggedError("QueryFailed")<{
  readonly message: string
  readonly causeDetails: SafeErrorDetails
}> {}

export type RouteError =
  | AuthRequired
  | InvalidRequest
  | InvalidCypher
  | ConnectionNotFound
  | QueryFailed

export type SafeErrorDetails = {
  readonly name: string
  readonly message: string
  readonly code?: string
}

export function getSafeErrorDetails(error: unknown): SafeErrorDetails {
  const details: SafeErrorDetails = {
    name: error instanceof Error ? error.name : typeof error,
    message: error instanceof Error ? error.message : String(error),
  }

  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code

    if (typeof code === "string") {
      return { ...details, code }
    }
  }

  return details
}
