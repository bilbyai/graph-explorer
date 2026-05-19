"use client"

import neo4j, {
  type Driver,
  type Node as Neo4jNode,
  type Relationship as Neo4jRelationship,
  type Path,
} from "neo4j-driver"

import type {
  GraphNodeRecord,
  GraphPayload,
  GraphRelationshipRecord,
  GraphSearchSuggestion,
  NodeRelationshipSummary,
  QueryResultPayload,
  SchemaPayload,
} from "@/lib/graph-types"
import {
  decryptLocalPassword,
  type LocalConnection,
} from "@/lib/local-connections"
import { getDefaultLabelColor as getCategoryColor } from "@/lib/node-styling"

type QueryParams = Record<string, unknown>

type GraphAccumulator = {
  graph: GraphPayload
  nodeIds: Set<string>
  relationshipIds: Set<string>
}

type CachedLocalDriver = {
  driver: Driver
  fingerprint: string
}

const localDrivers = new Map<string, CachedLocalDriver>()

function createGraphAccumulator(): GraphAccumulator {
  return {
    graph: {
      nodes: [],
      relationships: [],
    },
    nodeIds: new Set(),
    relationshipIds: new Set(),
  }
}

function isNeo4jNode(value: unknown): value is Neo4jNode {
  return (
    typeof value === "object" &&
    value !== null &&
    "labels" in value &&
    "properties" in value &&
    "elementId" in value
  )
}

function isNeo4jRelationship(value: unknown): value is Neo4jRelationship {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    "properties" in value &&
    "startNodeElementId" in value &&
    "endNodeElementId" in value
  )
}

function isNeo4jPath(value: unknown): value is Path {
  return (
    typeof value === "object" &&
    value !== null &&
    "segments" in value &&
    Array.isArray((value as Path).segments)
  )
}

function toPlainValue(value: unknown): unknown {
  if (neo4j.isInt(value)) {
    return value.inSafeRange() ? value.toNumber() : value.toString()
  }

  if (Array.isArray(value)) {
    return value.map(toPlainValue)
  }

  if (isNeo4jNode(value)) {
    return serializeNode(value)
  }

  if (isNeo4jRelationship(value)) {
    return serializeRelationship(value)
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        toPlainValue(nestedValue),
      ])
    )
  }

  return value
}

function serializeProperties(properties: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(properties).map(([key, value]) => [key, toPlainValue(value)])
  )
}

function getCaption(properties: Record<string, unknown>, fallback: string) {
  for (const field of ["nameEn", "name", "title", "label", "_aid", "id"]) {
    const value = properties[field]

    if (typeof value === "string" && value.trim()) {
      return value
    }
  }

  return fallback
}

function serializeNode(node: Neo4jNode): GraphNodeRecord {
  const labels = [...node.labels]
  const properties = serializeProperties(node.properties)
  const primaryLabel = labels[0] ?? "Node"

  return {
    id: node.elementId,
    labels,
    caption: getCaption(properties, node.elementId),
    properties,
    size: Math.max(8, Math.min(30, labels.length * 4 + 12)),
    color: getCategoryColor(primaryLabel),
  }
}

function serializeRelationship(
  relationship: Neo4jRelationship
): GraphRelationshipRecord {
  return {
    id: relationship.elementId,
    type: relationship.type,
    source: relationship.startNodeElementId,
    target: relationship.endNodeElementId,
    properties: serializeProperties(relationship.properties),
  }
}

function addNode(accumulator: GraphAccumulator, node: GraphNodeRecord) {
  if (!accumulator.nodeIds.has(node.id)) {
    accumulator.nodeIds.add(node.id)
    accumulator.graph.nodes.push(node)
  }
}

function addRelationship(
  accumulator: GraphAccumulator,
  relationship: GraphRelationshipRecord
) {
  if (!accumulator.relationshipIds.has(relationship.id)) {
    accumulator.relationshipIds.add(relationship.id)
    accumulator.graph.relationships.push(relationship)
  }
}

function mergeGraphValue(value: unknown, accumulator: GraphAccumulator) {
  if (isNeo4jNode(value)) {
    addNode(accumulator, serializeNode(value))
    return
  }

  if (isNeo4jRelationship(value)) {
    addRelationship(accumulator, serializeRelationship(value))
    return
  }

  if (isNeo4jPath(value)) {
    for (const segment of value.segments) {
      addNode(accumulator, serializeNode(segment.start))
      addNode(accumulator, serializeNode(segment.end))
      addRelationship(accumulator, serializeRelationship(segment.relationship))
    }
    return
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      mergeGraphValue(item, accumulator)
    }
  }
}

async function getLocalDriver(connection: LocalConnection) {
  const fingerprint = `${connection.connectionUrl}\0${connection.username}\0${connection.encryptedPassword.iv}\0${connection.encryptedPassword.ciphertext}`
  const cached = localDrivers.get(connection.id)

  if (cached?.fingerprint === fingerprint) {
    return cached.driver
  }

  if (cached) {
    void cached.driver.close().catch(() => undefined)
  }

  const password = await decryptLocalPassword(connection)
  const driver = neo4j.driver(
    connection.connectionUrl,
    neo4j.auth.basic(connection.username, password)
  )

  localDrivers.set(connection.id, {
    driver,
    fingerprint,
  })

  return driver
}

export async function closeLocalDriver(connectionId: string) {
  const cached = localDrivers.get(connectionId)

  if (!cached) {
    return
  }

  localDrivers.delete(connectionId)
  await cached.driver.close().catch(() => undefined)
}

function getExpansionPattern(direction: "incoming" | "outgoing" | "both") {
  return direction === "incoming"
    ? "(n)<-[r]-(m)"
    : direction === "outgoing"
      ? "(n)-[r]->(m)"
      : "(n)-[r]-(m)"
}

function getExpansionTypeFilter(relType?: string) {
  return relType ? "WHERE type(r) = $relType" : ""
}

function getExpansionParams(
  nodeIds: string[],
  limit: number,
  relType?: string
) {
  const params: QueryParams = { nodeIds, limit: neo4j.int(limit) }

  if (relType) {
    params.relType = relType
  }

  return params
}

function getLegacyExpansionParams(
  nodeId: string,
  limit: number,
  relType?: string
) {
  const params: QueryParams = { nodeId, limit: neo4j.int(limit) }

  if (relType) {
    params.relType = relType
  }

  return params
}

function getLegacyExpansionTypeFilter(relType?: string) {
  return relType ? " AND type(r) = $relType" : ""
}

function getLegacyExpansionQuery(
  direction: "incoming" | "outgoing" | "both",
  relType?: string
) {
  return `MATCH ${getExpansionPattern(direction)} WHERE elementId(n) = $nodeId${getLegacyExpansionTypeFilter(relType)} RETURN n, r, m LIMIT $limit`
}

function getBatchExpansionQuery(
  direction: "incoming" | "outgoing" | "both",
  relType?: string
) {
  return `UNWIND $nodeIds AS nodeId
MATCH (n)
WHERE elementId(n) = nodeId
CALL {
  WITH n
  MATCH ${getExpansionPattern(direction)}
  ${getExpansionTypeFilter(relType)}
  RETURN r, m
  LIMIT $limit
}
RETURN n, r, m`
}

export async function runLocalReadQuery(
  connection: LocalConnection,
  query: string,
  params: QueryParams = {}
): Promise<QueryResultPayload> {
  const driver = await getLocalDriver(connection)
  const session = driver.session({
    defaultAccessMode: neo4j.session.READ,
  })

  try {
    const result = await session.run(query, params, {
      timeout: 15_000,
    })
    const accumulator = createGraphAccumulator()
    const rows = result.records.map((record) => {
      const row: Record<string, unknown> = {}

      for (const key of record.keys) {
        const value = record.get(key)
        row[String(key)] = toPlainValue(value)
        mergeGraphValue(value, accumulator)
      }

      return row
    })

    return {
      columns: result.records[0]?.keys.map(String) ?? [],
      rows,
      graph: accumulator.graph,
      summary: {
        resultAvailableAfter: result.summary.resultAvailableAfter?.toNumber(),
        resultConsumedAfter: result.summary.resultConsumedAfter?.toNumber(),
        records: result.records.length,
      },
    }
  } finally {
    await session.close()
  }
}

export async function readLocalSchema(
  connection: LocalConnection
): Promise<SchemaPayload> {
  const labelsResult = await runLocalReadQuery(
    connection,
    "MATCH (n) WITH labels(n) AS labels UNWIND labels AS label RETURN label, count(*) AS count ORDER BY count DESC LIMIT 50"
  )
  const relationshipsResult = await runLocalReadQuery(
    connection,
    "MATCH ()-[r]->() RETURN type(r) AS type, count(*) AS count ORDER BY count DESC LIMIT 50"
  )
  const propertiesResult = await runLocalReadQuery(
    connection,
    "MATCH (n) WITH keys(n) AS keys UNWIND keys AS key RETURN DISTINCT key ORDER BY key LIMIT 100"
  )

  return {
    labels: labelsResult.rows.map((row) => {
      const name = String(row.label)

      return {
        name,
        count: Number(row.count ?? 0),
        color: getCategoryColor(name),
      }
    }),
    relationshipTypes: relationshipsResult.rows.map((row) => ({
      name: String(row.type),
      count: Number(row.count ?? 0),
    })),
    propertyKeys: propertiesResult.rows.map((row) => String(row.key)),
  }
}

export async function searchLocalGraph(
  connection: LocalConnection,
  search: string,
  limit = 80
) {
  const trimmedSearch = search.trim().toLowerCase()
  const terms = getSearchTerms(trimmedSearch)

  if (!trimmedSearch) {
    return runLocalReadQuery(connection, "MATCH (n) RETURN n LIMIT $limit", {
      limit: neo4j.int(limit),
    })
  }

  const fullTextResult = await searchLocalFullTextNodeIndexes(
    connection,
    trimmedSearch,
    limit
  )
  const propertyResult = await searchLocalPropertyValues(
    connection,
    trimmedSearch,
    terms,
    limit
  )

  return mergeNodeSearchResults(fullTextResult, propertyResult, limit)
}

async function searchLocalPropertyValues(
  connection: LocalConnection,
  search: string,
  terms: string[],
  limit: number
) {
  try {
    return await runLocalReadQuery(
      connection,
      `WITH $terms AS terms, $collapsedSearch AS collapsedSearch
MATCH (n)
WITH n,
  [label IN labels(n) | toLower(label)] AS labels,
  [key IN keys(n) | toLower(toString(n[key]))] AS values,
  terms,
  collapsedSearch
WHERE any(label IN labels WHERE label CONTAINS $search)
  OR any(label IN labels WHERE any(term IN terms WHERE label CONTAINS term))
  OR any(value IN values WHERE value IS NOT NULL AND any(term IN terms WHERE value CONTAINS term))
  OR any(value IN values WHERE value IS NOT NULL AND replace(value, ' ', '') CONTAINS collapsedSearch)
WITH n,
  CASE
    WHEN any(value IN values WHERE value IS NOT NULL AND value CONTAINS $search) THEN 4
    WHEN any(value IN values WHERE value IS NOT NULL AND replace(value, ' ', '') CONTAINS collapsedSearch) THEN 3
    WHEN any(value IN values WHERE value IS NOT NULL AND all(term IN terms WHERE value CONTAINS term)) THEN 2
    ELSE 1
  END AS matchRank,
  reduce(hitCount = 0, term IN terms |
    hitCount + CASE
      WHEN any(label IN labels WHERE label CONTAINS term)
        OR any(value IN values WHERE value IS NOT NULL AND value CONTAINS term)
      THEN 1
      ELSE 0
    END
  ) AS termHits
RETURN n
ORDER BY matchRank DESC, termHits DESC
LIMIT $limit`,
      {
        search,
        terms,
        collapsedSearch: collapseSearchValue(search),
        limit: neo4j.int(limit),
      }
    )
  } catch {
    return null
  }
}

async function searchLocalFullTextNodeIndexes(
  connection: LocalConnection,
  search: string,
  limit: number
) {
  try {
    const indexes = await runLocalReadQuery(
      connection,
      `SHOW FULLTEXT INDEXES
YIELD name, type, entityType, state
WHERE type = 'FULLTEXT' AND entityType = 'NODE' AND state = 'ONLINE'
RETURN name
ORDER BY name`
    )
    const indexNames = indexes.rows
      .map((row) => row.name)
      .filter((name): name is string => typeof name === "string")

    if (indexNames.length === 0) {
      return null
    }

    return runLocalReadQuery(
      connection,
      `UNWIND $indexNames AS indexName
CALL db.index.fulltext.queryNodes(indexName, $query) YIELD node, score
WITH node, max(score) AS score
RETURN node
ORDER BY score DESC
LIMIT $limit`,
      {
        indexNames,
        query: createFullTextSearchQuery(search),
        limit: neo4j.int(limit),
      }
    )
  } catch {
    return null
  }
}

function createFullTextSearchQuery(search: string) {
  const terms = getSearchTerms(search).map((term) =>
    term.replace(/[+\-&|!(){}[\]^"~*?:\\/]/g, "\\$&")
  )

  if (terms.length === 0) {
    return search
  }

  return terms.map((term) => `${term}*`).join(" OR ")
}

function getSearchTerms(search: string) {
  return search.split(/\s+/).filter(Boolean)
}

function collapseSearchValue(search: string) {
  return search.replace(/\s+/g, "")
}

function mergeNodeSearchResults(
  primary: QueryResultPayload | null,
  secondary: QueryResultPayload | null,
  limit: number
) {
  if (!primary) {
    return (
      secondary ?? {
        columns: [],
        rows: [],
        graph: { nodes: [], relationships: [] },
        summary: { records: 0 },
      }
    )
  }

  if (!secondary?.graph.nodes.length) {
    return primary
  }

  const nodeIds = new Set(primary.graph.nodes.map((node) => node.id))
  const nodes = [...primary.graph.nodes]

  for (const node of secondary.graph.nodes) {
    if (!nodeIds.has(node.id)) {
      nodeIds.add(node.id)
      nodes.push(node)
    }

    if (nodes.length >= limit) {
      break
    }
  }

  return {
    ...primary,
    rows: nodes.map((node) => ({ n: node })),
    graph: {
      nodes,
      relationships: primary.graph.relationships,
    },
    summary: {
      ...primary.summary,
      records: nodes.length,
    },
  }
}

export async function suggestLocalGraph(
  connection: LocalConnection,
  search: string,
  limit = 8
): Promise<GraphSearchSuggestion[]> {
  const trimmedSearch = search.trim().toLowerCase()
  const terms = getSearchTerms(trimmedSearch)

  if (!trimmedSearch) {
    return []
  }

  const result = await runLocalReadQuery(
    connection,
    `WITH $terms AS terms, $collapsedSearch AS collapsedSearch
MATCH (n)
WITH n,
  [label IN labels(n) | toLower(label)] AS labels,
  [key IN keys(n) | toLower(toString(n[key]))] AS values,
  terms,
  collapsedSearch
WHERE any(label IN labels WHERE label CONTAINS $search)
  OR any(label IN labels WHERE any(term IN terms WHERE label CONTAINS term))
  OR any(value IN values WHERE value IS NOT NULL AND any(term IN terms WHERE value CONTAINS term))
  OR any(value IN values WHERE value IS NOT NULL AND replace(value, ' ', '') CONTAINS collapsedSearch)
WITH n, coalesce(
  toString(n.nameEn),
  toString(n.name),
  toString(n.title),
  toString(n.label),
  toString(n._aid),
  toString(n.id),
  elementId(n)
) AS caption
RETURN elementId(n) AS id,
  labels(n) AS labels,
  caption,
  [] AS matchedKeys
ORDER BY caption
LIMIT $limit`,
    {
      search: trimmedSearch,
      terms,
      collapsedSearch: collapseSearchValue(trimmedSearch),
      limit: neo4j.int(limit),
    }
  )

  return result.rows.map((row) => {
    const labels = Array.isArray(row.labels)
      ? row.labels.map((label) => String(label))
      : []
    const matchedKeys = Array.isArray(row.matchedKeys)
      ? row.matchedKeys.map((key) => String(key))
      : []
    const caption = String(row.caption ?? row.id)

    return {
      id: String(row.id),
      caption,
      labels,
      detail:
        matchedKeys.length > 0
          ? `Matched ${matchedKeys.join(", ")}`
          : labels.join(", "),
      searchValue: caption,
    }
  })
}

export async function expandLocalGraph(
  connection: LocalConnection,
  nodeId: string,
  direction: "incoming" | "outgoing" | "both",
  limit = 80,
  relType?: string
) {
  return runLocalReadQuery(
    connection,
    getLegacyExpansionQuery(direction, relType),
    getLegacyExpansionParams(nodeId, limit, relType)
  )
}

export async function expandLocalGraphNodes(
  connection: LocalConnection,
  nodeIds: string[],
  direction: "incoming" | "outgoing" | "both",
  limit = 80,
  relType?: string
) {
  return runLocalReadQuery(
    connection,
    getBatchExpansionQuery(direction, relType),
    getExpansionParams(nodeIds, limit, relType)
  )
}

export async function getLocalNodeAdjacency(
  connection: LocalConnection,
  nodeId: string
) {
  return runLocalReadQuery(
    connection,
    `MATCH (n)
WHERE elementId(n) = $nodeId
OPTIONAL MATCH (n)-[r]-(m)
RETURN n, r, m`,
    { nodeId }
  )
}

export async function getLocalNodesRelationshipSummary(
  connection: LocalConnection,
  nodeIds: string[]
): Promise<NodeRelationshipSummary> {
  const uniqueNodeIds = Array.from(new Set(nodeIds))
  const result = await runLocalReadQuery(
    connection,
    `UNWIND $nodeIds AS nodeId
MATCH (n)
WHERE elementId(n) = nodeId
MATCH (n)-[r]-(m)
WITH nodeId,
     type(r) AS relType,
     CASE WHEN startNode(r) = n THEN 'outgoing' ELSE 'incoming' END AS direction,
     count(DISTINCT m) AS nodeCount
RETURN relType, direction, sum(nodeCount) AS nodeCount
ORDER BY relType, direction`,
    { nodeIds: uniqueNodeIds }
  )

  const entries = result.rows.map((row) => ({
    type: String(row.relType),
    direction:
      row.direction === "outgoing"
        ? ("outgoing" as const)
        : ("incoming" as const),
    nodeCount: Number(row.nodeCount ?? 0),
  }))
  const total = entries.reduce((sum, entry) => sum + entry.nodeCount, 0)

  return { total, entries }
}
