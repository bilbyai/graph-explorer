import { Context, Effect, Layer } from "effect"

import { type AppAccess, getRouteAccess } from "@/lib/auth-guard"
import {
  type AdminConnection,
  getAdminConnection,
} from "@/lib/connection-registry"
import {
  AuthRequired,
  ConnectionNotFound,
  type QueryFailed,
} from "@/lib/effect-errors"
import type { QueryResultPayload } from "@/lib/graph-types"
import {
  type QueryParams,
  runReadQueryEffect as runNeo4jReadQueryEffect,
} from "@/lib/neo4j"

type AuthServiceShape = {
  readonly requireRouteAccess: (
    request: Request
  ) => Effect.Effect<AppAccess, AuthRequired>
}

type ConnectionServiceShape = {
  readonly getAdminConnection: (
    id: string
  ) => Effect.Effect<AdminConnection, ConnectionNotFound>
}

type Neo4jServiceShape = {
  readonly runReadQuery: (
    connection: AdminConnection,
    query: string,
    params?: QueryParams
  ) => Effect.Effect<QueryResultPayload, QueryFailed>
}

export class AuthService extends Context.Tag("AuthService")<
  AuthService,
  AuthServiceShape
>() {}

export class ConnectionService extends Context.Tag("ConnectionService")<
  ConnectionService,
  ConnectionServiceShape
>() {}

export class Neo4jService extends Context.Tag("Neo4jService")<
  Neo4jService,
  Neo4jServiceShape
>() {}

const authService: AuthServiceShape = {
  requireRouteAccess: (request) =>
    Effect.tryPromise(() => getRouteAccess(request)).pipe(
      Effect.flatMap((access) =>
        access
          ? Effect.succeed(access)
          : Effect.fail(new AuthRequired({ message: "Sign in required" }))
      ),
      Effect.catchAll(() =>
        Effect.fail(new AuthRequired({ message: "Sign in required" }))
      )
    ),
}

const connectionService: ConnectionServiceShape = {
  getAdminConnection: (id) =>
    Effect.fromNullable(getAdminConnection(id)).pipe(
      Effect.mapError(
        () =>
          new ConnectionNotFound({
            message: "Connection not found",
            connectionId: id,
          })
      )
    ),
}

const neo4jService: Neo4jServiceShape = {
  runReadQuery: (
    connection: AdminConnection,
    query: string,
    params: QueryParams = {}
  ): Effect.Effect<QueryResultPayload, QueryFailed> =>
    runNeo4jReadQueryEffect(connection, query, params),
}

export const AuthServiceLive = Layer.succeed(AuthService, authService)
export const ConnectionServiceLive = Layer.succeed(
  ConnectionService,
  connectionService
)
export const Neo4jServiceLive = Layer.succeed(Neo4jService, neo4jService)

export const ApiServicesLive = Layer.mergeAll(
  AuthServiceLive,
  ConnectionServiceLive,
  Neo4jServiceLive
)
