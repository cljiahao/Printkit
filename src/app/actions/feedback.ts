"use server";
import { createServerClient } from "@/lib/supabase/server";
import { feedbackSchema } from "@/lib/schemas";
import { submitVendorFeedback } from "@/lib/merqo-vendor-feedback";
import type { ActionResult } from "@/lib/action-result";

/**
 * Backs a Sheet-embedded widget off the dashboard nav, not a full page —
 * an inline session check (not the redirecting getVendorSession guard) so
 * an unauthenticated caller gets a toast-visible error instead of a hard
 * redirect out of whatever page the Sheet is open on.
 */
export async function submitFeedbackAction(
  input: unknown,
): Promise<ActionResult> {
  const parsed = feedbackSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid feedback",
    };
  }

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Please sign in first" };

  try {
    await submitVendorFeedback(
      supabase,
      "printkit",
      parsed.data.nps,
      parsed.data.message?.trim() || null,
    );
    return { success: true };
  } catch (err) {
    console.error("submitFeedbackAction failed", err);
    return { success: false, error: "Could not submit feedback" };
  }
}
