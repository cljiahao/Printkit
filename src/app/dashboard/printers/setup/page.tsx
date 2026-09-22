import Link from "next/link";
import { notFound } from "next/navigation";
import { getVendorSession } from "@/lib/vendor-session";
import { listActiveLocations } from "@/lib/print-locations";
import { getCatalogEntry } from "@/lib/printer-catalog";
import { CloudPollSetup, VendorCloudSetup, BridgeSetup } from "./setup-wizard";

export default async function PrinterSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ location?: string; model?: string }>;
}) {
  const { user } = await getVendorSession();
  const [locations, { location, model }] = await Promise.all([
    listActiveLocations(user.id),
    searchParams,
  ]);

  const booth = locations.find((item) => item.id === location);
  const entry = model ? getCatalogEntry(model) : null;
  if (!booth || !entry) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <p className="text-muted-foreground text-sm">
        <Link
          href="/dashboard/printers"
          className="underline underline-offset-4"
        >
          Printers
        </Link>{" "}
        / {booth.label}
      </p>

      <h1 className="mt-2 text-2xl font-semibold tracking-tight">
        Set up the {entry.brand} {entry.model}
      </h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Labels for {booth.label}, {entry.defaultLabelMm.width} mm by{" "}
        {entry.defaultLabelMm.height} mm.
      </p>

      <div className="mt-8">
        {entry.connector === "cloud_poll" && (
          <CloudPollSetup entry={entry} locationId={booth.id} />
        )}
        {entry.connector === "vendor_cloud" && (
          <VendorCloudSetup entry={entry} locationId={booth.id} />
        )}
        {entry.connector === "bridge" && (
          <BridgeSetup locationId={booth.id} boothRef={booth.source_ref} />
        )}
      </div>
    </div>
  );
}
