"use client"

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { AlertCircleIcon, Lock } from "lucide-react"
import Link from "next/link"
import * as React from "react"
import { IconGraphNetwork } from "@/assets/icons"
import { authClient } from "@/lib/auth-client"

export function ResetPasswordForm({
  token,
  invalidToken,
}: {
  token?: string
  invalidToken: boolean
}) {
  const [password, setPassword] = React.useState("")
  const [confirmation, setConfirmation] = React.useState("")
  const [error, setError] = React.useState<string | null>(
    invalidToken || !token
      ? "This password reset link is invalid or expired."
      : null
  )
  const [complete, setComplete] = React.useState(false)
  const [pending, setPending] = React.useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!token || invalidToken) {
      return
    }

    if (password !== confirmation) {
      setError("Passwords do not match.")
      return
    }

    setPending(true)
    setError(null)

    const result = await authClient.resetPassword({
      newPassword: password,
      token,
    })

    setPending(false)

    if (result.error) {
      setError(
        "Unable to reset your password. The link may be invalid or expired."
      )
      return
    }

    setComplete(true)
  }

  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <form
        className="w-full max-w-sm rounded-md border p-6 shadow-2xl"
        onSubmit={submit}
      >
        <div className="mb-6 flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-md border">
            <IconGraphNetwork className="size-5" />
          </div>
          <div>
            <h1 className="text-lg font-medium text-balance">Reset password</h1>
            <p className="text-sm text-muted-foreground">
              Choose a new password for Graph Explorer
            </p>
          </div>
        </div>

        {complete ? (
          <Alert>
            <AlertTitle>Password reset</AlertTitle>
            <AlertDescription>
              Your password has been updated. You can now sign in.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <div className="space-y-3">
              <label className="block" htmlFor="new-password">
                <span className="mb-1 block text-xs">New password</span>
                <Input
                  className="h-10 w-full rounded-md border px-3 text-sm outline-none"
                  disabled={!token || invalidToken}
                  id="new-password"
                  minLength={8}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  type="password"
                  value={password}
                />
              </label>
              <label className="block" htmlFor="confirm-password">
                <span className="mb-1 block text-xs">Confirm new password</span>
                <Input
                  className="h-10 w-full rounded-md border px-3 text-sm outline-none"
                  disabled={!token || invalidToken}
                  id="confirm-password"
                  minLength={8}
                  onChange={(event) => setConfirmation(event.target.value)}
                  required
                  type="password"
                  value={confirmation}
                />
              </label>
            </div>

            {error ? (
              <Alert className="mt-4" variant="destructive">
                <AlertCircleIcon />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            <Button
              className="mt-5 flex h-10 w-full items-center justify-center gap-2 rounded-md text-sm font-medium disabled:opacity-60"
              disabled={pending || !token || invalidToken}
              type="submit"
            >
              <Lock className="size-4" />
              {pending ? "Resetting..." : "Reset password"}
            </Button>
          </>
        )}

        <Button asChild className="mt-2 h-10 w-full text-sm" variant="link">
          <Link href="/sign-in">Back to sign in</Link>
        </Button>
      </form>
    </main>
  )
}
