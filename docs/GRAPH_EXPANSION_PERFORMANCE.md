# Graph Expansion Performance

This document captures the performance findings from investigating slow graph expansion.

## Current Fix

- `apps/web/components/graph-explorer-app.tsx` now merges expanded graph payloads with `Set` lookups instead of repeated `Array.some` scans.
- Synthetic benchmark for merging `50k` nodes and `100k` relationships with a `240` node / `120` relationship expansion improved from about `148ms` to about `26ms`.
- `apps/web/lib/neo4j.ts` and `apps/web/lib/browser-neo4j.ts` now reuse Neo4j drivers across read operations and only close cached drivers when a connection is replaced or removed.
- Neo4j result serialization now de-dupes graph nodes and relationships with `Set` lookups while building each `GraphPayload`.
- Multi-node expansion now batches selected node IDs into one request and one Cypher query using `UNWIND $nodeIds AS nodeId`.
- `apps/web/components/reagraph-workspace.tsx` now adapts rendering during expansion and for larger graph views by disabling animation/dragging, reducing label work, hiding arrows, limiting lasso work, and skipping the custom node texture renderer.

## Recommended Improvements

1. Cache or simplify custom node label textures.

   File: `apps/web/components/reagraph-workspace.tsx`

   The custom 2D renderer creates canvas textures for node labels. If Reagraph remounts nodes after expansion, this can recreate many canvases and textures. Cache textures by caption/size/color, or use Reagraph's built-in labels above a graph-size threshold.

2. Style only visible nodes, or cache styled nodes.

   Files: `apps/web/components/reagraph-workspace.tsx`, `apps/web/lib/node-styling.ts`

   `styleNodes(graph, styling)` styles every graph node even when categories or IDs are hidden. Compute styles for `visibleNodes` only, or cache per-node style results keyed by styling version.

3. Cache full-text index discovery.

   File: `apps/web/lib/neo4j.ts`

   Search checks `SHOW FULLTEXT INDEXES` before querying. Cache available full-text node index names per connection with a TTL or invalidate on connection/schema refresh.

4. Make relationship summaries lazy or batched.

   Files: `apps/web/components/reagraph-workspace.tsx`, `apps/web/components/graph-explorer-app.tsx`, `apps/web/app/api/explore/relationship-summary/route.ts`

   Context-menu relationship summaries can trigger multiple queries for multi-selection. Fetch only when the submenu is opened, cache in-flight requests, and add a batched API for selected node IDs.

5. Memoize graph lookup indexes for details rendering.

   File: `apps/web/components/graph-explorer-app.tsx`

   Selection details currently scan arrays with `.find()` and compute degree with `.filter()`. Memoize `nodesById`, `relationshipsById`, and degree counts for the current graph.

6. Avoid expensive query-result table rendering for large responses.

   File: `apps/web/components/graph-explorer-app.tsx`

   The query result table stringifies every visible cell and uses a stringified row key. Use stable row indexes/IDs, precompute or truncate display values, and consider virtualizing the table for large result sets.

## Suggested Order

1. Cache node label textures if rendering remains slow after layout and request fixes.
2. Style only visible nodes, or cache styled nodes.
3. Cache full-text index discovery.
4. Make relationship summaries lazy or batched.
5. Memoize graph lookup indexes for details rendering.
