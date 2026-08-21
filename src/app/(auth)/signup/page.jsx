import { redirect } from "next/navigation";

/**
 * Signup lives on the login screen as a form mode — this route exists so
 * landing-page CTAs have a real destination with the intent preserved.
 */
export default function SignupPage() {
  redirect("/login?mode=signup");
}
