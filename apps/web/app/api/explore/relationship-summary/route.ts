import { z } from "zod"

import { getRouteAccess, unauthorizedResponse } from "@/lib/auth-guard"
import { getAdminConnection } from "@/lib/connection-registry"
import type { NodeRelationshipSummary } from "@/lib/graph-types"
import { getNodesRelationshipSummary } from "@/lib/neo4j"

export const runtime = "nodejs"

const requestSchema = z.object({
  connectionId: z.string().min(1),
  nodeIds: z.array(z.string().min(1)).min(1),
  exclusions: z
    .object({
      labels: z.array(z.string()).max(200).default([]),
      relationshipTypes: z.array(z.string()).max(200).default([]),
      nodeIds: z.array(z.string()).max(2000).default([]),
      relationshipIds: z.array(z.string()).max(2000).default([]),
    })
    .optional(),
})

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

  const nodeIds = Array.from(new Set(body.data.nodeIds))

  const connection = getAdminConnection(body.data.connectionId)

  if (!connection) {
    return Response.json({ error: "Connection not found" }, { status: 404 })
  }

  try {
    const summary = await getNodesRelationshipSummary(
      connection,
      nodeIds,
      body.data.exclusions
    )

    return Response.json(summary)
  } catch {
    return Response.json({
      total: 0,
      entries: [],
    } satisfies NodeRelationshipSummary)
  }
}
