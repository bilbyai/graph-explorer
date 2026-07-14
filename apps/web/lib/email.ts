import { createHash } from "node:crypto"

import { Resend } from "resend"

import { env } from "@/lib/env"

const retryableNetworkErrorCodes = new Set([
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ECONNRESET",
  "ENETUNREACH",
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_SOCKET",
])
const retryDelaysMs = [250, 1_000]

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }

    return entities[character] ?? character
  })
}

function getErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined
  }

  if ("code" in error && typeof error.code === "string") {
    return error.code
  }

  if ("cause" in error) {
    return getErrorCode(error.cause)
  }

  return undefined
}

function isRetryableNetworkError(error: unknown) {
  return retryableNetworkErrorCodes.has(getErrorCode(error) ?? "")
}

function wait(delayMs: number) {
  return new Promise((resolve) => setTimeout(resolve, delayMs))
}

export async function sendPasswordResetEmail({
  to,
  url,
}: {
  to: string
  url: string
}) {
  if (!env.RESEND_API_KEY) {
    console.error(
      "Password reset email is not configured: missing RESEND_API_KEY"
    )
    return
  }

  const resend = new Resend(env.RESEND_API_KEY)
  const email = {
    from: "noreply@bilby.ai",
    to,
    subject: "Reset your Graph Explorer password",
    html: `<p>We received a request to reset your Graph Explorer password.</p><p><a href="${escapeHtml(url)}">Reset your password</a></p><p>This link expires in one hour. If you did not request a password reset, you can safely ignore this email.</p>`,
    text: `We received a request to reset your Graph Explorer password.\n\nReset your password: ${url}\n\nThis link expires in one hour. If you did not request a password reset, you can safely ignore this email.`,
  }
  const idempotencyKey = `password-reset/${createHash("sha256")
    .update(`${to}:${url}`)
    .digest("hex")}`

  for (let attempt = 0; ; attempt++) {
    try {
      const { error } = await resend.emails.send(email, { idempotencyKey })

      if (error) {
        console.error("Unable to send password reset email", {
          message: error.message,
          name: error.name,
        })
      }

      return
    } catch (error) {
      const retryDelayMs = retryDelaysMs[attempt]

      if (retryDelayMs === undefined || !isRetryableNetworkError(error)) {
        console.error("Unable to send password reset email", error)
        return
      }

      await wait(retryDelayMs)
    }
  }
}
