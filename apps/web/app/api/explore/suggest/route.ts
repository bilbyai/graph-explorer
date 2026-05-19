import { z } from "zod"

import { getRouteAccess, unauthorizedResponse } from "@/lib/auth-guard"
import { getAdminConnection } from "@/lib/connection-registry"
import { suggestGraph } from "@/lib/neo4j"

export const runtime = "nodejs"

const requestSchema = z.object({
  connectionId: z.string().min(1),
  search: z.string().default(""),
  limit: z.number().int().min(1).max(20).default(8),
})

export async function POST(request: Request) {
  const access = await getRouteAccess(request)

  if (!access) {
    return unauthorizedResponse()
  }

  const body = requestSchema.safeParse(await request.json())

  if (!body.success) {
    return Response.json(
      { error: "Invalid graph suggestion request" },
      { status: 400 }
    )
  }

  const connection = getAdminConnection(body.data.connectionId)

  if (!connection) {
    return Response.json({ error: "Connection not found" }, { status: 404 })
  }

  try {
    return Response.json(
      await suggestGraph(connection, body.data.search, body.data.limit)
    )
  } catch {
    return Response.json([])
  }
}
