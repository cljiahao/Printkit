# testing

## Purpose

Manual and hardware test plans that automated tests cannot cover: steps a
person runs against real devices, with pass criteria and negative checks.

## Contents

- `2026-09-21-printer-connectors-test-plan.md` — how to test each of the
  three printer connectors (`cloud_poll`, `vendor_cloud`, `bridge`): the
  checks to run before any hardware, the dev-only virtual printer, and the
  hardware gate each catalog entry must pass before `hardwareVerified`
  flips to true.

## Parent

[docs](../../README.md)
