import { NextResponse } from "next/server";
import { createVerify } from "node:crypto";
import { updatePrintJobStatus } from "@/lib/print-jobs";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Feie reports a print result here. The body is form-encoded and signed
 * with SHA256withRSA over `orderId` + `status` + `stime`, so an unsigned
 * or badly signed request changes nothing: this route is reachable by
 * anyone, and a forged callback would otherwise mark a vendor's labels
 * printed.
 */
function verifySignature(
  fields: { orderId: string; status: string; stime: string },
  signature: string,
): boolean {
  const publicKey = process.env.FEIE_CALLBACK_PUBLIC_KEY;
  if (!publicKey) {
    console.error("feie callback: FEIE_CALLBACK_PUBLIC_KEY is not set");
    return false;
  }

  try {
    const verifier = createVerify("RSA-SHA256");
    verifier.update(`${fields.orderId}${fields.status}${fields.stime}`, "utf8");
    verifier.end();
    return verifier.verify(publicKey, signature, "base64");
  } catch (err) {
    console.error("feie callback: signature check failed", err);
    return false;
  }
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
  const stime = String(form.get("stime") ?? "");
  const signature = String(form.get("sign") ?? "");

  if (!orderId || !signature) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!verifySignature({ orderId, status, stime }, signature)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const jobId = await findJobByDriverRef(orderId);
  if (!jobId) {
    return NextResponse.json({ ok: true });
  }

  if (status === "1") {
    await updatePrintJobStatus(jobId, "printed");
  } else {
    await updatePrintJobStatus(jobId, "failed", "device_reported_error");
  }

  return NextResponse.json({ ok: true });
}
