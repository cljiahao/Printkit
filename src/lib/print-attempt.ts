import { z } from "zod";

// Preserve Postgres microseconds: converting through Date loses attempt identity.
export const printAttemptSchema = z
  .string()
  .datetime({ offset: true })
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/,
  );
