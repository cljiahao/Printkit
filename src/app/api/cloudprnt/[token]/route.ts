import { NextResponse } from "next/server";
import { RequestBodyError } from "@/lib/bounded-json";
import {
  resolveDevice,
  renderJobPng,
  logDeviceEvent,
  readCloudPollJob,
  claimCloudPollJob,
} from "@/lib/connectors/cloud-poll/service";
import { getCloudPollDriver } from "@/lib/connectors/cloud-poll/drivers";
import {
  peekClaimableJob,
  touchPrinterSeen,
  bindDeviceRef,
  type PrinterRow,
} from "@/lib/printers";
import { sweepLocation } from "@/lib/job-dispatch";
import { cloudPollJobToken } from "@/lib/connectors/cloud-poll/job-token";
import { updatePrintJobStatus } from "@/lib/print-jobs";
import type { CloudPollDriver } from "@/lib/connectors/types";

type RouteContext = { params: Promise<{ token: string }> };

type Device = { printer: PrinterRow; driver: CloudPollDriver };

const unauthorized = () =>
  NextResponse.json({ error: "Unauthorized" }, { status: 401 });

/**
 * Shared entry for all three methods: the URL token names the printer, the
 * printer names its driver, and the location gets its lazy sweep before any
 * work happens.
 */
async function openDevice(context: RouteContext): Promise<Device | null> {
  const { token } = await context.params;
  const printer = await resolveDevice(token);
  if (!printer) return null;

  const driver = getCloudPollDriver(printer.driver);
  if (!driver) {
    console.error("cloudprnt: no driver built for", printer.driver);
    return null;
  }

  await sweepLocation(printer.location_id);
  await touchPrinterSeen(printer);
  return { printer, driver };
}

/**
 * Binds the first device that presents this token, then refuses any other
 * hardware using it. A vendor who replaces the printer clears the binding
 * from the printer's own settings.
 */
async function deviceMatches(
  printer: PrinterRow,
  deviceRef: string | null,
): Promise<boolean> {
  if (!deviceRef) return true;
  if (!printer.device_ref) {
    await bindDeviceRef(printer.id, deviceRef);
    return true;
  }
  if (printer.device_ref === deviceRef) return true;

  await logDeviceEvent(printer, "cloudprnt_mac_mismatch", {
    bound: printer.device_ref,
    presented: deviceRef,
  });
  return false;
}

export async function POST(request: Request, context: RouteContext) {
  const device = await openDevice(context);
  if (!device) return unauthorized();

  let poll;
  try {
    poll = await device.driver.parsePoll(request);
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return NextResponse.json(
        { error: "Invalid request" },
        { status: error.status },
      );
    }
    throw error;
  }
  if (!(await deviceMatches(device.printer, poll.deviceRef))) {
    return unauthorized();
  }

  const job = await peekClaimableJob(device.printer.location_id);
  return device.driver.pollResponse(
    job ? { id: cloudPollJobToken(job) } : null,
  );
}

export async function GET(request: Request, context: RouteContext) {
  const device = await openDevice(context);
  if (!device) return unauthorized();

  const token = new URL(request.url).searchParams.get("token");
  const revision = await readCloudPollJob(token, device.printer.location_id);
  if (!revision || revision.status !== "queued")
    return NextResponse.json(
      { error: "Unknown job revision" },
      { status: 404 },
    );
  const job = await claimCloudPollJob(device.printer.location_id, revision);
  if (!job) {
    return NextResponse.json({ error: "Unknown job" }, { status: 404 });
  }

  const png = await renderJobPng(job, device.printer);
  return device.driver.jobResponse(png, "image/png");
}

export async function DELETE(request: Request, context: RouteContext) {
  const device = await openDevice(context);
  if (!device) return unauthorized();

  const confirmation = device.driver.parseConfirmation(request);
  const job = await readCloudPollJob(
    confirmation.jobId,
    device.printer.location_id,
  );
  if (!job)
    return NextResponse.json(
      { error: "Unknown job revision" },
      { status: 404 },
    );
  if (job.status === confirmation.outcome)
    return NextResponse.json({ ok: true });
  if (job.status !== "sent" || !job.sent_at)
    return NextResponse.json(
      { error: "Print attempt is no longer pending" },
      { status: 409 },
    );

  const result = await updatePrintJobStatus(
    job.id,
    confirmation.outcome,
    confirmation.outcome === "failed" ? "device_reported_error" : undefined,
    {
      locationId: device.printer.location_id,
      expectedStatus: "sent",
      sentAt: job.sent_at,
      requeuedAt: job.requeued_at,
    },
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
