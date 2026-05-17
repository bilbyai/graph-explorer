"use client"

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { AlertCircleIcon, Lock } from "lucide-react"
import * as React from "react"
import { IconGraphNetwork } from "@/assets/icons"
import { authClient } from "@/lib/auth-client"

export function SignInForm() {
  const [mode, setMode] = React.useState<"sign-in" | "sign-up">("sign-in")
  const [email, setEmail] = React.useState("")
  const [name, setName] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError(null)

    const result =
      mode === "sign-in"
        ? await authClient.signIn.email({
            email,
            password,
          })
        : await authClient.signUp.email({
            email,
            password,
            name: name || email,
          })

    setPending(false)

    if (result.error) {
      setError(result.error.message ?? "Authentication failed")
      return
    }

    window.location.href = "/"
  }

  return (
    <main className="flex min-h-svh items-center justify-center  p-4 ">
      <form
        className="w-full max-w-sm rounded-md border p-6 shadow-2xl"
        onSubmit={submit}
      >
        <div className="mb-6 flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-md border">
            <IconGraphNetwork className="size-5" />
          </div>
          <div>
            <h1 className="text-lg font-medium">Graph Explorer</h1>
            <p className="text-sm text-muted-foreground">Sign in to continue</p>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-2 rounded-md border p-1">
          <Button
            className={`h-8 rounded text-sm ${
              mode === "sign-in" ? "bg-primary text-primary-foreground" : ""
            }`}
            onClick={() => setMode("sign-in")}
            type="button"
            variant="ghost"
          >
            Sign in
          </Button>
          <Button
            className={`h-8 rounded text-sm ${
              mode === "sign-up" ? "bg-primary text-primary-foreground" : ""
            }`}
            onClick={() => setMode("sign-up")}
            type="button"
            variant="ghost"
          >
            Sign up
          </Button>
        </div>

        <div className="space-y-3">
          {mode === "sign-up" ? (
            <label className="block" htmlFor="auth-name">
              <span className="mb-1 block text-xs ">Name</span>
              <Input
                className="h-10 w-full rounded-md border  px-3 text-sm outline-none "
                id="auth-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
          ) : null}
          <label className="block" htmlFor="auth-email">
            <span className="mb-1 block text-xs ">Email</span>
            <Input
              className="h-10 w-full rounded-md border  px-3 text-sm outline-none "
              id="auth-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label className="block" htmlFor="auth-password">
            <span className="mb-1 block text-xs ">Password</span>
            <Input
              className="h-10 w-full rounded-md border  px-3 text-sm outline-none "
              id="auth-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
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
          className="mt-5 flex h-10 w-full items-center justify-center gap-2 rounded-md  text-sm font-medium    disabled:opacity-60"
          disabled={pending}
          type="submit"
        >
          <Lock className="size-4" />
          {pending
            ? "Working..."
            : mode === "sign-in"
              ? "Sign in"
              : "Create account"}
        </Button>
      </form>
    </main>
  )
}
