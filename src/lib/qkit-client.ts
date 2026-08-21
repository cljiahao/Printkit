// Outbound callback to qkit when a print job's status changes. qkit's
// inbound route (src/app/api/printkit/print-status/route.ts, qkit repo)
// checks a single shared secret with NO kit_slug prefix — qkit has exactly
// one caller for this route (printkit), unlike printkit's own kit-auth.ts
// which serves many calling kits. Do not send "printkit:${secret}" here —
// that would not match qkit's bearerOk()-style check.
//
// Fire-and-forget from the caller's perspective (see updatePrintJobStatus
// in print-jobs.ts): never throws, every failure mode is swallowed after a
// log line, matching qkit's own paykit/client.ts precedent for the same
// reason — a callback failure must never break the status update that
// triggered it.

export async function notifyQkitPrintStatus(
  orderId: string,
  status: "printed" | "failed",
): Promise<void> {
  const secret = process.env.QKIT_CALLBACK_SECRET;
  if (!secret) return;

  const qkitUrl = process.env.NEXT_PUBLIC_QKIT_URL ?? "https://qkit.vercel.app";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(new URL("/api/printkit/print-status", qkitUrl), {
      method: "POST",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ order_id: orderId, status }),
    });
    if (!res.ok) {
      console.error(`notifyQkitPrintStatus: qkit returned ${res.status}`);
    }
  } catch (err) {
    console.error(
      "notifyQkitPrintStatus failed",
      err instanceof Error ? err.message : err,
    );
  } finally {
    clearTimeout(timer);
  }
}
