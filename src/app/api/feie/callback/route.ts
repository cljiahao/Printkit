import { NextResponse } from "next/server";
import { readBoundedForm, RequestBodyError } from "@/lib/bounded-json";
import { createVerify } from "node:crypto";
import { updatePrintJobStatus } from "@/lib/print-jobs";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Feie's documented string to sign: every posted field except `sign` and
 * empty values, sorted by name, joined as `name=value&name=value`. For a
 * normal result that is `orderId=...&status=1&stime=...`.
 */
function signingString(form: FormData): string {
  const pairs: Array<[string, string]> = [];
  for (const [name, value] of form.entries()) {
    if (name === "sign" || typeof value !== "string" || value === "") continue;
    pairs.push([name, value]);
  }
  // Plain code-unit order, which is Feie's "ASCII ascending".
  pairs.sort(([a], [b]) => {
    if (a === b) return 0;
    return a < b ? -1 : 1;
  });
  return pairs.map(([name, value]) => `${name}=${value}`).join("&");
}

/**
 * Feie reports a print result here, form-encoded and signed with
 * SHA256withRSA, so an unsigned or badly signed request changes nothing:
 * this route is reachable by anyone, and a forged callback would otherwise
 * mark a vendor's labels printed.
 */
function verifySignature(payload: string, signature: string): boolean {
  const publicKey = process.env.FEIE_CALLBACK_PUBLIC_KEY;
  if (!publicKey) {
    console.error("feie callback: FEIE_CALLBACK_PUBLIC_KEY is not set");
    return false;
  }

  try {
    const verifier = createVerify("RSA-SHA256");
    verifier.update(payload, "utf8");
    verifier.end();
    return verifier.verify(publicKey, signature, "base64");
  } catch (err) {
    console.error("feie callback: signature check failed", err);
    return false;
  }
}

/**
 * Feie expects the literal body SUCCESS within 5 seconds and retries
 * anything else.
 */
function acknowledged(): Response {
  return new Response("SUCCESS", {
    status: 200,
    headers: { "content-type": "text/plain" },
  });
}

async function findJobByDriverRef(
  driverRef: string,
): Promise<{ ok: true; id: string | null } | { ok: false }> {
  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("print_jobs")
    .select("id, status")
    .eq("driver_ref", driverRef)
    .maybeSingle();

  if (error) {
    console.error("feie callback: job lookup failed", error.message);
    return { ok: false };
  }
  // Already-settled and requeued attempts are idempotent acknowledgements.
  return { ok: true, id: data?.status === "sent" ? data.id : null };
}

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await readBoundedForm(request);
  } catch (error) {
    const status = error instanceof RequestBodyError ? error.status : 400;
    return NextResponse.json({ error: "Invalid body" }, { status });
  }

  const orderId = String(form.get("orderId") ?? "");
  const status = String(form.get("status") ?? "");
  const signature = String(form.get("sign") ?? "");

  if (!orderId || !signature) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!verifySignature(signingString(form), signature)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // An order that is not ours still gets SUCCESS: anything else makes Feie
  // retry a callback that can never succeed.
  const job = await findJobByDriverRef(orderId);
  if (!job.ok) {
    return NextResponse.json(
      { error: "Could not find print job." },
      { status: 500 },
    );
  }
  if (!job.id) return acknowledged();

  const outcome = status === "1" ? "printed" : "failed";
  const result = await updatePrintJobStatus(
    job.id,
    outcome,
    outcome === "failed" ? "device_reported_error" : undefined,
    { expectedStatus: "sent", driverRef: orderId },
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return acknowledged();
}
