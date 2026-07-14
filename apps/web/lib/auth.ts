import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { nextCookies } from "better-auth/next-js"
import { after } from "next/server"

import { db } from "@/lib/db"
import * as schema from "@/lib/db/schema"
import { sendPasswordResetEmail } from "@/lib/email"
import { env } from "@/lib/env"

const trustedOrigins = env.BETTER_AUTH_URL ? [env.BETTER_AUTH_URL] : []

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  secret:
    env.BETTER_AUTH_SECRET ??
    "development-only-change-me-graph-explorer-secret",
  trustedOrigins: [...trustedOrigins, "https://web.localhost"],
  baseURL: env.BETTER_AUTH_URL,
  advanced: {
    backgroundTasks: {
      handler: after,
    },
  },
  emailAndPassword: {
    enabled: true,
    resetPasswordTokenExpiresIn: 60 * 60,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: ({ user, url }) =>
      sendPasswordResetEmail({ to: user.email, url }),
  },
  plugins: [nextCookies()],
})
