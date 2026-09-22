# label

## Purpose

The label PNG for a job the agent has already claimed.

## Contents

- `route.ts` — `GET`, bearer device token. Refuses a job that is not this
  printer's or not in `sent`. Tested in `../../../route.test.ts`.

## Parent

[bridge-agent](../../../README.md)
