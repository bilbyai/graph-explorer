import { getRouteAccess, unauthorizedResponse } from "@/lib/auth-guard"
import { getPublicConnections } from "@/lib/connection-registry"

export const runtime = "nodejs"

export async function GET(request: Request) {
  const access = await getRouteAccess(request)

  if (!access) {
    return unauthorizedResponse()
  }

  return Response.json({
    connections: getPublicConnections(),
    accessMode: access.mode,
  })
}
