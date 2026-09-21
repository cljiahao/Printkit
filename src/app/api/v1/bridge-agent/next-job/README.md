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
