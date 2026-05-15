import { z } from "zod"

import { getRouteAccess, unauthorizedResponse } from "@/lib/auth-guard"
import { getAdminConnection } from "@/lib/connection-registry"
import type { NodeRelationshipSummary } from "@/lib/graph-types"
import { getNodeRelationshipSummary } from "@/lib/neo4j"
import { sampleGraph } from "@/lib/sample-graph"

export const runtime = "nodejs"

const requestSchema = z.object({
  connectionId: z.string().min(1),
  nodeId: z.string().min(1),
})

function summarizeSampleNode(nodeId: string): NodeRelationshipSummary {
  const buckets = new Map<string, { nodeIds: Set<string>; count: number }>()

  for (const relationship of sampleGraph.relationships) {
    if (relationship.source === nodeId) {
      const key = `outgoing:${relationship.type}`
      const bucket = buckets.get(key) ?? { nodeIds: new Set(), count: 0 }
      bucket.nodeIds.add(relationship.target)
      buckets.set(key, bucket)
    } else if (relationship.target === nodeId) {
      const key = `incoming:${relationship.type}`
      const bucket = buckets.get(key) ?? { nodeIds: new Set(), count: 0 }
      bucket.nodeIds.add(relationship.source)
      buckets.set(key, bucket)
    }
  }

  const entries = Array.from(buckets.entries())
    .map(([key, bucket]) => {
      const separatorIndex = key.indexOf(":")
      const direction = key.slice(0, separatorIndex) as "incoming" | "outgoing"
      const type = key.slice(separatorIndex + 1)
      return {
        type,
        direction,
        nodeCount: bucket.nodeIds.size,
      }
    })
    .sort((a, b) =>
      a.type === b.type
        ? a.direction.localeCompare(b.direction)
        : a.type.localeCompare(b.type)
    )

  const total = entries.reduce((sum, entry) => sum + entry.nodeCount, 0)

  return { total, entries }
}

export async function POST(request: Request) {
  const access = await getRouteAccess(request)

  if (!access) {
    return unauthorizedResponse()
  }

  const body = requestSchema.safeParse(await request.json())

  if (!body.success) {
    return Response.json(
      { error: "Invalid relationship-summary request" },
      { status: 400 }
    )
  }

  if (body.data.connectionId === "sample") {
    return Response.json(summarizeSampleNode(body.data.nodeId))
  }

  const connection = getAdminConnection(body.data.connectionId)

  if (!connection) {
    return Response.json({ error: "Connection not found" }, { status: 404 })
  }

  try {
    const summary = await getNodeRelationshipSummary(
      connection,
      body.data.nodeId
    )

    return Response.json(summary)
  } catch {
    return Response.json({
      total: 0,
      entries: [],
    } satisfies NodeRelationshipSummary)
  }
}
