import { z } from "zod"

import { getRouteAccess, unauthorizedResponse } from "@/lib/auth-guard"
import { getAdminConnection } from "@/lib/connection-registry"
import { expandGraphNodes } from "@/lib/neo4j"

export const runtime = "nodejs"

const requestSchema = z.object({
  connectionId: z.string().min(1),
  nodeId: z.string().min(1).optional(),
  nodeIds: z.array(z.string().min(1)).min(1).max(100).optional(),
  direction: z.enum(["incoming", "outgoing", "both"]).default("both"),
  limit: z.number().int().min(1).max(300).default(80),
  relType: z.string().min(1).optional(),
})

export async function POST(request: Request) {
  const access = await getRouteAccess(request)

  if (!access) {
    return unauthorizedResponse()
  }

  const body = requestSchema.safeParse(await request.json())

  if (!body.success) {
    return Response.json({ error: "Invalid expand request" }, { status: 400 })
  }

  const connection = getAdminConnection(body.data.connectionId)

  if (!connection) {
    return Response.json({ error: "Connection not found" }, { status: 404 })
  }

  try {
    const nodeIds = Array.from(
      new Set(body.data.nodeIds ?? (body.data.nodeId ? [body.data.nodeId] : []))
    )

    if (nodeIds.length === 0) {
      return Response.json({ error: "Invalid expand request" }, { status: 400 })
    }

    const result = await expandGraphNodes(
      connection,
      nodeIds,
      body.data.direction,
      body.data.limit,
      body.data.relType
    )

    return Response.json(result.graph)
  } catch {
    return Response.json({ error: "Expansion failed" }, { status: 500 })
  }
}
