import { NextResponse } from "next/server";
import { z } from "zod";
import { readBoundedJson, RequestBodyError } from "@/lib/bounded-json";
import { redeemPairingCode } from "@/lib/bridge-pairing";
import { mintDeviceCredential } from "@/lib/device-credentials";

const bodySchema = z.object({ code: z.string().min(4).max(32) });

/**
 * A Raspberry Pi trades the code the vendor read off their screen for a
 * long-lived agent token. The code is single use and expires in ten
 * minutes, so a code left on a screenshot is not a standing key to the
 * printer.
 */
export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await readBoundedJson(request);
  } catch (error) {
    const status = error instanceof RequestBodyError ? error.status : 400;
    return NextResponse.json({ error: "Invalid request" }, { status });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const printerId = await redeemPairingCode(parsed.data.code);
  if (!printerId) {
    return NextResponse.json(
      { error: "That pairing code is not valid any more." },
      { status: 401 },
    );
  }

  const token = await mintDeviceCredential(printerId, "bridge_agent_token");
  if (!token) {
    return NextResponse.json(
      { error: "Could not finish pairing." },
      { status: 500 },
    );
  }

  return NextResponse.json({ token }, { status: 201 });
}
