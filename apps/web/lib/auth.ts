import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { nextCookies } from "better-auth/next-js"

import { db } from "@/lib/db"
import * as schema from "@/lib/db/schema"
import { env } from "@/lib/env"

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  secret:
    env.BETTER_AUTH_SECRET ??
    "development-only-change-me-graph-explorer-secret",
  trustedOrigins: [
    env.BETTER_AUTH_URL,
    "https://graph-explorer-alpha.vercel.app",
    "http://localhost:3000",
    "https://graph-explorer.localhost",
  ],
  baseURL: env.BETTER_AUTH_URL,
  emailAndPassword: {
    enabled: true,
  },
  plugins: [nextCookies()],
})
