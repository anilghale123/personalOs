import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { ResetPasswordForm } from "@/features/auth/reset-password-form";

export const metadata = {
  title: "Reset password · selfView",
};

/**
 * Password reset — both halves of the flow: request a 6-digit code by email,
 * then enter it with a new password.
 *
 * Already signed in? There is nothing to recover, so send them to the
 * profile dialog's change-password path instead of a reset they don't need.
 */
export default async function ResetPasswordPage() {
  const session = await getSession();
  if (session?.user) redirect("/app");

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      <Suspense fallback={null}>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
