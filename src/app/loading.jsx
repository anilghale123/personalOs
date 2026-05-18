import { Loader2 } from "lucide-react";

/**
 * Root navigation fallback — covers any route without a more specific
 * loading.jsx (e.g. the login page). Dashboard routes use the nearer
 * (dashboard)/loading.jsx skeleton instead.
 */
export default function RootLoading() {
  return (
    <div
      className="flex min-h-screen items-center justify-center bg-background"
      aria-busy="true"
      aria-label="Loading"
    >
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}
