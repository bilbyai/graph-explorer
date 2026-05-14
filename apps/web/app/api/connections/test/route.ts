import { z } from "zod"

import { getRouteAccess, unauthorizedResponse } from "@/lib/auth-guard"
import { getAdminConnection } from "@/lib/connection-registry"
import { runReadQuery } from "@/lib/neo4j"

export const runtime = "nodejs"

const requestSchema = z.object({
  connectionId: z.string().min(1),
})

export async function POST(request: Request) {
  const access = await getRouteAccess(request)

  if (!access) {
    return unauthorizedResponse()
  }

  const body = requestSchema.safeParse(await request.json())

  if (!body.success) {
    return Response.json({ error: "Invalid connection test request" }, { status: 400 })
  }

  const connection = getAdminConnection(body.data.connectionId)

  if (!connection) {
    return Response.json({ error: "Connection not found" }, { status: 404 })
  }

  try {
    const startedAt = performance.now()
    await runReadQuery(connection, "MATCH (n) RETURN count(n) AS count LIMIT 1")

    return Response.json({
      ok: true,
      latencyMs: Math.round(performance.now() - startedAt),
    })
  } catch {
    return Response.json(
      {
        ok: false,
        error: "Unable to connect with the selected credentials.",
      },
      { status: 502 }
    )
  }
}
