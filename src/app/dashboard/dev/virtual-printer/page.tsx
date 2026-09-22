import { notFound } from "next/navigation";
import { getVendorSession } from "@/lib/vendor-session";
import { listActiveLocations } from "@/lib/print-locations";
import { VirtualPrinterPanel } from "./virtual-printer-panel";

export default async function VirtualPrinterPage() {
  if (process.env.VERCEL_ENV === "production") notFound();

  const { user } = await getVendorSession();
  const locations = await listActiveLocations(user.id);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight">Virtual printer</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        A test printer that prints to this page. It uses the same connection a
        real cloud printer uses, so you can check the whole path without
        hardware.
      </p>

      <div className="mt-6">
        {locations.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No booths have printing enabled yet. Turn it on in qkit&apos;s booth
            settings first.
          </p>
        ) : (
          <VirtualPrinterPanel locations={locations} />
        )}
      </div>
    </div>
  );
}
