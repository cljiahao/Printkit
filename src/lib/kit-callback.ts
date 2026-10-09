import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";

// Outbound, per-kit callback on a print job's status change -- looks the
// target kit's callback_url/callback_secret up from kit_api_keys instead of
// one hardcoded kit's env vars. Fire-and-forget: never throws, and a kit
// with no callback configured is skipped silently, not an error.

export async function notifyKitPrintStatus(
  kitSlug: string,
  sourceRef: string,
  status: "printed" | "failed",
  attemptAt: string,
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);

  try {
    // Supabase returns UTC offsets; preserve microseconds when canonicalizing.
    const match =
      /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(?:Z|\+00:00)$/.exec(
        attemptAt,
      );
    if (!match) return;
    const attempt = match[1] + "." + (match[2] ?? "").padEnd(6, "0") + "Z";
    if (!z.string().datetime({ precision: 6 }).safeParse(attempt).success)
      return;
    const supabase = await createServiceClient();
    const { data, error } = await supabase
      .from("kit_api_keys")
      .select("callback_url, callback_secret")
      .eq("kit_slug", kitSlug)
      .maybeSingle();

    if (error) {
      console.error(
        "notifyKitPrintStatus: kit_api_keys lookup failed",
        error.message,
      );
      return;
    }
    if (!data?.callback_url || !data?.callback_secret) {
      return;
    }

    const res = await fetch(data.callback_url, {
      method: "POST",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${data.callback_secret}`,
        "Content-Type": "application/json",
      },
      // order_id matches qkit's own inbound route contract -- a future
      // second kit's route needs the same shape, or this becomes per-kit.
      body: JSON.stringify({
        order_id: sourceRef,
        status,
        attempt_at: attempt,
      }),
    });
    if (!res.ok) {
      console.error(`notifyKitPrintStatus: ${kitSlug} returned ${res.status}`);
    }
  } catch (err) {
    console.error(
      "notifyKitPrintStatus failed",
      err instanceof Error ? err.message : err,
    );
  } finally {
    clearTimeout(timer);
  }
}
