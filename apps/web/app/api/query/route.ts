import { Effect, Schema } from "effect"

import { validateReadOnlyMatchQuery } from "@/lib/cypher"
import {
  InvalidCypher,
  InvalidRequest,
  type RouteError,
} from "@/lib/effect-errors"
import {
  ApiServicesLive,
  AuthService,
  ConnectionService,
  Neo4jService,
} from "@/lib/effect-services"

export const runtime = "nodejs"

const queryParamsSchema = Schema.Record({
  key: Schema.String,
  value: Schema.Unknown,
})

const requestSchema = Schema.Struct({
  connectionId: Schema.String.pipe(Schema.nonEmptyString()),
  query: Schema.String,
  params: Schema.optionalWith(queryParamsSchema, {
    default: () => ({}),
  }),
})

function decodeRequest(request: Request) {
  return Effect.tryPromise({
    try: () => request.json(),
    catch: (error) =>
      new InvalidRequest({
        message: "Invalid query request",
        details: String(error),
      }),
  }).pipe(
    Effect.flatMap((body) =>
      Schema.decodeUnknown(requestSchema)(body).pipe(
        Effect.mapError(
          (error) =>
            new InvalidRequest({
              message: "Invalid query request",
              details: String(error),
            })
        )
      )
    )
  )
}

function validateCypher(query: string) {
  const validation = validateReadOnlyMatchQuery(query)

  return validation.ok
    ? Effect.succeed(validation.query)
    : Effect.fail(new InvalidCypher({ message: validation.error }))
}

function getRouteErrorStatus(error: RouteError) {
  switch (error._tag) {
    case "AuthRequired":
      return 401
    case "InvalidRequest":
    case "InvalidCypher":
      return 400
    case "ConnectionNotFound":
      return 404
    case "QueryFailed":
      return 502
  }
}

function routeErrorToResponse(error: RouteError) {
  const status = getRouteErrorStatus(error)
  const details: Record<string, unknown> = {
    category: error._tag,
    status,
  }

  if (error._tag === "InvalidRequest" && error.details) {
    details.validation = error.details
  }

  if (error._tag === "ConnectionNotFound") {
    details.connectionId = error.connectionId
  }

  if (error._tag === "QueryFailed") {
    details.cause = error.causeDetails
  }

  return Response.json({ error: error.message, details }, { status })
}

function queryProgram(request: Request) {
  return Effect.gen(function* () {
    const auth = yield* AuthService
    const connections = yield* ConnectionService
    const neo4j = yield* Neo4jService

    yield* auth.requireRouteAccess(request)

    const body = yield* decodeRequest(request)
    const query = yield* validateCypher(body.query)
    const connection = yield* connections.getAdminConnection(body.connectionId)

    return yield* neo4j.runReadQuery(connection, query, body.params)
  })
}

export async function POST(request: Request) {
  return Effect.runPromise(
    queryProgram(request).pipe(
      Effect.map((result) => Response.json(result)),
      Effect.catchAll((error) => Effect.succeed(routeErrorToResponse(error))),
      Effect.provide(ApiServicesLive)
    )
  )
}
