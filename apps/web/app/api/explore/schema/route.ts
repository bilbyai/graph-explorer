import { getRouteAccess, unauthorizedResponse } from "@/lib/auth-guard"
import { getAdminConnection } from "@/lib/connection-registry"
import { readSchema } from "@/lib/neo4j"
import { sampleSchema } from "@/lib/sample-graph"

export const runtime = "nodejs"

export async function GET(request: Request) {
  const access = await getRouteAccess(request)

  if (!access) {
    return unauthorizedResponse()
  }

  const url = new URL(request.url)
  const connectionId = url.searchParams.get("connectionId")

  if (!connectionId || connectionId === "sample") {
    return Response.json(sampleSchema)
  }

  const connection = getAdminConnection(connectionId)

  if (!connection) {
    return Response.json({ error: "Connection not found" }, { status: 404 })
  }

  try {
    return Response.json(await readSchema(connection))
  } catch {
    return Response.json(sampleSchema)
  }
}
