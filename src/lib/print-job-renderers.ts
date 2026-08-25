import { renderLabelCanvas } from "@/lib/label-render";
import { payloadField } from "@/lib/print-job-payload";
import type { Json } from "@/lib/types";

// job_type -> canvas renderer. One entry today ('label'); the seam a
// second job type (receipt/kitchen-ticket) would plug into.
type JobRenderer = (payload: Json) => HTMLCanvasElement;

const RENDERERS: Record<string, JobRenderer> = {
  label: (payload) =>
    renderLabelCanvas({
      customerName: payloadField(payload, "customer_name", ""),
      orderNumber: payloadField(payload, "order_number", ""),
    }),
};

export function getJobRenderer(jobType: string): JobRenderer | null {
  return RENDERERS[jobType] ?? null;
}
