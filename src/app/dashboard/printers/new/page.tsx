import Link from "next/link";
import { getVendorSession } from "@/lib/vendor-session";
import { listActiveLocations } from "@/lib/print-locations";
import { PrinterPicker } from "./printer-picker";

export default async function NewPrinterPage({
  searchParams,
}: {
  searchParams: Promise<{ location?: string }>;
}) {
  const { user } = await getVendorSession();
  const [locations, { location }] = await Promise.all([
    listActiveLocations(user.id),
    searchParams,
  ]);

  const booth = locations.find((item) => item.id === location) ?? locations[0];

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-semibold tracking-tight">
        Choose a printer
      </h1>
      <p className="text-muted-foreground mt-1 text-sm">
        {booth
          ? `Which printer will print labels at ${booth.label}?`
          : "Turn printing on for a booth in qkit first."}
      </p>

      {booth ? (
        <div className="mt-6">
          <PrinterPicker
            locationId={booth.id}
            includeDev={process.env.VERCEL_ENV !== "production"}
          />
        </div>
      ) : (
        <p className="mt-6 text-sm">
          <Link
            href="/dashboard/printers"
            className="underline underline-offset-4"
          >
            Back to printers
          </Link>
        </p>
      )}
    </div>
  );
}
