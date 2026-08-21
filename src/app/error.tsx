"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ElevatedCard } from "@/components/elevated-card";
import { Wordmark } from "@/components/landing/wordmark";

/**
 * Root-level error boundary for non-dashboard routes (landing, login,
 * auth). `/dashboard/*` has its own, more specific `dashboard/error.tsx` —
 * this one is the fallback for everything else. Same branded treatment as
 * login/page.tsx (ElevatedCard + Wordmark) instead of the framework's bare
 * default error screen.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Root error boundary caught", error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center p-5">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Wordmark className="text-3xl" />
        </div>
        <ElevatedCard className="px-7 py-10 text-center">
          <h1 className="font-display text-2xl font-bold tracking-tight">
            Something went wrong
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            We hit a snag loading this page. Try again, or head back home if it
            keeps happening.
          </p>
          <div className="mt-7 flex flex-col gap-2.5">
            <Button
              type="button"
              onClick={() => reset()}
              className="h-11 w-full rounded-xl"
            >
              Try again
            </Button>
            <Button
              asChild
              variant="outline"
              className="h-11 w-full rounded-xl"
            >
              <Link href="/">Back to home</Link>
            </Button>
          </div>
        </ElevatedCard>
      </div>
    </main>
  );
}
