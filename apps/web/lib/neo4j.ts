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
  const fields = ["name", "title", "label", "id"]

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

  if (!trimmedSearch) {
    return runReadQuery(connection, "MATCH (n) RETURN n LIMIT $limit", {
      limit: neo4j.int(limit),
    })
  }

  return runReadQuery(
    connection,
    "MATCH (n) WHERE any(key IN keys(n) WHERE toLower(toString(n[key])) CONTAINS $search) RETURN n LIMIT $limit",
    { search: trimmedSearch, limit: neo4j.int(limit) }
  )
}

export async function expandGraph(
  connection: AdminConnection,
  nodeId: string,
  direction: "incoming" | "outgoing" | "both",
  limit = 80
) {
  const pattern =
    direction === "incoming"
      ? "(n)<-[r]-(m)"
      : direction === "outgoing"
        ? "(n)-[r]->(m)"
        : "(n)-[r]-(m)"

  return runReadQuery(
    connection,
    `MATCH ${pattern} WHERE elementId(n) = $nodeId RETURN n, r, m LIMIT $limit`,
    { nodeId, limit: neo4j.int(limit) }
  )
}
