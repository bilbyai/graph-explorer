import { headers } from "next/headers"

import { auth } from "@/lib/auth"
import { isNoAuthLocalMode } from "@/lib/env"

export type AppAccess =
  | {
      mode: "no-auth-local"
      user: null
    }
  | {
      mode: "authenticated"
      user: {
        id: string
        email: string
        name: string
      }
    }

export async function getAppAccess(): Promise<AppAccess | null> {
  if (isNoAuthLocalMode) {
    return {
      mode: "no-auth-local",
      user: null,
    }
  }

  const session = await auth.api.getSession({
    headers: await headers(),
  })

  if (!session) {
    return null
  }

  return {
    mode: "authenticated",
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
    },
  }
}

export async function getRouteAccess(request: Request): Promise<AppAccess | null> {
  if (isNoAuthLocalMode) {
    return {
      mode: "no-auth-local",
      user: null,
    }
  }

  const session = await auth.api.getSession({
    headers: request.headers,
  })

  if (!session) {
    return null
  }

  return {
    mode: "authenticated",
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
    },
  }
}

export function unauthorizedResponse() {
  return Response.json({ error: "Sign in required" }, { status: 401 })
}
