import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { nextCookies } from "better-auth/next-js"

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
  emailAndPassword: {
    enabled: true,
    resetPasswordTokenExpiresIn: 60 * 60,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      // Better Auth runs this asynchronously to keep account lookups timing-safe.
      void sendPasswordResetEmail({ to: user.email, url })
    },
  },
  plugins: [nextCookies()],
})
