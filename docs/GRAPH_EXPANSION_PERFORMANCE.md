# Graph Expansion Performance

This document captures the performance findings from investigating slow graph expansion.

## Current Fix

- `apps/web/components/graph-explorer-app.tsx` now merges expanded graph payloads with `Set` lookups instead of repeated `Array.some` scans.
- Synthetic benchmark for merging `50k` nodes and `100k` relationships with a `240` node / `120` relationship expansion improved from about `148ms` to about `26ms`.

## Recommended Improvements

1. Reuse Neo4j drivers instead of creating and closing one per query.

   Files: `apps/web/lib/neo4j.ts`, `apps/web/lib/browser-neo4j.ts`

   Every search, schema read, expansion, and relationship summary currently creates a driver, opens a session, and closes the driver. Neo4j drivers should be long-lived, with short-lived sessions. Cache drivers per connection and close them only when the connection changes or the process shuts down.

2. Batch multi-node expansion into one API request and one Cypher query.

   Files: `apps/web/components/graph-explorer-app.tsx`, `apps/web/lib/neo4j.ts`, `apps/web/lib/browser-neo4j.ts`, `apps/web/app/api/explore/expand/route.ts`

   Expanding multiple selected nodes currently loops serially, issuing one request/query per node. Add a batched expansion path using `UNWIND $nodeIds AS nodeId` to fetch neighborhoods for all selected nodes in one round trip.

3. Apply `Set`-based de-duping during Neo4j result serialization.

   Files: `apps/web/lib/neo4j.ts`, `apps/web/lib/browser-neo4j.ts`

   `addNode` and `addRelationship` still de-dupe with `.some()` over growing arrays. Large query results or repeated path segments can become quadratic. Maintain node and relationship ID sets while building each `GraphPayload`.

4. Reduce Reagraph work during expansion and on large graphs.

   File: `apps/web/components/reagraph-workspace.tsx`

   Current settings combine `forceDirected2d`, `animated`, `labelType="all"`, edge labels, arrows, draggable nodes, lasso, and a custom node renderer. Add adaptive behavior such as disabling animation while expanding, switching labels to `auto` above a node threshold, or hiding edge labels for large graphs.

5. Cache or simplify custom node label textures.

   File: `apps/web/components/reagraph-workspace.tsx`

   The custom 2D renderer creates canvas textures for node labels. If Reagraph remounts nodes after expansion, this can recreate many canvases and textures. Cache textures by caption/size/color, or use Reagraph's built-in labels above a graph-size threshold.

6. Style only visible nodes, or cache styled nodes.

   Files: `apps/web/components/reagraph-workspace.tsx`, `apps/web/lib/node-styling.ts`

   `styleNodes(graph, styling)` styles every graph node even when categories or IDs are hidden. Compute styles for `visibleNodes` only, or cache per-node style results keyed by styling version.

7. Cache full-text index discovery.

   File: `apps/web/lib/neo4j.ts`

   Search checks `SHOW FULLTEXT INDEXES` before querying. Cache available full-text node index names per connection with a TTL or invalidate on connection/schema refresh.

8. Make relationship summaries lazy or batched.

   Files: `apps/web/components/reagraph-workspace.tsx`, `apps/web/components/graph-explorer-app.tsx`, `apps/web/app/api/explore/relationship-summary/route.ts`

   Context-menu relationship summaries can trigger multiple queries for multi-selection. Fetch only when the submenu is opened, cache in-flight requests, and add a batched API for selected node IDs.

9. Memoize graph lookup indexes for details rendering.

   File: `apps/web/components/graph-explorer-app.tsx`

   Selection details currently scan arrays with `.find()` and compute degree with `.filter()`. Memoize `nodesById`, `relationshipsById`, and degree counts for the current graph.

10. Avoid expensive query-result table rendering for large responses.

    File: `apps/web/components/graph-explorer-app.tsx`

    The query result table stringifies every visible cell and uses a stringified row key. Use stable row indexes/IDs, precompute or truncate display values, and consider virtualizing the table for large result sets.

## Suggested Order

1. Implement Neo4j driver caching.
2. Add batched expansion for multi-node selection.
3. Apply `Set`-based de-duping in Neo4j serialization.
4. Add adaptive Reagraph rendering for large graphs or active expansion.
5. Cache node label textures if rendering remains slow after layout and request fixes.
