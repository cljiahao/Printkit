"use client";

import { Button } from "@/components/ui/button";

export function LocationPicker({
  locations,
  onSelect,
}: {
  locations: { id: string; label: string }[];
  onSelect: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        Which booth is this device the bridge for?
      </p>
      {locations.map((loc) => (
        <Button
          key={loc.id}
          type="button"
          variant="outline"
          className="w-full justify-start"
          onClick={() => onSelect(loc.id)}
        >
          {loc.label}
        </Button>
      ))}
    </div>
  );
}
