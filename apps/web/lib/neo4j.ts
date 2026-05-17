import neo4j, {
  type Node as Neo4jNode,
  type Relationship as Neo4jRelationship,
  type Path,
} from "neo4j-driver"

import type { AdminConnection } from "@/lib/connection-registry"
import type {
  GraphNodeRecord,
  GraphPayload,
  GraphRelationshipRecord,
  GraphSearchSuggestion,
  NodeRelationshipSummary,
  QueryResultPayload,
  SchemaPayload,
} from "@/lib/graph-types"
import { getCategoryColor } from "@/lib/sample-graph"

type QueryParams = Record<string, unknown>

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
  const fields = ["nameEn", "name", "title", "label", "_aid", "id"]

  for (const field of fields) {
    const value = properties[field]

    if (typeof value === "string" && value.trim()) {
      return value
    }
  }

  return fallback
}

export function serializeNode(node: Neo4jNode): GraphNodeRecord {
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

export function serializeRelationship(
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

function mergeGraphValue(value: unknown, graph: GraphPayload) {
  if (isNeo4jNode(value)) {
    addNode(graph, serializeNode(value))
    return
  }

  if (isNeo4jRelationship(value)) {
    addRelationship(graph, serializeRelationship(value))
    return
  }

  if (isNeo4jPath(value)) {
    for (const segment of value.segments) {
      addNode(graph, serializeNode(segment.start))
      addNode(graph, serializeNode(segment.end))
      addRelationship(graph, serializeRelationship(segment.relationship))
    }
    return
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      mergeGraphValue(item, graph)
    }
  }
}

function addNode(graph: GraphPayload, node: GraphNodeRecord) {
  if (!graph.nodes.some((existingNode) => existingNode.id === node.id)) {
    graph.nodes.push(node)
  }
}

function addRelationship(
  graph: GraphPayload,
  relationship: GraphRelationshipRecord
) {
  if (
    !graph.relationships.some(
      (existingRelationship) => existingRelationship.id === relationship.id
    )
  ) {
    graph.relationships.push(relationship)
  }
}

function getDriver(connection: AdminConnection) {
  return neo4j.driver(
    connection.connection_url,
    neo4j.auth.basic(connection.username, connection.password)
  )
}

export async function runReadQuery(
  connection: AdminConnection,
  query: string,
  params: QueryParams = {}
): Promise<QueryResultPayload> {
  const driver = getDriver(connection)
  const session = driver.session({
    defaultAccessMode: neo4j.session.READ,
  })

  try {
    const result = await session.run(query, params, {
      timeout: 15_000,
    })
    const graph: GraphPayload = {
      nodes: [],
      relationships: [],
    }
    const rows = result.records.map((record) => {
      const row: Record<string, unknown> = {}

      for (const key of record.keys) {
        const value = record.get(key)
        row[String(key)] = toPlainValue(value)
        mergeGraphValue(value, graph)
      }

      return row
    })

    return {
      columns: result.records[0]?.keys.map(String) ?? [],
      rows,
      graph,
      summary: {
        resultAvailableAfter: result.summary.resultAvailableAfter?.toNumber(),
        resultConsumedAfter: result.summary.resultConsumedAfter?.toNumber(),
        records: result.records.length,
      },
    }
  } finally {
    await session.close()
    await driver.close()
  }
}

export async function readSchema(
  connection: AdminConnection
): Promise<SchemaPayload> {
  const labelsResult = await runReadQuery(
    connection,
    "MATCH (n) WITH labels(n) AS labels UNWIND labels AS label RETURN label, count(*) AS count ORDER BY count DESC LIMIT 50"
  )
  const relationshipsResult = await runReadQuery(
    connection,
    "MATCH ()-[r]->() RETURN type(r) AS type, count(*) AS count ORDER BY count DESC LIMIT 50"
  )
  const propertiesResult = await runReadQuery(
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

export async function searchGraph(
  connection: AdminConnection,
  search: string,
  limit = 80
) {
  const trimmedSearch = search.trim().toLowerCase()
  const terms = getSearchTerms(trimmedSearch)

  if (!trimmedSearch) {
    return runReadQuery(connection, "MATCH (n) RETURN n LIMIT $limit", {
      limit: neo4j.int(limit),
    })
  }

  const fullTextResult = await searchFullTextNodeIndexes(
    connection,
    trimmedSearch,
    limit
  )

  if (fullTextResult?.graph.nodes.length) {
    return fullTextResult
  }

  const propertyResult = await searchPropertyValues(
    connection,
    trimmedSearch,
    terms,
    limit
  )

  return propertyResult ?? emptyQueryResult()
}

async function searchPropertyValues(
  connection: AdminConnection,
  search: string,
  terms: string[],
  limit: number
) {
  try {
    return await runReadQuery(
      connection,
      `WITH $terms AS terms, $collapsedSearch AS collapsedSearch
CALL {
  WITH terms, collapsedSearch
  MATCH (n)
  WITH n, [label IN labels(n) | toLower(label)] AS values, terms, collapsedSearch
  WHERE any(value IN values WHERE value CONTAINS $search)
    OR any(value IN values WHERE all(term IN terms WHERE value CONTAINS term))
    OR any(value IN values WHERE replace(value, ' ', '') CONTAINS collapsedSearch)
  RETURN n, 3 AS matchRank
  UNION
  WITH terms, collapsedSearch
  MATCH (n)
  UNWIND keys(n) AS key
  WITH n, n[key] AS value, terms, collapsedSearch
  WHERE valueType(value) = 'STRING NOT NULL'
  WITH n, toLower(value) AS value, terms, collapsedSearch
  WHERE value CONTAINS $search
    OR all(term IN terms WHERE value CONTAINS term)
    OR replace(value, ' ', '') CONTAINS collapsedSearch
  RETURN n,
    CASE
      WHEN value CONTAINS $search THEN 4
      WHEN replace(value, ' ', '') CONTAINS collapsedSearch THEN 3
      ELSE 2
    END AS matchRank
  UNION
  WITH terms, collapsedSearch
  MATCH (n)
  UNWIND keys(n) AS key
  WITH n, n[key] AS value, terms, collapsedSearch
  WHERE valueType(value) = 'LIST<STRING NOT NULL> NOT NULL'
  UNWIND value AS item
  WITH n, toLower(item) AS value, terms, collapsedSearch
  WHERE value CONTAINS $search
    OR all(term IN terms WHERE value CONTAINS term)
    OR replace(value, ' ', '') CONTAINS collapsedSearch
  RETURN n,
    CASE
      WHEN value CONTAINS $search THEN 4
      WHEN replace(value, ' ', '') CONTAINS collapsedSearch THEN 3
      ELSE 2
    END AS matchRank
}
WITH n, max(matchRank) AS matchRank
RETURN n
ORDER BY matchRank DESC
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

async function searchFullTextNodeIndexes(
  connection: AdminConnection,
  search: string,
  limit: number
) {
  try {
    const indexes = await runReadQuery(
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

    const terms = getSearchTerms(search)
    const candidateLimit = Math.max(limit, Math.min(limit * 10, 1000))

    return runReadQuery(
      connection,
      `UNWIND $indexNames AS indexName
CALL db.index.fulltext.queryNodes(indexName, $query) YIELD node, score
WITH node, max(score) AS score
ORDER BY score DESC
LIMIT $candidateLimit
WITH collect({ node: node, score: score }) AS matches, max(score) AS maxScore
UNWIND matches AS match
WITH match.node AS node, match.score AS score, maxScore
WHERE NOT $useScoreCutoff OR score >= maxScore * $scoreCutoff
RETURN node
ORDER BY score DESC
LIMIT $limit`,
      {
        indexNames,
        query: createFullTextSearchQuery(search),
        candidateLimit: neo4j.int(candidateLimit),
        scoreCutoff: 0.49,
        useScoreCutoff: terms.length > 1,
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

  return terms.join(" ")
}

function getSearchTerms(search: string) {
  return search.split(/\s+/).filter(Boolean)
}

function collapseSearchValue(search: string) {
  return search.replace(/\s+/g, "")
}

function emptyQueryResult(): QueryResultPayload {
  return {
    columns: [],
    rows: [],
    graph: { nodes: [], relationships: [] },
    summary: { records: 0 },
  }
}

export async function suggestGraph(
  connection: AdminConnection,
  search: string,
  limit = 8
): Promise<GraphSearchSuggestion[]> {
  if (!search.trim()) {
    return []
  }

  const result = await searchGraph(connection, search, limit)

  return result.graph.nodes.map((node) => {
    const labels = node.labels.map((label) => String(label))

    return {
      id: node.id,
      caption: node.caption,
      labels,
      detail: labels.join(", "),
      searchValue: node.caption,
    }
  })
}

export async function expandGraph(
  connection: AdminConnection,
  nodeId: string,
  direction: "incoming" | "outgoing" | "both",
  limit = 80,
  relType?: string
) {
  const pattern =
    direction === "incoming"
      ? "(n)<-[r]-(m)"
      : direction === "outgoing"
        ? "(n)-[r]->(m)"
        : "(n)-[r]-(m)"

  const typeFilter = relType ? " AND type(r) = $relType" : ""
  const params: QueryParams = { nodeId, limit: neo4j.int(limit) }

  if (relType) {
    params.relType = relType
  }

  return runReadQuery(
    connection,
    `MATCH ${pattern} WHERE elementId(n) = $nodeId${typeFilter} RETURN n, r, m LIMIT $limit`,
    params
  )
}

export async function getNodeRelationshipSummary(
  connection: AdminConnection,
  nodeId: string
): Promise<NodeRelationshipSummary> {
  const result = await runReadQuery(
    connection,
    `MATCH (n)-[r]-(m)
WHERE elementId(n) = $nodeId
WITH type(r) AS relType,
     CASE WHEN startNode(r) = n THEN 'outgoing' ELSE 'incoming' END AS direction,
     m
RETURN relType, direction, count(DISTINCT m) AS nodeCount
ORDER BY relType, direction`,
    { nodeId }
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
