# next-job

## Purpose

The Raspberry Pi agent's poll: claim the next job for its printer, if any.

## Contents

- `route.ts` — `GET`, bearer device token. Records the printer as seen,
  runs the location's sweep and claims at most one job through `claim_job`,
  so two agents can never print the same label. Tested in
  `../route.test.ts`.

## Parent

[bridge-agent](../README.md)

The response is `{job_id, sent_at}`. Keep the complete timestamp, including
microseconds and timezone, and echo it in the result request. It identifies
this claim, even when a vendor requeues and claims the same job again.
