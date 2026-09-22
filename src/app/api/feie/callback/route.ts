import { NextResponse } from "next/server";
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

async function findJobByDriverRef(driverRef: string): Promise<string | null> {
  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("print_jobs")
    .select("id")
    .eq("driver_ref", driverRef)
    .maybeSingle();

  if (error) {
    console.error("feie callback: job lookup failed", error.message);
    return null;
  }
  return data?.id ?? null;
}

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
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
  const jobId = await findJobByDriverRef(orderId);
  if (!jobId) return acknowledged();

  if (status === "1") {
    await updatePrintJobStatus(jobId, "printed");
  } else {
    await updatePrintJobStatus(jobId, "failed", "device_reported_error");
  }

  return acknowledged();
}
