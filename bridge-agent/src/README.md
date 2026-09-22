# src

## Purpose

The Raspberry Pi agent's source, built to `../dist/` by `npm run build`.

## Contents

- `cli.ts` — `pair`, `use`, `run`.
- `client.ts` — printkit's agent endpoints.
- `loop.ts` — poll, print, report, with backoff.
- `config.ts` — the token and chosen printer, stored with mode 600.
- `printer.ts` — the NIIMBOT adapter over `@mmote/niimblue-node`.
- `*.test.ts` — run by printkit's own Vitest config; excluded from the
  build.

## Parent

[bridge-agent](../README.md)
