import { createHash } from "node:crypto"

import { type Connection, connections } from "@/lib/env"

export type PublicConnection = {
  id: string
  source: "admin"
  name: string
  host: string
  scheme: string
  username: string
}

export type AdminConnection = Connection & {
  id: string
}

function createConnectionId(connection: Connection) {
  return createHash("sha256")
    .update(
      `${connection.name}\0${connection.connection_url}\0${connection.username}`
    )
    .digest("hex")
    .slice(0, 16)
}

function getUrlParts(connectionUrl: string) {
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

export const adminConnections: AdminConnection[] = connections.map(
  (connection) => ({
    ...connection,
    id: createConnectionId(connection),
  })
)

export function getPublicConnections(): PublicConnection[] {
  return adminConnections.map((connection) => {
    const urlParts = getUrlParts(connection.connection_url)

    return {
      id: connection.id,
      source: "admin",
      name: connection.name,
      host: urlParts.host,
      scheme: urlParts.scheme,
      username: connection.username,
    }
  })
}

export function getAdminConnection(id: string) {
  return adminConnections.find((connection) => connection.id === id) ?? null
}
