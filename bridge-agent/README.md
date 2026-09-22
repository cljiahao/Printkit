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
  the outcome. It refuses a non-HTTPS printkit address (plain HTTP only to
  this machine), a token not in printkit's format and a job id that is not
  a UUID, since all three come from a file or the network. `UnauthorizedError` is kept distinct from other failures so
  the loop can tell "printkit is unreachable" (back off and retry) from
  "this agent has been unpaired" (stop for good).
- `src/loop.ts` — `runOnce`/`runLoop`. One job at a time. A print failure is
  reported rather than retried, because printkit owns the retry decision and
  a silent retry would burn labels. Unreachable printkit backs off
  exponentially to a minute.
- `src/config.ts` — the agent token and chosen printer, stored in
  `~/.printkit-bridge/config.json` with mode `600`: whoever can read that
  file can print to that one printer.
- `src/printer.ts` — the Bluetooth adapter over `@mmote/niimblue-node`
  1.3.0 (MIT, pinned exactly): `initClient("ble", address)`, then
  `ImageEncoder.encodeImage` and `printImages`, the same calls its own CLI
  makes. The module is loaded at call time so `pair` and `use` still work
  on a machine without it. The print task (`B1`, `D110`, ...) is the one
  chosen with `use`, or whatever the printer reports when none was chosen.
- `src/cli.ts` — `printkit-bridge pair <code> | use <name> [model] | run`.
- `install.sh` and `printkit-bridge.service` — install BlueZ and the build
  tools, build the agent, install it under `/opt/printkit-bridge`, link
  `printkit-bridge` into `/usr/local/bin`, and run it at boot under the
  vendor's own user. The unit grants only `CAP_NET_RAW`/`CAP_NET_ADMIN`
  (what a raw HCI socket needs) and limits writes to the agent's own
  config directory.
- `tsconfig.json` — builds `src/` to `dist/` (tests excluded).

## Setup

1. In printkit, add a Bluetooth printer to a booth and choose Raspberry Pi.
   printkit shows an 8-character pairing code, good for 10 minutes and
   usable once.
2. On the Pi (Raspberry Pi OS, Node 24+):
   `git clone --depth 1 https://github.com/cljiahao/Printkit.git`, then
   `cd Printkit/bridge-agent`. The repo is public, so no release is needed.
3. On the Pi, inside the folder: `sudo ./install.sh`
4. `printkit-bridge pair <code>`
5. `printkit-bridge use "<printer Bluetooth name or address>" B1`
6. `sudo systemctl start printkit-bridge@<user>.service`

`PRINTKIT_URL` overrides the printkit host (for a preview deployment);
`PRINTKIT_BRIDGE_HOME` overrides the config directory.

## Troubleshooting

These come from the Bluetooth library's own Linux notes (`@stoprocent/noble`).

- **Nothing connects, no error.** The service lacks Bluetooth permission.
  Run the agent through systemd, not by hand, or run it by hand with
  `sudo`.
- **Connects on a laptop, not on the Pi.** Add `DisablePlugins=pnat` to the
  bottom of `/etc/bluetooth/main.conf` and reboot.
- **A USB Bluetooth dongle is plugged in.** Pick the adapter with
  `Environment=NOBLE_HCI_DEVICE_ID=1` in the unit.
- **The printer is never found by name.** Use its address instead:
  `bluetoothctl scan on` lists it.

## Not verified yet

The upstream library is tested on Windows and macOS. Linux goes through
noble's HCI binding, which is widely used on a Pi, but no label has been
printed from one here. Everything is covered by tests against a fake
printer library and a fake printkit, and the agent builds and runs its CLI.
That is the hardware gate the printer catalog's `hardwareVerified` flag
waits on.

## Parent

See the repo root [README.md](../README.md).
