import Link from "next/link";
import { getVendorSession } from "@/lib/vendor-session";
import { listLocationPrinterSummaries } from "@/lib/location-printer-summaries";
import { getCatalogEntry } from "@/lib/printer-catalog";
import { PrinterStatusRow } from "@/components/printer-status-row";
import { Button } from "@/components/ui/button";

const CONNECTOR_LABEL: Record<string, string> = {
  cloud_poll: "Cloud printer",
  vendor_cloud: "Brand-cloud printer",
  bridge: "Bluetooth printer with a helper device",
};

export default async function PrintersPage() {
  const { user } = await getVendorSession();
  const rows = await listLocationPrinterSummaries(user.id);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight">Printers</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        One printer per booth. New orders print by themselves once a booth has a
        printer that is online.
      </p>

      {rows.length === 0 ? (
        <p className="text-muted-foreground mt-6 text-sm">
          No booths have printing enabled yet. Turn it on in qkit&apos;s booth
          settings, then come back here.
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {rows.map(({ location, printer, state }) => (
            <li
              key={location.id}
              className="border-border rounded-lg border p-4"
            >
              <PrinterStatusRow
                label={location.label}
                printerName={printer?.display_name ?? null}
                state={state}
                lastSeenAt={printer?.last_seen_at ?? null}
              />

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {printer ? (
                  <>
                    <span className="text-muted-foreground text-xs">
                      {CONNECTOR_LABEL[printer.connector] ?? printer.connector}
                    </span>
                    {!getCatalogEntry(printer.catalog_id)?.hardwareVerified && (
                      <span className="text-muted-foreground text-xs">
                        Untested with real hardware
                      </span>
                    )}
                    <span className="grow" />
                    {printer.connector === "bridge" && (
                      <Button asChild variant="outline" size="sm">
                        <Link
                          href={`/dashboard/bridge?booth=${encodeURIComponent(
                            location.source_ref,
                          )}`}
                        >
                          Open bridge mode
                        </Link>
                      </Button>
                    )}
                    <Button asChild variant="outline" size="sm">
                      <Link
                        href={`/dashboard/printers/setup?location=${encodeURIComponent(
                          location.id,
                        )}&model=${encodeURIComponent(printer.catalog_id)}`}
                      >
                        Setup steps
                      </Link>
                    </Button>
                  </>
                ) : (
                  <Button asChild size="sm">
                    <Link
                      href={`/dashboard/printers/new?location=${encodeURIComponent(
                        location.id,
                      )}`}
                    >
                      Choose a printer
                    </Link>
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
