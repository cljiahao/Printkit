import type { ConnectorId } from "@/lib/printer-catalog";
import type { LabelLayout } from "@/lib/label-layout";

export type OutputFormat = "png" | "markup";

export type RenderedJob = {
  jobId: string;
  layout: LabelLayout;
  dpi: number;
};

export type DriverMeta = {
  id: string;
  connector: ConnectorId;
  outputFormat: OutputFormat;
};

export type PollInfo = {
  deviceRef: string | null;
  ready: boolean;
};

export type ConfirmResult = {
  jobId: string | null;
  outcome: "printed" | "failed";
};

export type SendResult =
  { ok: true; driverRef: string } | { ok: false; error: string };

export type RegisterResult =
  { ok: true; deviceRef: string } | { ok: false; error: string };

/**
 * Connector 1: the printer asks printkit for work. The connector owns the
 * HTTP endpoint, the credential check and the claim; the driver only maps
 * its brand's wire format onto poll, fetch and confirm.
 */
export interface CloudPollDriver extends DriverMeta {
  parsePoll(request: Request): Promise<PollInfo>;
  pollResponse(job: { id: string } | null): Response;
  jobResponse(body: Buffer, contentType: string): Response;
  parseConfirmation(request: Request): ConfirmResult;
}

/**
 * Connector 2: printkit sends the job to the maker's cloud, which pushes it
 * to the printer. The driver wraps that maker's API.
 */
export interface VendorCloudDriver extends DriverMeta {
  registerPrinter(input: Record<string, string>): Promise<RegisterResult>;
  unregisterPrinter(deviceRef: string): Promise<void>;
  send(deviceRef: string, job: RenderedJob): Promise<SendResult>;
  queryJob(driverRef: string): Promise<"pending" | "printed" | "failed">;
  queryPrinter(deviceRef: string): Promise<"online" | "offline" | "unknown">;
}

/**
 * Connector 3: a helper device next to the printer runs this driver and
 * talks Bluetooth. It runs on that device, not on the server.
 */
export interface BridgeDriver extends DriverMeta {
  print(
    png: Uint8Array,
    opts: { model: string; quantity: number },
  ): Promise<void>;
}
