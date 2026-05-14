import { redirect } from "next/navigation"

import { GraphExplorerApp } from "@/components/graph-explorer-app"
import { getAppAccess } from "@/lib/auth-guard"
import { getPublicConnections } from "@/lib/connection-registry"

export const metadata = {
  title: "Graph Explorer",
  description: "Read-only Neo4j graph exploration workspace",
}

export default async function Page() {
  const access = await getAppAccess()

  if (!access) {
    redirect("/sign-in")
  }

  return (
    <GraphExplorerApp
      access={access}
      initialConnections={getPublicConnections()}
    />
  )
}
