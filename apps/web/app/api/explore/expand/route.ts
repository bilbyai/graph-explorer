import { z } from "zod"

import { getRouteAccess, unauthorizedResponse } from "@/lib/auth-guard"
import { getAdminConnection } from "@/lib/connection-registry"
import { expandGraph } from "@/lib/neo4j"
import { sampleGraph } from "@/lib/sample-graph"

export const runtime = "nodejs"

const requestSchema = z.object({
  connectionId: z.string().min(1),
  nodeId: z.string().min(1),
  direction: z.enum(["incoming", "outgoing", "both"]).default("both"),
  limit: z.number().int().min(1).max(300).default(80),
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

  if (body.data.connectionId === "sample") {
    return Response.json(sampleGraph)
  }

  const connection = getAdminConnection(body.data.connectionId)

  if (!connection) {
    return Response.json({ error: "Connection not found" }, { status: 404 })
  }

  try {
    const result = await expandGraph(
      connection,
      body.data.nodeId,
      body.data.direction,
      body.data.limit
    )

    return Response.json(result.graph)
  } catch {
    return Response.json(sampleGraph)
  }
}
