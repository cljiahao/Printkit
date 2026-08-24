import { getVendorSession } from "@/lib/vendor-session";
import { listActiveLocations } from "@/lib/print-locations";
import { BridgePanel } from "./bridge-panel";
import { BridgeLocationGate } from "./bridge-location-gate";

function BridgeBody({
  vendorId,
  locations,
  preselectedLocationId,
}: {
  vendorId: string;
  locations: { id: string; label: string }[];
  preselectedLocationId: string | null;
}) {
  if (locations.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No booths have printing enabled yet — turn it on in qkit&apos;s booth
        settings.
      </p>
    );
  }
  const resolvedId =
    preselectedLocationId ?? (locations.length === 1 ? locations[0].id : null);
  if (resolvedId) {
    return <BridgePanel vendorId={vendorId} locationId={resolvedId} />;
  }
  return <BridgeLocationGate vendorId={vendorId} locations={locations} />;
}

export default async function BridgePage({
  searchParams,
}: {
  // booth = a location's source_ref; skips the picker when it matches.
  searchParams: Promise<{ booth?: string }>;
}) {
  const { user } = await getVendorSession();
  const [locations, { booth }] = await Promise.all([
    listActiveLocations(user.id),
    searchParams,
  ]);
  const preselectedLocationId = booth
    ? (locations.find((loc) => loc.source_ref === booth)?.id ?? null)
    : null;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">Printer bridge</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Turn on Bridge mode on the Android device next to your printer, then
        pair it.
      </p>
      <div className="mt-6">
        <BridgeBody
          vendorId={user.id}
          locations={locations}
          preselectedLocationId={preselectedLocationId}
        />
      </div>
    </div>
  );
}
