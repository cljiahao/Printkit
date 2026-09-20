/**
 * How long a job may sit unclaimed before it is failed as expired. Lives in
 * its own module because both the sweep (job-dispatch.ts) and the peek
 * (printers.ts) need it, and importing one from the other would make a
 * cycle. It must stay in step with the same interval inside the claim_job
 * SQL function (migration 0008).
 */
export const JOB_EXPIRY_MS = 1_800_000;

/**
 * How long a claimed job may stay unconfirmed by the device before it is
 * treated as failed.
 */
export const CONFIRM_TIMEOUT_MS = 120_000;

/**
 * The same limit for a job pushed to a printer maker's cloud. It is longer
 * because two services have to agree, and the sweep asks the maker what
 * happened before giving up.
 */
export const VENDOR_CLOUD_CONFIRM_TIMEOUT_MS = 300_000;
