import { z } from "zod"

import { getRouteAccess, unauthorizedResponse } from "@/lib/auth-guard"
import { getAdminConnection } from "@/lib/connection-registry"
import { getNodeAdjacency } from "@/lib/neo4j"

export const runtime = "nodejs"

const requestSchema = z.object({
  connectionId: z.string().min(1),
  nodeId: z.string().min(1),
})

export async function POST(request: Request) {
  const access = await getRouteAccess(request)

  if (!access) {
    return unauthorizedResponse()
  }

  const body = requestSchema.safeParse(await request.json())

  if (!body.success) {
    return Response.json(
      { error: "Invalid adjacency request" },
      { status: 400 }
    )
  }

  const connection = getAdminConnection(body.data.connectionId)

  if (!connection) {
    return Response.json({ error: "Connection not found" }, { status: 404 })
  }

  try {
    const result = await getNodeAdjacency(connection, body.data.nodeId)

    return Response.json(result.graph)
  } catch {
    return Response.json({ error: "Adjacency request failed" }, { status: 500 })
  }
}
