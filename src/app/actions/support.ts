"use server";
import { createServerClient } from "@/lib/supabase/server";
import { supportMessageSchema } from "@/lib/schemas";
import { submitSupportMessage } from "@/lib/merqo-support";
import type { ActionResult } from "@/lib/action-result";

/** Same inline-session-check reasoning as feedback.ts's submitFeedbackAction. */
export async function submitSupportMessageAction(
  input: unknown,
): Promise<ActionResult> {
  const parsed = supportMessageSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid message",
    };
  }

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Please sign in first" };

  try {
    await submitSupportMessage(
      supabase,
      parsed.data.category,
      parsed.data.body,
    );
    return { success: true };
  } catch (err) {
    console.error("submitSupportMessageAction failed", err);
    return { success: false, error: "Could not submit message" };
  }
}
