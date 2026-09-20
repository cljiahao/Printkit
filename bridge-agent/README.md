# bridge-agent

## Purpose

A small Node program that turns a Raspberry Pi into a print bridge: it asks
printkit for jobs and prints them on a Bluetooth label printer sitting next
to it. It exists for vendors who already own a Bluetooth printer but cannot
leave an Android phone beside it all day.

This is the least recommended way to print with printkit, and the vendor
guide says so. A printer that reaches printkit by itself needs none of this.

It is a printkit client, not a CloudPRNT client: the Pi cannot hold a vendor
session, so it authenticates with its own device token and polls printkit's
own agent endpoints.

## Contents

- `src/client.ts` — `PrintkitClient`: pair, poll, download a label, report
  the outcome. `UnauthorizedError` is kept distinct from other failures so
  the loop can tell "printkit is unreachable" (back off and retry) from
  "this agent has been unpaired" (stop for good).
- `src/loop.ts` — `runOnce`/`runLoop`. One job at a time. A print failure is
  reported rather than retried, because printkit owns the retry decision and
  a silent retry would burn labels. Unreachable printkit backs off
  exponentially to a minute.
- `src/config.ts` — the agent token and chosen printer, stored in
  `~/.printkit-bridge/config.json` with mode `600`: whoever can read that
  file can print to that one printer.
- `src/printer.ts` — the Bluetooth adapter, loading the native module at
  call time so `pair` and `use` still work on a machine without it.
- `src/cli.ts` — `printkit-bridge pair <code> | use <name> [model] | run`.
- `install.sh` and `printkit-bridge.service` — install under
  `/opt/printkit-bridge` and run at boot under the vendor's own user, with
  systemd hardening that limits the agent to its own config directory.

## Setup

1. In printkit, add a Bluetooth printer to a booth and choose Raspberry Pi.
   printkit shows an 8-character pairing code, good for 10 minutes and
   usable once.
2. On the Pi: `sudo ./install.sh`
3. `printkit-bridge pair <code>`
4. `printkit-bridge use "<printer Bluetooth name>"`
5. `sudo systemctl start printkit-bridge@<user>.service`

`PRINTKIT_URL` overrides the printkit host (for a preview deployment);
`PRINTKIT_BRIDGE_HOME` overrides the config directory.

## Not verified yet

The upstream Bluetooth library documents Windows and macOS, not Linux or a
Pi. Everything here is covered by tests against a fake printer and a fake
printkit, but no real label has been printed from a Pi. That is the hardware
gate the printer catalog's `hardwareVerified` flag waits on.

## Parent

See the repo root [README.md](../README.md).
