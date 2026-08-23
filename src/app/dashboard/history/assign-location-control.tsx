"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { assignPrintLocation } from "./actions";

/**
 * Inline control for routing an "unrouted" job to a booth. One click when
 * there's a single active location; a select-and-confirm when there are
 * several. Renders nothing when the vendor has no active locations at all.
 */
export function AssignLocationControl({
  jobId,
  locations,
}: {
  jobId: string;
  locations: { id: string; label: string }[];
}) {
  const [pending, setPending] = useState(false);
  const [selected, setSelected] = useState("");

  const assign = async (locationId: string) => {
    setPending(true);
    const result = await assignPrintLocation(jobId, locationId);
    setPending(false);
    if (result.ok) {
      toast.success("Booth assigned.");
    } else {
      toast.error(result.error);
    }
  };

  if (locations.length === 0) return null;

  if (locations.length === 1) {
    const [only] = locations;
    return (
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => assign(only.id)}
      >
        {pending ? "Assigning…" : `Assign to ${only.label}`}
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Select value={selected} onValueChange={setSelected}>
        <SelectTrigger size="sm" className="h-8 w-36">
          <SelectValue placeholder="Choose booth" />
        </SelectTrigger>
        <SelectContent>
          {locations.map((loc) => (
            <SelectItem key={loc.id} value={loc.id}>
              {loc.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        size="sm"
        variant="outline"
        disabled={pending || !selected}
        onClick={() => assign(selected)}
      >
        {pending ? "Assigning…" : "Assign"}
      </Button>
    </div>
  );
}
