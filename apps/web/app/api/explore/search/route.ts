import { z } from "zod"

import { getRouteAccess, unauthorizedResponse } from "@/lib/auth-guard"
import { getAdminConnection } from "@/lib/connection-registry"
import { searchGraph } from "@/lib/neo4j"
import { sampleGraph } from "@/lib/sample-graph"

export const runtime = "nodejs"

const requestSchema = z.object({
  connectionId: z.string().min(1),
  search: z.string().default(""),
  limit: z.number().int().min(1).max(300).default(80),
})

export async function POST(request: Request) {
  const access = await getRouteAccess(request)

  if (!access) {
    return unauthorizedResponse()
  }

  const body = requestSchema.safeParse(await request.json())

  if (!body.success) {
    return Response.json(
      { error: "Invalid graph search request" },
      { status: 400 }
    )
  }

  if (body.data.connectionId === "sample") {
    return Response.json(sampleGraph)
  }

  const connection = getAdminConnection(body.data.connectionId)

  if (!connection) {
    return Response.json({ error: "Connection not found" }, { status: 404 })
  }

  try {
    const result = await searchGraph(
      connection,
      body.data.search,
      body.data.limit
    )

    return Response.json(result.graph)
  } catch {
    return Response.json(sampleGraph)
  }
}
