# Printer connectors — Design

**Date:** 2026-09-20
**Status:** Draft, brainstorm complete, pending review (Codex) and user sign-off before `writing-plans`.
**Extends:** `2026-08-21-printkit-v0.1-design.md`. Reverses one decision in it: the Android-bridge-only architecture (see "Why now").

## Why now

Manfred (qkit's design partner) runs his stall from an iPad only. On
2026-09-20 he declined to buy an Android phone as a print bridge (small
margin, no counter space). That meets the v0.1 spec's own stated revisit
trigger: "a real vendor explicitly refuses the second device and it costs a
sale."

iOS options were evaluated and rejected the same day, and stay rejected:

- **Bluefy** (third-party Web Bluetooth browser): rejected. The vendor's
  logged-in session would live inside a closed-source app from a small
  vendor, and printing would depend on an app Merqo does not control. Not
  offered, not recommended, not documented as an option.
- **Native or Capacitor iOS app**: rejected (US$99/yr Apple Developer
  account, second codebase).
- **iPad Split View** (board and bridge side by side): rejected, losing half
  the order board is a dealbreaker.

The answer for iPad-only vendors is a printer that reaches printkit over the
internet by itself. Bluetooth printers stay supported, but only with a
helper device, and are documented as the least recommended option.

## Goals

1. Three connectors, and only three, each with one clear responsibility.
2. Adding a printer model of an already-supported brand is one catalog
   entry. Adding a new brand is one driver file inside an existing
   connector. No connector changes for either.
3. Types 1 and 2 are built and tested against mock printers before any
   hardware is bought. Hardware verification is a later, explicit gate per
   driver.
4. Vendors pick a printer from a catalog with filters, sorting, and "i"
   info tips, and see clearly which printers work with an iPad alone.
5. A Bluetooth guide page that opens by saying this path is not
   recommended, then gives complete Android and Raspberry Pi instructions.

## Non-goals

- Job types other than `label` (receipts, kitchen tickets): unchanged from
  v0.1, deferred.
- Automatic retry queue: manual reprint only, unchanged from v0.1.
- Bluefy, native iOS apps, iPad Split View: rejected (see above).
- Epson Server Direct Print, Xpyun (Xprinter), and Sunmi drivers: the
  architecture must admit them as single driver files, but none are built
  here. Each gets added when a real vendor picks that printer.
- Per-vendor label template editor: label layout stays code-owned. V5's
  layout work (big order number, S/M/L size, customization codes) plugs
  into the layout builder defined here but is its own spec.

## Terminology

| Term               | Meaning                                                                                                                |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| **Connector**      | How a job travels to a printer. Exactly three: `cloud_poll`, `vendor_cloud`, `bridge`.                                 |
| **Driver**         | Brand/protocol-specific code inside one connector. Implements the driver interface.                                    |
| **Catalog entry**  | Static data about one printer model: which connector and driver it uses, and what a vendor needs to know to choose it. |
| **Printer**        | A vendor's configured physical printer, one per print location. A DB row.                                              |
| **Print location** | Unchanged from v0.1: a calling kit's location (qkit booth), `printkit.print_locations`.                                |
| **Label layout**   | Device-independent description of one label: size in mm plus positioned text and QR elements.                          |

## Architecture

### The three connectors

| Connector      | Vendor-facing name                  | Who opens the connection            | Job delivery                                                                            | Printer examples                             |
| -------------- | ----------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------- |
| `cloud_poll`   | "Cloud printer"                     | The printer                         | Printer polls a printkit HTTPS endpoint every few seconds and downloads waiting jobs    | Star mC-Label2, mC-Label3 (Star CloudPRNT)   |
| `vendor_cloud` | "Brand-cloud printer"               | printkit                            | printkit calls the printer maker's cloud API, which pushes the job to the printer       | Feie FP-N20H (4G)                            |
| `bridge`       | "Bluetooth printer + helper device" | A helper device next to the printer | Helper device receives the job from printkit and sends it to the printer over Bluetooth | NIIMBOT B1 via Android phone or Raspberry Pi |

A connector owns everything that is common to its delivery style: auth of
the device, job hand-off, status transitions, and health signals. A driver
owns only the brand's wire format.

### Driver interface

Each connector defines a narrow interface its drivers implement. Shared
shape (TypeScript, illustrative, the plan pins exact signatures):

```ts
type OutputFormat = "png" | "markup";

interface DriverBase {
  id: string; // "star-cloudprnt", "feie", "niimbot"
  connector: "cloud_poll" | "vendor_cloud" | "bridge";
  outputFormat: OutputFormat; // what it needs from the layout
}

// cloud_poll: the connector owns the HTTP endpoint; the driver maps its
// protocol onto the connector's generic "poll / fetch / confirm" steps.
interface CloudPollDriver extends DriverBase {
  parsePoll(req: Request): Promise<PollInfo>; // device id, status
  pollResponse(job: QueuedJob | null): Response; // "job ready" or not
  jobResponse(job: RenderedJob): Response; // the job bytes
  parseConfirmation(req: Request): ConfirmResult; // printed | failed
}

// vendor_cloud: the driver wraps the maker's API.
interface VendorCloudDriver extends DriverBase {
  registerPrinter(creds: unknown): Promise<RegisterResult>; // e.g. SN + KEY
  unregisterPrinter(ref: string): Promise<void>;
  send(printerRef: string, job: RenderedJob): Promise<SendResult>; // returns driver_ref
  queryJob(driverRef: string): Promise<"pending" | "printed" | "failed">;
  queryPrinter(printerRef: string): Promise<"online" | "offline" | "unknown">;
  verifyCallback?(req: Request): Promise<CallbackResult | null>;
}

// bridge: the driver runs on the helper device, not on the server.
interface BridgeDriver extends DriverBase {
  connect(transport: BleTransport): Promise<void>;
  print(
    png: Uint8Array,
    opts: { model: string; quantity: number },
  ): Promise<void>;
  disconnect(): Promise<void>;
}
```

Drivers are registered in one map per connector (`src/lib/connectors/<connector>/drivers.ts`),
the same pattern as today's `RENDERERS` map in `print-job-renderers.ts`.

### Label layout and rendering

Rendering is split in two so every driver gets the same label content in
the form it can actually print.

1. **Layout builder (per job type).** `buildLabelLayout(payload, size)`
   returns a `LabelLayout`:

   ```ts
   type LabelLayout = {
     widthMm: number;
     heightMm: number;
     elements: Array<
       | {
           kind: "text";
           text: string;
           xMm: number;
           yMm: number;
           size: "sm" | "md" | "lg" | "xl";
           bold: boolean;
           align: "left" | "center" | "right";
         }
       | { kind: "qr"; value: string; xMm: number; yMm: number; sizeMm: number }
     >;
   };
   ```

   v1 content matches today's label (customer name, `#orderNumber`), laid
   out for the printer's configured label size. V5 changes this function
   only.

2. **Output adapters (per output format).**
   - `png`: `rasterizeLayout(layout, dpi)` draws the layout to a 1-bit PNG
     on the server with `@napi-rs/canvas` and a font file bundled in the
     repo (Vercel functions have no usable system fonts). Used by Star
     (`image/png` media type) and by both bridge transports.
   - `markup`: each markup driver translates the layout into its own tag
     language. Feie: `<SIZE>`, `<TEXT>`, `<QR>`, `<DIRECTION>` tags, with
     `size` mapped to Feie font magnification and mm converted at 8 dots
     per mm. A full-label image is not possible on Feie: its `<IMG>` tag
     only accepts square, black-and-white images up to 224 px and 10 KB.

Labels are the same content and arrangement on every printer, not
pixel-identical: printer-side fonts on markup printers differ from the
bundled raster font. This is accepted.

The Android bridge stops drawing labels in the browser. It downloads the
server-rendered PNG, draws it onto a canvas, and hands that canvas to
`niimbluelib` as today. `label-render.ts`'s browser drawing code is
removed; its pure layout logic moves into the layout builder.

### Printer catalog

A static, typed module (`src/lib/printer-catalog.ts`), version-controlled,
not a DB table. Images in `public/printers/`. One entry per model:

```ts
type CatalogEntry = {
  id: string; // "feie-fp-n20h"
  brand: string;
  model: string;
  connector: "cloud_poll" | "vendor_cloud" | "bridge";
  driver: string; // driver id
  connectivity: Array<"4g" | "wifi" | "ethernet" | "bluetooth" | "usb">;
  helperDevice: "none" | "android_or_pi";
  labelWidthMm: { min: number; max: number };
  defaultLabelMm: { width: number; height: number };
  dpi: number;
  power: "mains" | "battery" | "mains_or_battery";
  setupEffort: 1 | 2 | 3; // 1 = plug in and go, 3 = most setup
  priceBand: "low" | "mid" | "high"; // no exact prices, they go stale
  recommended: boolean;
  hardwareVerified: boolean; // false until a real unit passes the gate
  image: string;
  notes: string[]; // short facts shown in the "i" popover
};
```

"Works with iPad alone" is not stored. One helper, `worksWithIpadAlone(entry)`,
computes it as `entry.helperDevice === "none"`, so the badge and the filter
can never disagree with the entry.

Initial entries:

| id               | Connector      | Driver           | Verified | Recommended      |
| ---------------- | -------------- | ---------------- | -------- | ---------------- |
| `feie-fp-n20h`   | `vendor_cloud` | `feie`           | no       | yes              |
| `star-mc-label2` | `cloud_poll`   | `star-cloudprnt` | no       | yes              |
| `niimbot-b1`     | `bridge`       | `niimbot`        | no       | no               |
| `virtual`        | `cloud_poll`   | `star-cloudprnt` | n/a      | dev/preview only |

`virtual` is hidden when `VERCEL_ENV === "production"`. See "Virtual printer".

A catalog entry with `hardwareVerified: false` is still selectable, and
carries an "Untested with real hardware" badge until its driver passes the
hardware gate.

## Data model

All in the `printkit` schema. Every schema change is dual-written
(migration and `src/lib/types.ts`).

### New: `printkit.printers`

One configured physical printer, bound to one print location.

| Column                              | Type                                                           | Notes                                                                                                         |
| ----------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `id`                                | uuid pk                                                        |                                                                                                               |
| `vendor_id`                         | uuid not null, fk `auth.users`                                 |                                                                                                               |
| `location_id`                       | uuid not null, fk `print_locations`, **unique**                | one printer per location                                                                                      |
| `catalog_id`                        | text not null                                                  | catalog entry id; validated in app code against the catalog                                                   |
| `connector`                         | text not null, check in (`cloud_poll`,`vendor_cloud`,`bridge`) | copied from catalog at creation, used for routing without a catalog lookup                                    |
| `driver`                            | text not null                                                  | copied from catalog                                                                                           |
| `display_name`                      | text not null                                                  | vendor-editable, defaults to catalog model name                                                               |
| `label_width_mm`, `label_height_mm` | numeric not null                                               | defaults from catalog, vendor-editable within the model's range                                               |
| `device_ref`                        | text null                                                      | driver's device id: Star printer MAC (bound on first poll), Feie SN, Pi agent id. Null for the Android bridge |
| `last_seen_at`                      | timestamptz null                                               | health signal, see "Printer health"                                                                           |
| `created_at`                        | timestamptz not null default now()                             |                                                                                                               |

RLS: vendor `select` own rows only (`auth.uid() = vendor_id`). All writes
through service-role in server actions and route handlers, same as
`print_jobs` and `print_locations` today. A printer's location must belong
to the same vendor: enforced by a composite foreign key
`(location_id, vendor_id)` referencing a new unique key `(id, vendor_id)`
on `print_locations`, not only by app code.

### New: `printkit.device_credentials`

Secrets a device presents to printkit. Service-role only: RLS enabled, no
policies, no grants to `anon`/`authenticated` (same pattern as
`kit_api_keys`).

| Column                     | Type                                                        | Notes                                                    |
| -------------------------- | ----------------------------------------------------------- | -------------------------------------------------------- |
| `printer_id`               | uuid pk, fk `printers` on delete cascade                    |                                                          |
| `kind`                     | text check in (`cloudprnt_url_token`, `bridge_agent_token`) |                                                          |
| `token_hash`               | text not null                                               | SHA-256 of the token. Raw token shown once, never stored |
| `created_at`, `rotated_at` | timestamptz                                                 |                                                          |

Feie needs no stored device secret: the printer's SN and KEY are sent to
Feie's `Open_printerAddlist` once during setup and the KEY is then
discarded. Only the SN is kept, as `printers.device_ref`.

### New: `printkit.bridge_pairing_codes`

Short-lived codes that pair a Raspberry Pi agent to a printer. Service-role only.

| Column       | Type                                           | Notes                                                             |
| ------------ | ---------------------------------------------- | ----------------------------------------------------------------- |
| `code_hash`  | text pk                                        | SHA-256 of an 8-character code (unambiguous alphabet, no 0/O/1/I) |
| `printer_id` | uuid not null, fk `printers` on delete cascade |                                                                   |
| `expires_at` | timestamptz not null                           | created + 10 minutes                                              |
| `used_at`    | timestamptz null                               | single use                                                        |

### Changed: `printkit.print_jobs`

| Column           | Change                                                                                                                 |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `driver_ref`     | new, text null. The maker's job id for `vendor_cloud` (Feie `orderId`)                                                 |
| `failure_reason` | new, text null. Short machine-readable reason: `expired`, `printer_offline`, `driver_error`, `device_reported_error`   |
| `sent_at`        | new, timestamptz null                                                                                                  |
| `requeued_at`    | new, timestamptz null. Set by `reprintJob`, and by assigning an unrouted job to a location. Restarts the expiry window |
| `status`         | unchanged values: `queued` → `sent` → `printed` or `failed`                                                            |

### Unchanged

`print_locations`, `kit_api_keys`, `admin_audit`. The v0.1 routing rule
("a vendor with exactly one active location auto-delivers") is unchanged.

### Existing data

No production vendor has a paired B1 today (the v0.1 hardware gate never
ran), so there is nothing to backfill. A location with no `printers` row
simply has no printer yet, and jobs routed to it stay `queued` until one
is added (subject to job expiry).

## Job lifecycle

### Creation (unchanged API)

`POST /api/v1/print-jobs` keeps its request and response shape exactly.
After the insert, `createPrintJob` calls `dispatchJob(jobId)`:

- `cloud_poll`, `bridge`: no-op. The device pulls.
- `vendor_cloud`: send via the driver inside Next's `after()` so the API
  response never waits on the maker's cloud. On success: `status='sent'`,
  `sent_at`, `driver_ref`. On failure: `status='failed'`,
  `failure_reason='driver_error'`, which fires the existing kit callback.

`dispatchJob` is also called by `reprintJob` after it resets a job to
`queued`.

### Claiming a job (pull connectors)

Every delivery to a device first claims the job with a single conditional
update, so two polls (or a poll and a Realtime hint) can never print the
same job twice:

```sql
update printkit.print_jobs
set status = 'sent', sent_at = now()
where id = (
  select id from printkit.print_jobs
  where location_id = $location and status = 'queued'
    and ($job_id is null or id = $job_id)
    and coalesce(requeued_at, created_at) > now() - interval '30 minutes'
  order by coalesce(requeued_at, created_at)
  limit 1
  for update skip locked
)
returning *;
```

This runs as one SQL function, `printkit.claim_job(location_id, job_id default null)`,
`security definer`, executable by `service_role` only. With `job_id` null
it claims the oldest claimable job (Pi agent). With a `job_id` it claims
exactly that job or nothing (Star `GET`, Android Realtime hint).

For Star CloudPRNT, the claim happens on the job `GET`, not on the poll
`POST`: the poll only answers "is a job ready", and the `GET` claims and
returns it. The poll's `jobToken` carries the job id so the `GET` and the
confirmation `DELETE` refer to the same job. The `GET` calls
`claim_job(location, job_id)`.

### Completion

| Connector              | `printed` when                                                             | `failed` when                                                                        |
| ---------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `cloud_poll` (Star)    | Confirmation `DELETE` arrives with a success code                          | Confirmation code is an error, or no confirmation within 2 minutes of `sent_at`      |
| `vendor_cloud` (Feie)  | Feie's signed callback reports success, or a `queryJob` check says printed | Callback reports failure, or `queryJob` still says pending 5 minutes after `sent_at` |
| `bridge` (Android, Pi) | Device reports success                                                     | Device reports failure, or no report within 2 minutes of `sent_at`                   |

Timeouts are applied lazily (see "Lazy sweeps"), not by a scheduler. The
`queued` to `sent` step is the claim function. Every transition to
`printed` or `failed` goes through the existing `updatePrintJobStatus`, so
the qkit callback fires exactly as today. A timeout can mark a job
`failed` that did in fact print (lost confirmation). The vendor then sees
"print failed" and can ignore it or reprint. This is accepted.

### Job expiry

A job still `queued` 30 minutes after creation is never delivered. It is
set to `failed` with `failure_reason='expired'` the next time any sweep
touches that location. This stops a printer that comes online the next
morning (or at the next event) from printing yesterday's labels. The
vendor can still reprint an expired job manually: `reprintJob` sets
`requeued_at = now()`, which restarts the 30-minute window (the claim uses
`coalesce(requeued_at, created_at)`). Assigning an unrouted job to a
location does the same.

### Lazy sweeps

No cron: Vercel cron frequency depends on plan, and nothing here needs
second-level precision. Timeouts and expiry are applied by one idempotent
function, `sweepLocation(locationId)`, called at the start of:

- every pull for that location (CloudPRNT poll, Pi agent request, Android
  bridge claim or heartbeat),
- every status read (printkit dashboard, qkit's status call),
- every `vendor_cloud` job creation for that location.

`sweepLocation` also runs `queryJob` for `vendor_cloud` jobs in `sent`
older than 60 seconds (catches a lost callback), capped at 10 queries per
call.

## Printer health

One signal for every connector: `printers.last_seen_at`. A printer is
**online** if `last_seen_at` is within 60 seconds, otherwise **offline**,
or **not set up** if no `printers` row exists.

| Connector          | What updates `last_seen_at`                                                                                                                                                                                                                                       |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cloud_poll`       | Each poll. Written only if the stored value is older than 20 seconds, so a 5-second poll interval does not write on every request                                                                                                                                 |
| `bridge`, Pi agent | Each agent poll, same 20-second write throttle                                                                                                                                                                                                                    |
| `bridge`, Android  | A heartbeat server action every 20 seconds while Bridge mode is on                                                                                                                                                                                                |
| `vendor_cloud`     | A status read calls `queryPrinter` if `last_seen_at` is older than 60 seconds (at most once per 60 seconds per printer) and writes `now()` only if the maker reports the printer online. Feie reports online/offline itself, so "offline" here means Feie says so |

This replaces the v0.1 Realtime Presence channel
(`printkit:presence:<vendor>:<location>`). One mechanism instead of two.
The Android bridge keeps Realtime `postgres_changes` for job delivery,
which is unchanged.

`GET /api/v1/print-locations/status?source_ref=<ref>` (bearer kit auth, new)
returns, for the calling kit's location:

```json
{
  "printer": {
    "display_name": "Feie FP-N20H",
    "catalog_id": "feie-fp-n20h",
    "connector": "vendor_cloud",
    "state": "online",
    "last_seen_at": "2026-09-20T10:15:00Z",
    "hardware_verified": false
  }
}
```

`printer` is `null` when the location has no printer. This endpoint is how
qkit shows printer status (see "qkit changes"), and it removes qkit's
dependency on subscribing to printkit's Realtime channel with its own
Supabase client.

## Connector: `cloud_poll`

### Endpoint

`/api/cloudprnt/[token]`, one URL per printer, handling `POST` (poll),
`GET` (fetch job), and `DELETE` (confirm). `token` is a 32-byte random
value, base64url, shown to the vendor once during setup as part of the
full URL they paste into the printer's web configuration page. Only its
SHA-256 hash is stored (`device_credentials.kind='cloudprnt_url_token'`).
The vendor can rotate it from the printer's settings, which invalidates
the old URL immediately.

The route resolves `token_hash` to a printer, then delegates protocol
parsing to the printer's driver.

### Device binding

The first successful poll stores the printer's reported MAC as
`printers.device_ref`. Later polls from a different MAC with the same token
get `401` and an `admin_audit` entry (`cloudprnt_mac_mismatch`). The vendor
can clear the binding from settings when they replace the printer.

### Driver: `star-cloudprnt`

Maps Star CloudPRNT v1 (HTTP) onto the connector steps:

- **Poll `POST`:** JSON body with `printerMAC`, `statusCode`, and status
  fields. Response: `{"jobReady": true, "mediaTypes": ["image/png"], "jobToken": "<job id>"}`
  when the location has a claimable job, otherwise `{"jobReady": false}`.
  The poll does not claim.
- **Job `GET`:** CloudPRNT echoes the poll's `jobToken` back as the `token`
  query parameter (distinct from the URL path token). The route calls
  `claim_job(location, <that job id>)`. If the claim returns nothing
  (already claimed, expired, or not this location's job) it answers `404`.
  Otherwise it rasterizes the job and returns `image/png`.
- **Confirm `DELETE`:** `code` query param; a `2xx`-style code maps to
  `printed`, anything else to `failed` with `failure_reason='device_reported_error'`.
  `deleteMethod` stays the default `DELETE`.

CloudPRNT v2 (MQTT) is out of scope.

### Request volume

A printer polling every 5 seconds makes about 720 requests per hour
while switched on. Each poll is one indexed lookup plus at most one
throttled write. The setup guide tells the vendor to set a 5-second poll
interval (not lower). The plan must confirm this volume fits printkit's
Vercel plan limits before the Star driver ships.

## Connector: `vendor_cloud`

### Driver: `feie`

- **API host:** Feie's Asia-Pacific station, `https://api.jp.feieyun.com/Api/Open/`.
- **Auth:** Merqo holds one Feie developer account. `FEIE_USER` and
  `FEIE_UKEY` are server-only env vars. Each request is signed with
  `sig = sha1(user + ukey + stime)`.
- **Register:** the setup form asks for the printer's SN and KEY (printed
  on the device). printkit calls `Open_printerAddlist` with
  `SN#KEY#<display name>`, then `Open_queryPrinterStatus`. Success stores
  the SN as `device_ref`; the KEY is discarded.
- **Remove:** deleting the printer calls `Open_printerDelList`.
- **Send:** `Open_printLabelMsg` with `sn`, `content` (the markup
  translation of the layout, under Feie's 5000-byte limit), `times=1`.
  Response `data` (Feie's order id) is stored as `print_jobs.driver_ref`.
- **Status:** `Open_queryOrderState` and `Open_queryPrinterStatus`, used by
  the sweep and by health reads.
- **Callback:** Feie POSTs print results to a callback URL configured once
  in the Feie developer console, form-encoded, signed with
  SHA256withRSA. New route `/api/feie/callback` verifies the signature
  with Feie's public key (`FEIE_CALLBACK_PUBLIC_KEY`, server-only env var),
  looks up the job by `driver_ref`, and transitions it. An unsigned or
  badly signed request gets `401` and changes nothing.

Rate limits are not documented by Feie. The plan adds a per-request
timeout (5 seconds) and treats a timeout as `driver_error`.

## Connector: `bridge`

One driver (`niimbot`, via `@mmote/niimbluelib`) and two transports. The
helper-device requirement is the defining cost of this connector and is
stated everywhere a vendor can choose it.

### Transport A: Android phone (exists, changed)

Unchanged: Bridge mode page, Web Bluetooth pairing from a user gesture,
Screen Wake Lock, `visibilitychange` resubscribe, Realtime
`postgres_changes` job delivery.

Changed:

- Job image comes from `GET /api/bridge/jobs/[id]/label.png` (vendor
  session auth, RLS-scoped read of the job) instead of in-browser drawing.
- Presence is replaced by the 20-second heartbeat server action.
- Setting up a Bluetooth printer creates its `printers` row
  (`catalog_id='niimbot-b1'`, `device_ref=null`).
- The Android bridge claims each job through `claim_job(location, job_id)`
  (via a server action) before printing, so it follows the same claim and
  timeout rules as the pull connectors. A Realtime event is only a hint to
  claim now; the claim decides. When Bridge mode starts, it also claims
  any job still `queued` and not expired for its location, so jobs created
  while it was off still print.

### Transport B: Raspberry Pi agent (new)

A small Node program that lives in this repo under `bridge-agent/`
(printkit-only code, per printkit's "no shared print library" rule). It is
a printkit client, not a CloudPRNT client.

- **Runtime:** Raspberry Pi 4 or newer (Pi 3B+ allowed if it passes the
  hardware gate), Raspberry Pi OS Lite 64-bit, Node 24, built-in Bluetooth.
- **Printing:** `@mmote/niimblue-node` (BLE via `noble`), which wraps the
  same `niimbluelib` protocol code the Android bridge uses. It is tested on
  Windows and macOS upstream, not on Linux or Pi, so Pi support is
  unverified until the hardware gate.
- **Pairing:** in printkit, the vendor adds a Bluetooth printer, chooses
  "Raspberry Pi" as the helper device, and gets an 8-character pairing code
  valid for 10 minutes. On the Pi: `printkit-bridge pair <code>`. The agent
  calls `POST /api/v1/bridge-agent/pair` with the code and gets a long-lived
  agent token (stored on the Pi, file mode `600`; hash stored in
  `device_credentials.kind='bridge_agent_token'`). Then
  `printkit-bridge scan` lists nearby NIIMBOT printers and
  `printkit-bridge use <name>` saves the choice.
- **Run loop:** `GET /api/v1/bridge-agent/next-job` (bearer agent token)
  every 3 seconds. The server sweeps, updates `last_seen_at`, claims one
  job, and returns its id (or `204` when there is none). The agent downloads
  `GET /api/v1/bridge-agent/jobs/[id]/label.png` with the same agent token
  (served only for a job claimed by that agent's own printer), prints, and
  reports `POST /api/v1/bridge-agent/jobs/[id]/result`.
  Bluetooth reconnect with backoff on disconnect.
- **Service:** installed as a `systemd` unit that starts on boot and
  restarts on crash.
- **Distribution:** a versioned tarball attached to printkit's GitHub
  releases, installed by a documented script the vendor downloads and runs
  after reading it (no `curl | bash` one-liner in the guide). The plan
  confirms the release channel works for a private repo, or moves
  distribution to a public release-only repo.
- **Unpair:** deleting the printer, or rotating its credential in
  printkit, revokes the agent token. The agent logs "unpaired" and stops
  polling.

## Virtual printer (dev and preview only)

A catalog entry (`virtual`) on the `cloud_poll` connector, using the real
`star-cloudprnt` driver, whose "printer" is a browser page,
`/dashboard/dev/virtual-printer`, that polls the same `/api/cloudprnt/[token]`
route with the Star-shaped protocol, shows each received PNG on screen,
and confirms it. It exercises the real endpoint, claim, confirmation,
health, and qkit callback path end to end with no hardware, which is what
makes "build before buying" testable. Hidden and route-blocked when
`VERCEL_ENV === "production"`.

## Vendor UI

All new vendor UI in printkit, built with `@merqo/ui` components and
printkit's existing tokens.

### Printers page

`/dashboard/printers` replaces `/dashboard/bridge` as the main entry. One
row per print location: printer name, connector label, live health
(online / offline / not set up, with "last seen" time), and actions (test
print, settings, remove). "Add printer" on a location without one opens
the picker. `/dashboard/bridge` stays as the Android Bridge mode screen,
reached from a Bluetooth printer's row.

### Printer picker

`/dashboard/printers/new?location=<id>`

- **Cards**, one per catalog entry: photo, brand and model, connector
  label, connectivity icons, badges ("Recommended", "Works with iPad
  alone", "Needs a helper device", "Untested with real hardware").
- **Filters** (chips, combinable):
  - Works with iPad alone (on by default)
  - Connection: 4G, WiFi, Bluetooth
  - Label width: fits 40 mm / 50 mm / 60 mm labels
  - Price band: low / mid / high
- **Sort:** Recommended (default: recommended first, then setup effort
  ascending, then verified first), Setup effort, Price band.
- **"i" info buttons** next to every badge, connectivity icon, and filter
  label. They open a popover on tap (not hover-only, since vendors use
  iPads) with one or two plain sentences. Initial copy:
  - Works with iPad alone: "This printer connects to the internet itself.
    No extra phone or computer needed."
  - 4G: "Has its own SIM card slot. Prints without WiFi, good for events
    and outdoor stalls. Needs a data SIM."
  - WiFi: "Needs a WiFi network or your phone's hotspot where you set up."
  - Needs a helper device: "Bluetooth printers can't connect to the
    internet. An Android phone or a Raspberry Pi must stay on next to the
    printer to pass jobs to it."
  - Untested with real hardware: "Built to the maker's published spec but
    not yet tested by Merqo on a real unit."
  - Setup effort: "1 = plug in and go, 3 = needs extra devices and setup."
- **Bluetooth cards** carry a "Not recommended: most setup" badge and link
  to the Bluetooth guide before the vendor can continue.
- The page must work at iPad portrait width and phone width, with no
  horizontal scroll.

### Setup wizards (one per connector)

Each ends with a **Test print** that must succeed, or be explicitly
skipped, before the wizard closes.

- **`cloud_poll`:** shows the printer's unique URL once, with a copy button
  and model-specific steps for entering it in the printer's own web
  settings and setting the poll interval. Then waits live: "Waiting for
  your printer to connect…" turns into "Connected" on the first poll.
- **`vendor_cloud`:** form for SN and KEY with a photo of where they are
  printed on the device, plus "insert a data SIM" or "join WiFi" steps
  depending on connectivity. Submit registers with the maker's cloud and
  shows online/offline. If the maker's cloud rejects the printer (wrong
  KEY, or still bound to another platform's account), the wizard shows the
  maker's reason and how to unbind it, and saves nothing.
- **`bridge`:** choose helper device (Android phone or Raspberry Pi). Android
  continues to the existing Bridge mode flow. Pi shows the pairing code with
  a countdown and links to the Pi section of the guide.

### Bluetooth guide

Public page `/guides/bluetooth-printers` (outside `/dashboard`, so qkit
and support can link to it directly). Structure:

1. **Top banner:** "We don't recommend this setup. Bluetooth printers need
   a second device that stays on next to the printer all day. If you're
   choosing a new printer, pick one that works with an iPad alone."
2. Why a helper device is needed (three sentences, no jargon).
3. **Android phone:** requirements (Android 10+, Chrome), keep-awake and
   Battery Saver settings, step-by-step Bridge mode pairing with
   screenshots.
4. **Raspberry Pi:** shopping list, flashing Raspberry Pi OS Lite, enabling
   Bluetooth, downloading and running the install script, pairing code,
   `scan` and `use`, checking the service is running.
5. **FAQ / troubleshooting:** printer not found, printed nothing,
   bridge shows offline, labels print blank or rotated, how to move the
   printer to another booth, how to unpair.

## qkit changes (separate qkit plan)

Small, and in the qkit repo:

1. `printing-section.tsx` shows the booth's printer (name, connector label,
   online/offline/not set up, last seen) from printkit's new
   `GET /api/v1/print-locations/status`, via a new `getPrinterStatus` in
   `src/lib/printkit/client.ts`. Fetched server-side on page load, then
   refreshed every 30 seconds from the client through a qkit route handler
   (the bearer secret never reaches the browser).
2. `use-printer-presence.ts` and qkit's Presence subscription are removed.
3. The "Choose the printer for this booth" link goes to printkit's printer
   picker for that booth instead of the bridge page.
4. Copy for the Printing section says which printers work with an iPad
   alone and links to the Bluetooth guide.

qkit's job creation call and its `print-status` callback route are
unchanged.

## Security

- Every new device-facing route authenticates with a per-printer secret
  (CloudPRNT URL token, agent token) stored only as a SHA-256 hash, and
  resolves the printer and vendor from that secret alone. No route trusts a
  vendor id or printer id sent by the device.
- Every job and printer lookup made on behalf of a device is scoped to that
  device's printer and location.
- Feie credentials and callback public key are server-only env vars, never
  `NEXT_PUBLIC_*`. The Feie KEY a vendor types is used once and never stored.
- Feie callbacks are rejected unless the RSA signature verifies.
- The PNG route for the Android bridge uses the vendor session, and RLS on
  `print_jobs` decides access. The Pi agent's PNG route serves only jobs
  claimed by that agent's own printer.
- `admin_audit` entries (existing table) for: printer added, removed,
  credential rotated, Pi paired, CloudPRNT MAC mismatch, Feie register
  failure.
- New tables get pgTAP RLS tests: vendors can read only their own
  `printers`; nobody except service-role can read `device_credentials` or
  `bridge_pairing_codes`.

## Testing

**Driver conformance suites.** Each connector has one shared test suite
that every driver in it must pass (for example: "claims only one job
under concurrent polls", "confirmation with an error code marks failed",
"unknown token is 401", "expired job is never delivered"). A new driver is
added by running it through its connector's suite, which is what keeps
drivers interchangeable.

**Mock printers.**

- `cloud_poll`: a test harness that plays a Star CloudPRNT printer against
  the route handlers (poll → GET → DELETE), including error codes, MAC
  changes, and a printer that never confirms.
- `vendor_cloud`: a fake Feie API (fetch-level mock) covering register,
  send, status, timeouts, and malformed responses, plus callback fixtures
  signed with a test RSA key pair.
- `bridge`: a fake BLE transport for the Pi agent's run loop (disconnect,
  reconnect, print failure); the Android bridge's existing mocked-Bluetooth
  tests are updated for the PNG download and claim.

**Rendering.** Layout builder unit tests (pure). Rasterizer snapshot tests
on the PNG output. Feie markup translation tests, including the
5000-byte limit and CJK text.

**End to end.** The virtual printer drives one full order: qkit-shaped
`POST /api/v1/print-jobs` → poll → GET → DELETE → `printed` → kit callback.

**Hardware gate (per driver, manual, before `hardwareVerified: true`).**
Test print, then 20 real orders in a row, one offline-and-recover cycle,
one reprint, one expired job. Recorded in the driver's README with date,
model, and firmware. Order: whichever printer is bought first, then the
others as they are bought.

## Rollout phases (one implementation plan each)

1. **Core:** schema (`printers`, `device_credentials`,
   `bridge_pairing_codes`, `print_jobs` columns), catalog, layout builder,
   rasterizer, driver interfaces, `dispatchJob`, `claim_job`,
   `sweepLocation`, health, status API, virtual printer.
2. **`cloud_poll` + `star-cloudprnt` driver.**
3. **`vendor_cloud` + `feie` driver.**
4. **`bridge`:** Android transport changes, then the Pi agent.
5. **Vendor UI:** printers page, picker, setup wizards, Bluetooth guide.
6. **qkit:** printer status via the new API, Presence removal, links and
   copy.

Phase 1 must land first. Phases 2 to 4 are independent of each other.
Phase 5 needs phase 1 and whichever connectors are ready (a connector with
no finished driver is not shown in the picker). Phase 6 needs phase 1's
status API.

## Open items (resolve in the plans, none change this design)

1. **Supabase project topology.** printkit's `AGENTS.md` says printkit
   shares one Supabase project with qkit; `docs/DEPLOY.md` says it has its
   own. Confirm which is true in production and fix the wrong doc. This
   design no longer depends on the answer: qkit reads printer status over
   HTTP, not through a shared Realtime channel.
2. **Deployment state.** Confirm printkit is deployed to production and
   that qkit's `PRINTKIT_KIT_SECRET`, `NEXT_PUBLIC_PRINTKIT_URL`, and
   `PRINTKIT_CALLBACK_SECRET` are set, before any hardware test.
3. **Vercel plan limits** for the CloudPRNT poll volume (see "Request
   volume").
4. **Feie in Singapore:** printer price, shipping, whether the FP-N20H's 4G
   bands work on Singapore networks, and data-SIM cost. Ask the seller
   before buying the test unit. The Xprinter XP-T271U (Xpyun cloud) is the
   backup candidate; its driver is not built until needed.
5. **Feie callback key.** Where Feie publishes the RSA public key for
   callback verification, and whether the Asia-Pacific station supports
   callbacks the same way.
6. **`@mmote/niimblue-node` licence** and whether its programmatic API is
   stable enough to depend on, or whether the agent should call
   `niimbluelib` directly with a `noble` transport.
7. **Pi agent distribution channel** (private-repo release vs a public
   release-only repo).
8. **Bundled font** choice for the rasterizer (must cover the scripts
   vendors use in customer names, at least Latin and CJK).

## Sources

- Feie API (Asia-Pacific station): http://www.feieyun.com/open/apidoc-en.html, https://feieyun.com/open/AsiaPacific-en.html
- Feie FP-N20H: https://www.feieyun.com/product_detail-N20H.html
- Star CloudPRNT poll response: https://star-m.jp/products/s_print/sdk/StarCloudPRNT/manual/en/protocol-reference/http-method-reference/server-polling-post/json-response.html
- Star mC-Label2: https://star-emea.com/products/mc-label2/
- niimblue-node: https://github.com/MultiMote/niimblue-node
- Xprinter XP-T271U: https://www.xprinter.net/product/453.html

## Parent

[printkit v0.1 — Design](2026-08-21-printkit-v0.1-design.md)
