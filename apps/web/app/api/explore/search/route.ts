import { z } from "zod"

import { getRouteAccess, unauthorizedResponse } from "@/lib/auth-guard"
import { getAdminConnection } from "@/lib/connection-registry"
import { searchGraph } from "@/lib/neo4j"

export const runtime = "nodejs"

const requestSchema = z.object({
  connectionId: z.string().min(1),
  search: z.string().default(""),
  limit: z.number().int().min(1).max(300).default(80),
  exclusions: z
    .object({
      labels: z.array(z.string()).max(200).default([]),
      relationshipTypes: z.array(z.string()).max(200).default([]),
      nodeIds: z.array(z.string()).max(2000).default([]),
      relationshipIds: z.array(z.string()).max(2000).default([]),
    })
    .optional(),
})

function getErrorDetails(error: unknown) {
  const details: Record<string, unknown> = {
    name: error instanceof Error ? error.name : typeof error,
    message: error instanceof Error ? error.message : String(error),
  }

  if (error && typeof error === "object" && "code" in error) {
    details.code = (error as { code?: unknown }).code
  }

  return details
}

function getConnectionUrlDetails(connectionUrl: string) {
  try {
    const url = new URL(connectionUrl)

    return {
      host: url.host,
      scheme: url.protocol.replace(":", ""),
    }
  } catch {
    return {
      host: "Invalid URL",
      scheme: "unknown",
    }
  }
}

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

  const connection = getAdminConnection(body.data.connectionId)

  if (!connection) {
    return Response.json({ error: "Connection not found" }, { status: 404 })
  }

  try {
    const result = await searchGraph(
      connection,
      body.data.search,
      body.data.limit,
      body.data.exclusions
    )

    return Response.json(result.graph)
  } catch (error) {
    const urlDetails = getConnectionUrlDetails(connection.connection_url)

    return Response.json(
      {
        error: "Graph search failed",
        details: {
          route: "/api/explore/search",
          connection: {
            id: connection.id,
            name: connection.name,
            host: urlDetails.host,
            scheme: urlDetails.scheme,
            username: connection.username,
          },
          search: body.data.search,
          limit: body.data.limit,
          timestamp: new Date().toISOString(),
          error: getErrorDetails(error),
        },
      },
      { status: 500 }
    )
  }
}
