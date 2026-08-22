"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { reprintJob } from "./actions";

export function ReprintButton({ jobId }: { jobId: string }) {
  const [pending, setPending] = useState(false);

  const handleClick = async () => {
    setPending(true);
    const result = await reprintJob(jobId);
    setPending(false);
    if (result.success) {
      toast.success("Reprint queued.");
    } else {
      toast.error(result.error);
    }
  };

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={handleClick}
      disabled={pending}
    >
      {pending ? "Reprinting…" : "Reprint"}
    </Button>
  );
}
