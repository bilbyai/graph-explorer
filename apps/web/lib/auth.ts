import { mkdirSync } from "node:fs"
import { dirname, resolve } from "node:path"

import { betterAuth } from "better-auth"
import { nextCookies } from "better-auth/next-js"
import Database from "better-sqlite3"

import { env } from "@/lib/env"

const dbPath = resolve(process.cwd(), env.BETTER_AUTH_DB_PATH ?? "./data/auth.sqlite")

mkdirSync(dirname(dbPath), { recursive: true })

export const auth = betterAuth({
  database: new Database(dbPath),
  secret:
    env.BETTER_AUTH_SECRET ??
    "development-only-change-me-graph-explorer-secret",
  baseURL: env.BETTER_AUTH_URL,
  emailAndPassword: {
    enabled: true,
  },
  plugins: [nextCookies()],
})
