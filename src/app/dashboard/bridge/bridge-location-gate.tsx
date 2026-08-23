"use client";

import { useState } from "react";
import { LocationPicker } from "./location-picker";
import { BridgePanel } from "./bridge-panel";

/**
 * Holds the vendor's picked booth (client state) between the server-fetched
 * location list in page.tsx and BridgePanel, which needs a single resolved
 * locationId. Only rendered when there are 2+ active locations to choose
 * from — the zero/one cases are resolved directly in page.tsx.
 */
export function BridgeLocationGate({
  vendorId,
  locations,
}: {
  vendorId: string;
  locations: { id: string; label: string }[];
}) {
  const [locationId, setLocationId] = useState<string | null>(null);

  if (!locationId) {
    return <LocationPicker locations={locations} onSelect={setLocationId} />;
  }

  return <BridgePanel vendorId={vendorId} locationId={locationId} />;
}
