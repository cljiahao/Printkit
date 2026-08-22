# components

## Purpose

Shared client components used across dashboard pages (not scoped to a
single route).

## Contents

- `bridge-status.tsx` — read-only online/offline pill for the vendor's
  bridge device, subscribed to a Supabase Realtime Presence channel
  (`printkit:presence:{vendorId}`). Plan 4's bridge device is the publisher.

## Parent

See the repo root [README.md](../../README.md).
