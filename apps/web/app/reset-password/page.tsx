import { ResetPasswordForm } from "@/components/reset-password-form"

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string | string[]
    token?: string | string[]
  }>
}) {
  const { error, token } = await searchParams

  return (
    <ResetPasswordForm
      invalidToken={error !== undefined || typeof token !== "string"}
      token={typeof token === "string" ? token : undefined}
    />
  )
}
