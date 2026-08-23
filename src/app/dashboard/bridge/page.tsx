import { getVendorSession } from "@/lib/vendor-session";
import { listActiveLocations } from "@/lib/print-locations";
import { BridgePanel } from "./bridge-panel";
import { BridgeLocationGate } from "./bridge-location-gate";

function BridgeBody({
  vendorId,
  locations,
}: {
  vendorId: string;
  locations: { id: string; label: string }[];
}) {
  if (locations.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No booths have printing enabled yet — turn it on in qkit&apos;s booth
        settings.
      </p>
    );
  }
  if (locations.length === 1) {
    return <BridgePanel vendorId={vendorId} locationId={locations[0].id} />;
  }
  return <BridgeLocationGate vendorId={vendorId} locations={locations} />;
}

export default async function BridgePage() {
  const { user } = await getVendorSession();
  const locations = await listActiveLocations(user.id);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">Printer bridge</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Turn on Bridge mode on the Android device next to your printer, then
        pair it.
      </p>
      <div className="mt-6">
        <BridgeBody vendorId={user.id} locations={locations} />
      </div>
    </div>
  );
}
