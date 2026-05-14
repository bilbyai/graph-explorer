# Graph Explorer Plan

## Product Goal

Build a web app for exploring and querying Neo4j databases without granting write access from the app UI.

The primary hosted use case is for the company to share demo graph databases with users. The project should also work as an open-source self-hosted Neo4j explorer where users can bring their own databases.

The app starts with admin-provisioned connections from `CONNECTIONS_JSON_BASE64`. Users can add their own local connections on top of those shared connections. Any user-added database password must be transmitted only over secure channels and must not be sent to the hosted app server.

## Current Repo Context

- App stack: Next.js 16, React 19, TypeScript, pnpm, Turborepo.
- UI package already contains shadcn-style primitives under `packages/ui/src/components`.
- `apps/web/lib/env.ts` already parses `CONNECTIONS_JSON_BASE64` into a list of Neo4j connections.
- `.env.example` documents the base64 JSON payload shape.

## Product Decisions

- Deployment modes: support both hosted company demo mode and open-source self-hosted mode.
- Shared demo connections: admin-provisioned `CONNECTIONS_JSON_BASE64` connections are available to every app user.
- User connections: users can add their own connections in addition to shared demo connections.
- User connection persistence: user-added connections should persist across browser sessions.
- User connection sync: do not sync user-added connections across devices.
- Secret transport: passwords may be sent only over secure connections to the target Neo4j database. User-added passwords must not be sent to the hosted app server.
- Database permissions: provision database users as read-only because writing does not make sense for this app.
- Neo4j targets: aim to support Aura, self-hosted Neo4j, and localhost where browser/network constraints allow it.
- Multi-database support: not needed for v1.
- Query scope: support `MATCH`/`RETURN` only for v1.
- Query history: include result snapshots, not just query text and params. Keep the last 100 queries, cap total stored snapshots at 25 MB, and cap each stored snapshot at 1 MB.
- Auth: use better-auth. Users must be signed in before using the hosted app. Email auth only for v1.
- Browser support: target current Chrome and Safari.
- Graph visualization: use Reagraph for the Explore canvas, with both 2D and 3D modes.
- Compliance: no special compliance, audit log, or retention requirements for v1.

## Deployment Modes

### Hosted Demo Mode

The company runs the app and provides demo databases through `CONNECTIONS_JSON_BASE64`.

- Users must sign in with better-auth before accessing the app.
- Admin-provisioned demo connections are visible to all users.
- Demo credentials should be read-only at the Neo4j permission layer.
- Demo credentials stay server-side and are never sent to the browser.
- Users may add extra local-only connections in their own browser.
- User-added passwords must not pass through the hosted server.

### Self-Hosted Mode

An open-source user runs their own copy of the app.

- The same `CONNECTIONS_JSON_BASE64` mechanism can provide default connections.
- The self-hosted operator owns the server trust boundary.
- User-added connections can still use the same local-only storage model for consistency.
- Documentation should explain that server-side env credentials are trusted by whoever controls the deployment.
- Self-hosted deployments may explicitly enable a no-auth local mode. This must be opt-in and documented as inappropriate for public hosted deployments.

## Connection Model

### Admin-Provisioned Connections

`CONNECTIONS_JSON_BASE64` should remain server-only. It contains a base64-encoded JSON object:

```json
{
  "connections": [
    {
      "name": "Example",
      "connection_url": "neo4j+s://example.databases.neo4j.io",
      "username": "neo4j",
      "password": "secret"
    }
  ]
}
```

Base64 is only encoding, not encryption. Treat this env var as a secret. Do not expose the decoded payload to client components, logs, telemetry, error payloads, or browser bundles.

Recommended behavior:

- The server exposes only safe connection metadata to the browser: connection id, name, URI host/protocol summary, and optional database name.
- The browser sends selected connection id plus query/search intent to server routes or server actions.
- Server-side code creates the Neo4j driver using the selected secret credentials.
- Server responses return graph/query results only, never credentials.
- These admin-provisioned connections are available to every app user, so they must be safe for public demo access.

### User-Added Connections

User-added connections are supported as local-only browser connections.

What is feasible:

- Store user-added connection details only in the user's browser, not on the app server.
- Persist them across browser sessions.
- Prefer IndexedDB over localStorage for structured connection records; localStorage is acceptable only for non-secret metadata.
- Encrypt local password storage with Web Crypto before persisting it.
- Use a local passphrase or non-extractable browser `CryptoKey` so the stored password is not plain text at rest.
- Connect directly from the browser to Neo4j using the Neo4j JavaScript driver browser build over encrypted protocols such as `neo4j+s://`, `bolt+s://`, or `https://` where supported.
- Do not sync these connections across devices.

Important caveats:

- A remote Neo4j password must still be transmitted to the Neo4j database during authentication. The required guarantee is that it is sent securely to Neo4j and not sent to the hosted app server or third-party services.
- Browser-side code is visible to the client. Neo4j's own docs warn that browser credentials are visible to client-side code, so this mode must rely on user-owned credentials, TLS, and least-privilege database users.
- Some Neo4j deployments may not allow direct browser connections because of protocol, TLS, network, firewall, or CORS constraints.
- If the app is deployed as a shared hosted service, the safest user-added mode is local-only browser storage plus direct browser-to-Neo4j connection. If the app is self-hosted by the user, server-side saved credentials may be acceptable because the user's own server is the trust boundary.

## Security Requirements

- Never include Neo4j passwords in client-rendered props, API responses, logs, analytics, URL params, or error messages.
- Do not store real connection secrets in tracked files.
- Validate `CONNECTIONS_JSON_BASE64` at startup and fail closed on malformed config.
- Assign stable internal ids to admin connections so the client never selects by raw URI or secret-bearing object.
- Use read-only Neo4j credentials for all admin-provisioned demo databases. App-level query blocking is not enough.
- Strongly instruct self-hosted users to create read-only Neo4j users for this app.
- Protect hosted routes and APIs with better-auth session checks.
- For server-mediated queries, run all commands through read sessions/transactions and reject write/admin Cypher before execution.
- For browser-local user connections, require or strongly recommend read-only Neo4j credentials.
- Add result limits and timeouts so broad graph queries cannot accidentally fetch the whole database.

## App Layout

Top-level shell:

- Top menu left: current connection selector.
- Connection menu actions: switch connection, test connection, view metadata, add local connection, edit/delete local connection.
- Top middle tabs: `Explore` and `Query`.
- Persistent status area: connection state, selected database, query latency, result count, and read-only badge.

## Explore UI

Goal: a Neo4j Bloom-like exploration surface for searching, expanding, and understanding graph neighborhoods.

Workspace layout:

- Explore uses a three-panel layout.
- Left panel: graph controls and styling configuration.
- Center panel: Reagraph graph canvas.
- Right panel: selected node or edge details.
- Panels should be resizable or collapsible where practical so the graph can take over the viewport when needed.

Core v1:

- Search bar for node lookup across common text fields and labels.
- Schema panel showing labels, relationship types, and property keys.
- Reagraph graph canvas with a 2D/3D mode switch.
- Node details right panel with labels, properties, degree summary, connected relationships, and expansion actions.
- Relationship details right panel with type, properties, source, target, and direction.
- Expand controls: outgoing, incoming, both directions, relationship type filter, depth limit.
- Result controls: max nodes, max relationships, layout reset, fit to view, clear graph.

Left panel controls:

- Search and filter controls.
- Layout mode and layout settings.
- 2D/3D graph mode toggle.
- Node color rules by label, property, range, or unique value.
- Node size rules by label, property, range, or degree.
- Node icon rules by label or property.
- Node text rules for which property appears on the node.
- Edge color, size, direction, and text rules.
- Category list showing labels or relationship types, colors, counts, and scene visibility.
- Default styling plus rule-based styling, following the attached Bloom-style references.

Center graph canvas:

- Dark graph workspace by default.
- Nodes colored by label or rule.
- Relationship arrows and optional relationship labels.
- Canvas controls for select, lasso, zoom, fit, minimap/overview, and layout reset.
- Direct graph interactions: select node/edge, drag node, expand neighborhood, focus selection, hide/show categories.

Right details panel:

- Shows selected node or edge details.
- Node view includes labels, display name, properties, relationship counts, and quick expand actions.
- Edge view includes relationship type, properties, source node, target node, and direction.
- Empty state should show useful context such as current result counts, visible categories, and selected connection.

Data access:

- Start with safe generated Cypher for search and expansion instead of arbitrary user-written Cypher.
- Apply hard limits to every explore query.
- Prefer parameterized Cypher for all generated queries.
- Use Reagraph for graph rendering. Its React/WebGL model fits the app stack and supports the interaction set we need: layouts, selection, dragging, lasso selection, clustering, expand/collapse, styling, and path-focused interactions.
- Use Reagraph's 2D and 3D rendering modes where they are stable for the target browsers.
- Validate Reagraph behavior in current Chrome and Safari with realistic demo graph sizes before locking final interaction details.
- Target Bloom-style scale through progressive search, neighborhood expansion, result limits, level-of-detail rendering, and pruning controls. Do not try to render an unbounded full database graph in one view.

## Query UI

Goal: let users run Cypher read queries while blocking writes completely.

Core v1:

- Cypher editor with run button.
- Query parameters editor as JSON.
- Results tabs: table, graph, raw JSON, summary.
- Query history stored locally in the browser, including result snapshots.
- Retain the last 100 queries.
- Store snapshots in IndexedDB with a 25 MB total snapshot cap and a 1 MB per-snapshot cap.
- If a result snapshot exceeds the per-snapshot cap, keep the query metadata and mark the snapshot as omitted or truncated.
- Copy/export result actions.
- Clear error messages for blocked write/admin queries.

Write blocking:

- Prefer database-level read-only credentials/roles as the primary protection.
- Add app-level Cypher validation as a second layer.
- For v1, allow only `MATCH` queries that return data with `RETURN`.
- Block mutating/admin commands: `CREATE`, `MERGE`, `SET`, `DELETE`, `DETACH DELETE`, `REMOVE`, `DROP`, `LOAD CSV`, `CALL`, schema/index/constraint changes, and user/role admin commands.
- Do not support `CALL` procedures in v1.
- Run queries in read transaction mode where the driver supports it.

## Implementation Phases

1. Secret-safe connection registry
   - Parse env connections server-side.
   - Generate safe public metadata.
   - Add server-side lookup by connection id.
   - Add a connection test endpoint/action that returns sanitized status.

2. Authentication
   - Add better-auth.
   - Require sign-in for hosted app access.
   - Enable email auth only for v1.
   - Protect server routes/actions that expose connection metadata, query execution, and graph exploration.
   - Add an explicit opt-in no-auth local mode for self-hosted deployments.

3. App shell and connection switcher
   - Build the top navigation, connection selector, add-connection entry point, and `Explore` / `Query` tabs.
   - Show empty, loading, connected, disconnected, and error states.

4. Server-mediated read query API
   - Add Neo4j driver dependency and connection lifecycle handling.
   - Implement query execution with read mode, timeout, limit guidance, and sanitized errors.
   - Add Cypher validation/allowlist behavior.

5. Query UI
   - Build editor, params input, run flow, result table, graph result view, raw JSON, and local history with result snapshots.
   - Retain the last 100 query history entries.
   - Store snapshots in IndexedDB with a 25 MB total snapshot cap and a 1 MB per-snapshot cap.
   - Enforce `MATCH`/`RETURN`-only validation before query execution.

6. Explore UI
   - Add Reagraph.
   - Add schema introspection.
   - Add node search.
   - Add three-panel workspace: left controls, center graph canvas, right details inspector.
   - Add 2D/3D mode switching for the Reagraph canvas.
   - Add graph styling controls for node color, node size, icons, node text, edge styling, and rule-based styling.
   - Add category visibility controls with counts and color indicators.
   - Add expansion controls with hard limits.
   - Test Reagraph performance and interaction quality in current Chrome and Safari.

7. Local-only user connections
   - Prototype browser-only connection storage.
   - Persist local connection records across browser sessions.
   - Encrypt stored passwords using Web Crypto, preferably with IndexedDB for storage.
   - Test direct browser-to-Neo4j connectivity against Aura, self-hosted Neo4j, and localhost.
   - Clearly label the security model in code and UI.

8. Hardening
   - Add unit tests for env parsing, secret redaction, query blocking, and generated Cypher.
   - Add integration tests with a throwaway Neo4j database if practical.
   - Add manual QA for large result limits and failed connection states.

## Remaining Questions

None for the current planning pass.

## References Checked

- Neo4j JavaScript Driver manual: official driver, server-side connection flow, parameterized query guidance, and browser WebSocket support.
- Neo4j Browser connection docs: supported encrypted URI schemes for browser-style Neo4j connections.
- MDN Web Crypto `CryptoKey`: browser cryptographic keys require secure contexts and can be non-extractable.
- Reagraph docs/npm: React WebGL graph visualization library with TypeScript declarations, layouts, clustering, lasso selection, expand/collapse, and graph interaction support.
