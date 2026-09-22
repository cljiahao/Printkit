# pair

## Purpose

Where a Raspberry Pi agent trades a one-time pairing code for its own
device token.

## Contents

- `route.ts` — `POST {code}`. Redeems the code (8 characters, 10 minutes,
  single use) and returns a token that is stored only as a hash. Tested in
  `../route.test.ts`.

## Parent

[bridge-agent](../README.md)
