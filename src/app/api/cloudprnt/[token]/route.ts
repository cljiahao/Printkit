import { NextResponse } from "next/server";
import {
  resolveDevice,
  renderJobPng,
  logDeviceEvent,
  jobBelongsToLocation,
} from "@/lib/connectors/cloud-poll/service";
import { getCloudPollDriver } from "@/lib/connectors/cloud-poll/drivers";
import {
  peekClaimableJob,
  touchPrinterSeen,
  bindDeviceRef,
  type PrinterRow,
} from "@/lib/printers";
import { claimJob, sweepLocation } from "@/lib/job-dispatch";
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

  const poll = await device.driver.parsePoll(request);
  if (!(await deviceMatches(device.printer, poll.deviceRef))) {
    return unauthorized();
  }

  const job = await peekClaimableJob(device.printer.location_id);
  return device.driver.pollResponse(job);
}

export async function GET(request: Request, context: RouteContext) {
  const device = await openDevice(context);
  if (!device) return unauthorized();

  const jobId = new URL(request.url).searchParams.get("token");
  if (!jobId) {
    return NextResponse.json({ error: "Unknown job" }, { status: 404 });
  }

  const job = await claimJob(device.printer.location_id, jobId);
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
  if (!confirmation.jobId) {
    return NextResponse.json({ error: "Unknown job" }, { status: 404 });
  }

  const owned = await jobBelongsToLocation(
    confirmation.jobId,
    device.printer.location_id,
  );
  if (!owned) {
    return NextResponse.json({ error: "Unknown job" }, { status: 404 });
  }

  await updatePrintJobStatus(
    confirmation.jobId,
    confirmation.outcome,
    confirmation.outcome === "failed" ? "device_reported_error" : undefined,
  );

  return NextResponse.json({ ok: true });
}
