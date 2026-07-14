import { env } from "@/lib/env"

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

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.RESEND_FROM_EMAIL,
        to: [to],
        subject: "Reset your Graph Explorer password",
        html: `<p>We received a request to reset your Graph Explorer password.</p><p><a href="${escapeHtml(url)}">Reset your password</a></p><p>This link expires in one hour. If you did not request a password reset, you can safely ignore this email.</p>`,
        text: `We received a request to reset your Graph Explorer password.\n\nReset your password: ${url}\n\nThis link expires in one hour. If you did not request a password reset, you can safely ignore this email.`,
      }),
      cache: "no-store",
    })

    if (!response.ok) {
      console.error("Unable to send password reset email", {
        status: response.status,
      })
    }
  } catch (error) {
    console.error("Unable to send password reset email", error)
  }
}
