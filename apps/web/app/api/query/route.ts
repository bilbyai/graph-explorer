import { z } from "zod"

import { getRouteAccess, unauthorizedResponse } from "@/lib/auth-guard"
import { getAdminConnection } from "@/lib/connection-registry"
import { validateReadOnlyMatchQuery } from "@/lib/cypher"
import { runReadQuery } from "@/lib/neo4j"

export const runtime = "nodejs"

const requestSchema = z.object({
  connectionId: z.string().min(1),
  query: z.string(),
  params: z.record(z.unknown()).optional(),
})

export async function POST(request: Request) {
  const access = await getRouteAccess(request)

  if (!access) {
    return unauthorizedResponse()
  }

  const body = requestSchema.safeParse(await request.json())

  if (!body.success) {
    return Response.json({ error: "Invalid query request" }, { status: 400 })
  }

  const validation = validateReadOnlyMatchQuery(body.data.query)

  if (!validation.ok) {
    return Response.json({ error: validation.error }, { status: 400 })
  }

  const connection = getAdminConnection(body.data.connectionId)

  if (!connection) {
    return Response.json({ error: "Connection not found" }, { status: 404 })
  }

  try {
    const result = await runReadQuery(
      connection,
      validation.query,
      body.data.params
    )

    return Response.json(result)
  } catch {
    return Response.json(
      {
        error:
          "The read query failed. Check the Cypher, parameters, and selected connection.",
      },
      { status: 502 }
    )
  }
}
