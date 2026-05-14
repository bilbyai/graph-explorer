import { redirect } from "next/navigation"

import { SignInForm } from "@/components/sign-in-form"
import { getAppAccess } from "@/lib/auth-guard"

export default async function SignInPage() {
  const access = await getAppAccess()

  if (access) {
    redirect("/")
  }

  return <SignInForm />
}
