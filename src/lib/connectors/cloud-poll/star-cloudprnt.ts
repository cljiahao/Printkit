import { NextResponse } from "next/server";
import type {
  CloudPollDriver,
  ConfirmResult,
  PollInfo,
} from "@/lib/connectors/types";

/**
 * Star CloudPRNT v1 over HTTP. The printer polls with a JSON POST, fetches
 * the job with a GET carrying the poll's own jobToken, and confirms with a
 * DELETE carrying a result code. CloudPRNT v2 (MQTT) is out of scope.
 */

function normaliseMac(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const cleaned = value.toLowerCase().replace(/[^0-9a-f]/g, "");
  return cleaned === "" ? null : cleaned;
}

/**
 * Star's protocol reference sends `code` as a URL-encoded status such as
 * "200 OK" or "511 Media Decoding Error", and says anything not beginning
 * with "2" means printing did not succeed. An absent code or a bare "OK"
 * is read as success too, since neither reports a failure.
 */
function isSuccessCode(code: string | null): boolean {
  if (code === null || code === "") return true;
  const value = code.trim().toUpperCase();
  return value === "OK" || value.startsWith("2");
}

export const starCloudPrntDriver: CloudPollDriver = {
  id: "star-cloudprnt",
  connector: "cloud_poll",
  outputFormat: "png",

  async parsePoll(request: Request): Promise<PollInfo> {
    try {
      const body: unknown = await request.json();
      const record = (
        typeof body === "object" && body !== null ? body : {}
      ) as Record<string, unknown>;
      return {
        deviceRef: normaliseMac(record.printerMAC),
        ready: true,
      };
    } catch {
      return { deviceRef: null, ready: true };
    }
  },

  pollResponse(job: { id: string } | null): Response {
    if (!job) return NextResponse.json({ jobReady: false });
    return NextResponse.json({
      jobReady: true,
      mediaTypes: ["image/png"],
      jobToken: job.id,
      deleteMethod: "DELETE",
    });
  },

  jobResponse(body: Buffer, contentType: string): Response {
    return new Response(new Uint8Array(body), {
      status: 200,
      headers: {
        "content-type": contentType,
        "cache-control": "no-store",
      },
    });
  },

  parseConfirmation(request: Request): ConfirmResult {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    if (!isSuccessCode(code)) {
      console.error("star-cloudprnt: print failed with code", code);
    }
    return {
      jobId: url.searchParams.get("token"),
      outcome: isSuccessCode(code) ? "printed" : "failed",
    };
  },
};
