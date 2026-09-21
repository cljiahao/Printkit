# vendor-cloud

## Purpose

The connector for printers reached through their maker's own cloud service.
printkit pushes the job over HTTP; the maker delivers it to the printer,
typically over 4G. No helper device, no app, and no WiFi needed at the
stall, which is what suits an outdoor cart.

## Contents

- `feie.ts` — the Feie driver (Asia-Pacific station). Signs every request
  `sha1(user + ukey + stime)`, times out after 5 seconds, and turns a
  network failure, malformed JSON or a non-zero `ret` into a failure result
  rather than an exception. `registerPrinter` sends the printer's SN and
  KEY once and keeps only the SN, and reads Feie's `data.no` list, since
  Feie answers `ret: 0` even when it refused the printer (a wrong KEY, or
  a printer bound to 3 accounts already; "already added" counts as success); `send` posts the label markup with a `backurl` pointing at
  printkit's callback route (when `PRINTKIT_PUBLIC_URL` or Vercel supplies
  an origin) and stores the maker's own job id; `queryJob` and `queryPrinter` back the sweep and
  the health read. The Asia-Pacific station answers status in Chinese
  (`离线。` is offline); an "abnormal" printer, usually out of labels, is
  still reachable. An unreachable maker leaves a job `pending`, never
  `failed`, so a network blip cannot invent a print failure.
- `feie-markup.ts` — `toFeieMarkup(layout)`. Feie prints text itself, so a
  label is sent as tags rather than a PNG: its `<IMG>` tag only accepts a
  square image of at most 224 px, far too small for a whole label.
  Coordinates are dots at 8 per millimetre; label size stays in
  millimetres. Text uses font `12`, Feie's Simplified Chinese 24x24 font,
  which also covers Latin; a Chinese character counts as two Latin widths
  when centring. Layout sizes map to Feie magnification 1 to 4, alignment
  becomes an x offset (Feie has no alignment attribute), markup-breaking
  characters are escaped, and elements are dropped whole rather than
  letting the content exceed Feie's 5000 byte limit.
- `service.ts` — `sendVendorCloudJob` (render, send, record `driver_ref`,
  or fail the job with a reason) and `reconcileVendorCloudJob` (ask the
  maker what happened to a job, the fallback for a lost callback).
- `drivers.ts` — the drivers built for this connector.

## Environment

Server-only, read at request time: `FEIE_USER`, `FEIE_UKEY`, optional
`FEIE_API_BASE` (defaults to the Asia-Pacific station), and
`FEIE_CALLBACK_PUBLIC_KEY` for verifying Feie's own result callbacks. A
vendor's printer KEY is never stored.

## Callbacks

Feie posts `orderId`, `status` and `stime`, signed SHA256withRSA over every
non-empty field except `sign`, sorted by name and joined as
`name=value&name=value`. The route verifies that with
`FEIE_CALLBACK_PUBLIC_KEY` and answers the literal `SUCCESS` Feie waits for.
The callback URL must also be whitelisted in Feie's developer console.

## Unverified until the hardware gate

Feie's undocumented rate limits, the `expired` print parameter (not sent:
its unit is not documented clearly enough to trust), and a real callback
from the Asia-Pacific station. Each is handled defensively rather than
guessed at: a lost callback is caught by the sweep's status query.

## Connectivity

Driven by `../../job-dispatch.ts` (dispatch and sweep) and
`src/app/api/feie/callback/route.ts` (the maker's result callback).

## Parent

[connectors](../README.md)
