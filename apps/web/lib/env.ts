import { Buffer } from "node:buffer"

import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

export const connectionSchema = z.object({
  name: z.string().min(1),
  connection_url: z.string().url(),
  username: z.string().min(1),
  password: z.string().min(1),
})

const connectionsPayloadSchema = z.object({
  connections: z.array(connectionSchema),
})

const connectionsJsonBase64Schema = z
  .string()
  .optional()
  .transform((value, ctx) => {
    if (!value) {
      return { connections: [] }
    }

    let parsed: unknown

    try {
      const decoded = Buffer.from(value, "base64").toString("utf8")
      parsed = JSON.parse(decoded)
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Expected a base64-encoded JSON connections payload",
      })
      return z.NEVER
    }

    const result = connectionsPayloadSchema.safeParse(parsed)

    if (!result.success) {
      for (const issue of result.error.issues) {
        ctx.addIssue(issue)
      }

      return z.NEVER
    }

    return result.data
  })

export const env = createEnv({
  server: {
    CONNECTIONS_JSON_BASE64: connectionsJsonBase64Schema,
    GRAPH_EXPLORER_NO_AUTH_LOCAL: z
      .enum(["true", "false"])
      .optional()
      .default("false"),
    BETTER_AUTH_SECRET: z.string().optional(),
    BETTER_AUTH_URL: z.string().url().optional(),
    DATABASE_URL: z.string().optional(),
    RESEND_API_KEY: z.string().min(1).optional(),
    RESEND_FROM_EMAIL: z
      .string()
      .min(1)
      .optional()
      .default("Graph Explorer <onboarding@resend.dev>"),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
})

export const connections = env.CONNECTIONS_JSON_BASE64.connections
export const isNoAuthLocalMode = env.GRAPH_EXPLORER_NO_AUTH_LOCAL === "true"

export type Connection = z.infer<typeof connectionSchema>
