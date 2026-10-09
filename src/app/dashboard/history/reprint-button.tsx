"use client";

import { useAsyncAction } from "@/hooks/use-async-action";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { reprintJob } from "./actions";

export function ReprintButton({ jobId }: { jobId: string }) {
  const { pending, run } = useAsyncAction();

  const handleClick = () =>
    run(async () => {
      const result = await reprintJob(jobId);
      if (result.success) toast.success("Reprint queued.");
      else toast.error(result.error);
    }).catch(() =>
      toast.error("Could not queue the reprint. Please try again."),
    );

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
