# Effect TS Adoption Plan

## Goal

Introduce Effect TS at the server-side graph boundary where it can improve typed failures, resource cleanup, and dependency injection without migrating the React UI or every API route at once.

## First Slice

Start with `POST /api/query` because it is the smallest complete path through the important server boundaries:

- route authentication
- request decoding
- Cypher validation
- admin connection lookup
- Neo4j read execution
- Neo4j session cleanup
- typed error to HTTP response mapping

## Initial Scope

- Add `effect` to `@graph-explorer/web` only.
- Convert only `apps/web/app/api/query/route.ts` first.
- Use Effect Schema only for this route's request body.
- Keep Zod in the remaining routes until each route is migrated intentionally.
- Add reusable Effect Layers for auth, connection lookup, and Neo4j access.

## Service Boundaries

Create three small services:

- `AuthService`: requires route access from a `Request`.
- `ConnectionService`: resolves an admin connection by ID.
- `Neo4jService`: runs read queries and owns Neo4j session finalization.

The route should compose services and convert typed errors into HTTP responses at the edge.

## Typed Errors

Model route failures as typed Effect errors:

- `AuthRequired`
- `InvalidRequest`
- `InvalidCypher`
- `ConnectionNotFound`
- `QueryFailed`

## Client Error Policy

Return detailed but safe structured errors:

- include category, status, safe message, validation details, and Neo4j error code when present
- do not include passwords, full connection URLs, stack traces, raw driver metadata, or environment-derived secrets

## Success Criteria

- `/api/query` remains behaviorally compatible for valid requests.
- Query failures still return an appropriate HTTP error.
- Neo4j sessions are closed through Effect finalization.
- The services can be reused by the next API route migration.
- `pnpm --filter @graph-explorer/web typecheck` passes.

## Follow-Up Migration Order

After `/api/query` is stable, migrate routes that reuse the same shape:

1. `POST /api/connections/test`
2. `POST /api/explore/adjacency`
3. `POST /api/explore/expand`
4. `POST /api/explore/relationship-summary`
5. `POST /api/explore/search`
6. `POST /api/explore/suggest`
7. `GET /api/explore/schema`

Migrate `searchGraph` only after the route layer is proven, because it has additional recoverable fallback behavior.
