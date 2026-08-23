import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyKitAuth } from "@/lib/kit-auth";
import { createOrUpdatePrintLocation } from "@/lib/print-locations";

const bodySchema = z.object({
  vendor_id: z.string().uuid(),
  source_ref: z.string().min(1),
  label: z.string().min(1),
  active: z.boolean(),
});

export async function POST(request: Request) {
  const auth = await verifyKitAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  const result = await createOrUpdatePrintLocation({
    vendorId: parsed.data.vendor_id,
    sourceKit: auth.kitSlug,
    sourceRef: parsed.data.source_ref,
    label: parsed.data.label,
    active: parsed.data.active,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status },
    );
  }
  return NextResponse.json({ id: result.id }, { status: 201 });
}
