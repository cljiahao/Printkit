import { createHash } from "node:crypto";
import { toFeieMarkup } from "@/lib/connectors/vendor-cloud/feie-markup";
import type {
  RegisterResult,
  RenderedJob,
  SendResult,
  VendorCloudDriver,
} from "@/lib/connectors/types";

const DEFAULT_API_BASE = "https://api.jp.feieyun.com/Api/Open/";
const TIMEOUT_MS = 5000;

type FeieResponse = {
  ret?: number;
  msg?: string;
  data?: unknown;
};

type CallResult = { ok: true; data: unknown } | { ok: false; error: string };

/**
 * Merqo holds one Feie developer account; a vendor's printer is added to it
 * at setup. Read at request time, never at import, so a missing variable is
 * a failed call rather than a failed boot.
 */
function credentials(): { user: string; ukey: string; base: string } | null {
  const user = process.env.FEIE_USER;
  const ukey = process.env.FEIE_UKEY;
  if (!user || !ukey) return null;
  return {
    user,
    ukey,
    base: process.env.FEIE_API_BASE ?? DEFAULT_API_BASE,
  };
}

/**
 * SHA-1 is not a choice: Feie's API defines its request signature this way,
 * and the value only authenticates a request against a replay window, never
 * stores or protects anything at rest.
 */
function sign(user: string, ukey: string, stime: string): string {
  // eslint-disable-next-line sonarjs/hashing
  return createHash("sha1")
    .update(`${user}${ukey}${stime}`, "utf8")
    .digest("hex");
}

/**
 * One request shape for every Feie endpoint. Never throws: a timeout, a
 * network failure, malformed JSON and a non-zero `ret` all become a failure
 * result the caller can record as a driver error.
 */
async function call(
  apiname: string,
  params: Record<string, string>,
): Promise<CallResult> {
  const creds = credentials();
  if (!creds) {
    return { ok: false, error: "Feie is not configured." };
  }

  const stime = Math.floor(Date.now() / 1000).toString();
  const body = new URLSearchParams({
    user: creds.user,
    stime,
    sig: sign(creds.user, creds.ukey, stime),
    apiname,
    ...params,
  });

  try {
    const response = await fetch(creds.base, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const parsed = (await response.json()) as FeieResponse;
    if (parsed.ret !== 0) {
      return { ok: false, error: parsed.msg ?? `Feie error (${apiname})` };
    }
    return { ok: true, data: parsed.data };
  } catch (err) {
    console.error(`feie: ${apiname} failed`, err);
    return { ok: false, error: "Could not reach the printer's service." };
  }
}

export const feieDriver: VendorCloudDriver = {
  id: "feie",
  connector: "vendor_cloud",
  outputFormat: "markup",

  /**
   * The vendor reads the SN and KEY off the printer. The KEY only proves
   * they hold the device, so it is used here and never stored.
   */
  async registerPrinter(
    input: Record<string, string>,
  ): Promise<RegisterResult> {
    const sn = input.sn?.trim();
    const key = input.key?.trim();
    if (!sn || !key) {
      return { ok: false, error: "Enter the printer's SN and KEY." };
    }

    const name = (input.name ?? "Merqo").replace(/[#\n]/g, " ");
    const result = await call("Open_printerAddlist", {
      printerContent: `${sn}#${key}#${name}`,
    });

    return result.ok ? { ok: true, deviceRef: sn } : result;
  },

  async unregisterPrinter(deviceRef: string): Promise<void> {
    await call("Open_printerDelList", { snlist: deviceRef });
  },

  async send(deviceRef: string, job: RenderedJob): Promise<SendResult> {
    const result = await call("Open_printLabelMsg", {
      sn: deviceRef,
      content: toFeieMarkup(job.layout),
      times: "1",
    });

    if (!result.ok) return result;
    if (typeof result.data !== "string" || result.data === "") {
      return { ok: false, error: "The printer's service returned no job id." };
    }
    return { ok: true, driverRef: result.data };
  },

  async queryJob(driverRef: string): Promise<"pending" | "printed" | "failed"> {
    const result = await call("Open_queryOrderState", { orderid: driverRef });
    if (!result.ok) return "pending";
    return result.data === true ? "printed" : "pending";
  },

  /**
   * Feie answers with a human-readable state. Only "off-line" is reliably
   * negative, so anything else that came back successfully counts as
   * reachable rather than guessing at its other wordings.
   */
  async queryPrinter(
    deviceRef: string,
  ): Promise<"online" | "offline" | "unknown"> {
    const result = await call("Open_queryPrinterStatus", { sn: deviceRef });
    if (!result.ok) return "unknown";
    if (typeof result.data !== "string") return "unknown";
    return result.data.toLowerCase().includes("off-line")
      ? "offline"
      : "online";
  },
};
