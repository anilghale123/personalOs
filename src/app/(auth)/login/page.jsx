import { Suspense } from "react";
import { redirect } from "next/navigation";
import { CircleDot, Compass, Wallet, Leaf, Sparkles } from "lucide-react";
import { auth, isGoogleEnabled } from "@/lib/auth";
import { LoginForm } from "@/features/auth/login-form";

const FEATURES = [
  { icon: Compass, label: "Goals & habit tracking" },
  { icon: Wallet, label: "NEPSE portfolio & SIPs" },
  { icon: Leaf, label: "Local-first journaling" },
  { icon: Sparkles, label: "AI weekly briefings" },
];

export default async function LoginPage() {
  // Already signed in? Skip the form.
  const session = await auth();
  if (session?.user) redirect("/compass");

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden flex-col justify-between bg-foreground p-12 text-background lg:flex">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-background text-foreground">
            <CircleDot className="h-5 w-5" />
          </div>
          <span className="text-lg font-semibold">Personal OS</span>
        </div>
        <div>
          <h1 className="text-3xl font-semibold leading-tight">
            One operating system
            <br />
            for your entire life.
          </h1>
          <p className="mt-3 max-w-sm text-sm text-background/60">
            Wealth, habits, journaling and AI insight — unified into a
            single, calm dashboard.
          </p>
          <ul className="mt-8 space-y-3">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <li
                  key={f.label}
                  className="flex items-center gap-3 text-sm text-background/80"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-background/10">
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  {f.label}
                </li>
              );
            })}
          </ul>
        </div>
        <p className="text-xs text-background/40">
          © {new Date().getFullYear()} Personal OS
        </p>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center px-6 py-12">
        <Suspense fallback={null}>
          <LoginForm googleEnabled={isGoogleEnabled} />
        </Suspense>
      </div>
    </div>
  );
}
