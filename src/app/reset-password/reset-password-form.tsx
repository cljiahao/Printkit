"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { useAsyncAction, navigatingAway } from "@/hooks/use-async-action";
import { passwordChangeSchema } from "@/lib/password-change";

type SessionState = "checking" | "ready" | "no-session" | "failed";

/**
 * Sets a new password on the recovery session established by /auth/callback
 * (the reset link exchanges its code there, then forwards here). If no session
 * is present the link was already used or expired, so we route the user back to
 * sign in rather than showing a form that would fail.
 */
export function ResetPasswordForm() {
  const router = useRouter();
  const [supabase] = useState(createClient);
  const [state, setState] = useState<SessionState>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { pending, run } = useAsyncAction();

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const { data, error: sessionError } = await supabase.auth.getUser();
        if (active) {
          if (sessionError) setState("failed");
          else if (data.user) setState("ready");
          else setState("no-session");
        }
      } catch {
        if (active) setState("failed");
      }
    })();
    return () => {
      active = false;
    };
  }, [supabase]);

  function submit() {
    if (state !== "ready" || pending) return;
    const parsed = passwordChangeSchema.safeParse({ password, confirm });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check your password");
      return;
    }
    setError(null);
    return run(async () => {
      try {
        const { error: updateError } = await supabase.auth.updateUser({
          password: parsed.data.password,
        });
        if (updateError) {
          toast.error(updateError.message);
          return;
        }
        toast.success("Password updated");
        router.push("/dashboard");
        router.refresh();
        await navigatingAway();
      } catch {
        toast.error("Could not update your password. Please try again.");
      }
    });
  }

  if (state === "checking") {
    return (
      <div className="rounded-xl border bg-card px-7 py-8 shadow-sm">
        <p className="text-center text-sm text-muted-foreground">
          Checking your reset link…
        </p>
      </div>
    );
  }

  if (state === "no-session" || state === "failed") {
    return (
      <div className="rounded-xl border bg-card px-7 py-8 shadow-sm">
        <h1 className="font-display text-2xl font-semibold leading-tight">
          {state === "failed"
            ? "Could not check your reset link"
            : "This link has expired"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {state === "failed"
            ? "Check your connection and reload this page, or return to sign in."
            : "Password reset links can only be used once, and they expire after a short while. Request a fresh one from the sign-in page."}
        </p>
        <Button
          asChild
          variant="outline"
          className="mt-6 h-11 w-full rounded-xl"
        >
          <Link href="/login">Back to sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card px-7 py-8 shadow-sm">
      <h1 className="font-display text-2xl font-semibold leading-tight">
        Set a new password
      </h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Pick something at least 8 characters long.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="mt-6 space-y-5"
      >
        <div className="space-y-2">
          <Label htmlFor="new-password" className="text-sm font-medium">
            New password
          </Label>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-11 rounded-xl"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm-password" className="text-sm font-medium">
            Confirm new password
          </Label>
          <Input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="h-11 rounded-xl"
          />
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <Button
          type="submit"
          size="lg"
          disabled={pending || !password || !confirm}
          className="h-12 w-full rounded-xl text-base font-semibold"
        >
          {pending ? "Updating…" : "Update password"}
        </Button>
      </form>
    </div>
  );
}
