import { createHash } from "node:crypto";
import { z } from "zod";

export type CloudPollRevision = {
  id: string;
  created_at: string;
  requeued_at: string | null;
};

export function cloudPollJobToken(job: CloudPollRevision): string {
  const revision = createHash("sha256")
    .update(JSON.stringify([job.created_at, job.requeued_at]))
    .digest("hex");
  return "v1." + job.id + "." + revision;
}

const tokenSchema = z
  .string()
  .regex(
    /^v1\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[0-9a-f]{64}$/,
  );

export function cloudPollJobId(token: string | null): string | null {
  const parsed = tokenSchema.safeParse(token);
  return parsed.success ? (parsed.data.split(".")[1] ?? null) : null;
}
