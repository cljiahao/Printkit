# Printer connectors: how to test the three types

Companion to `docs/superpowers/specs/2026-09-20-printer-connectors-design.md`.
Every catalog entry stays `hardwareVerified: false` until its hardware gate
below passes on a real device.

## Before any hardware

1. `pnpm check && pnpm test` (unit + jsdom; all three connectors are covered
   against fakes).
2. `supabase start`, then `supabase test db`: applies migration `0008` and
   runs the pgTAP RLS suite, including the `printers`/`device_credentials`
   isolation assertions. CI's `db` job runs the same on every PR.
3. Deploy a preview with `PRINTKIT_PUBLIC_URL` set to an origin a printer can
   reach. Vercel preview deployments sit behind Vercel's deployment
   protection by default, which a printer cannot pass: use production, a
   protection-bypassed preview, or a tunnel to `pnpm dev`.

## Type 1: cloud_poll (Star CloudPRNT)

What it is: the printer polls `POST /api/cloudprnt/<token>` every few
seconds, fetches the label PNG with `GET`, confirms with `DELETE`.

**Without hardware (do this first):** `/dashboard/dev/virtual-printer` (dev
builds only) runs the real CloudPRNT exchange from a browser tab. Create a
"Virtual printer" on a booth, open the page with its URL, place a qkit order,
and watch the label appear and the job turn `printed`.

**Hardware gate: Star mC-Label2, X4 model (WiFi built in).**

1. printkit: Printers, add, Star mC-Label2. Copy the printer URL.
2. On the printer's web config page (its IP, from the self-test print): enable
   CloudPRNT, paste the URL as the server URL, poll interval 5 s, save and
   restart.
3. Within 60 s the booth shows "online" in printkit and in qkit's booth
   settings.
4. Place an order in qkit. Pass: one label prints within ~10 s showing
   `#<order number>` and the name, and the job shows `printed`.
5. Negative checks:
   - Open the printer cover and place an order. The job should end `failed`
     (Star reports a non-2xx code), not `printed`.
   - Unplug the printer and place an order. The booth goes offline within
     ~60 s, and the job expires after 30 minutes rather than printing hours
     later.
   - Reprint from History. It prints exactly once.
6. Record the firmware version. If a job never leaves `sent`, check the logs
   for a token-less `DELETE`: that is old firmware, and the fallback should
   still settle it.

## Type 2: vendor_cloud (Feie WiFi or 4G)

What it is: printkit pushes the label to Feie's cloud
(`api.jp.feieyun.com`), Feie delivers it over the printer's WiFi (N20W)
or its own SIM (N20H), and
posts the result to `/api/feie/callback`.

**One-time platform setup (Merqo, not the vendor):**

1. Register a Feie developer account on the Asia-Pacific station. Set
   `FEIE_USER` / `FEIE_UKEY`.
2. Download Feie's callback public key from the open-platform docs ("打印状态
   回调") and set `FEIE_CALLBACK_PUBLIC_KEY`.
3. Whitelist `<PRINTKIT_PUBLIC_URL>/api/feie/callback` in Feie's developer
   console.

**Without hardware:** unit tests cover signing, refusals, Chinese status
strings and callback verification. Feie's own "test printer" in the
developer console, if the account offers one, exercises the API end to end.

**Hardware gate: Feie FP-N20W (WiFi, the recommended cheap option) and/or
FP-N20H (4G).** Both use the same driver; the N20W skips the SIM steps and
joins WiFi instead.

1. Confirm with the seller that the unit is the label model (not receipt).
   For the N20H only: it takes a Singapore SIM and supports 4G bands on
   Singapore networks. For the N20W: it joins 2.4 GHz WiFi, which most phone
   hotspots offer.
2. printkit: Printers, add, Feie. Enter the SN and KEY from the sticker.
   Pass: "connected". A wrong KEY shows "The printer rejected that KEY".
3. N20W: join it to WiFi with Feie's setup steps. N20H: insert the SIM.
   Power on. The booth shows online.
4. Place an order. Pass: the label prints, the job turns `printed` within
   seconds (callback), and the Chinese name test (`陈明`) prints correctly and
   centred.
5. Negative checks:
   - Turn off the printer and place an order. The job stays `sent`. Turn it
     back on within 30 minutes. It should print, and the sweep or callback
     should settle the job.
   - Block the callback (unset the key). Jobs should still settle within a
     few minutes through the sweep's status query.
6. Measure the label layout: check the `<SIZE>`/`<GAP>` values match the
   loaded roll, and adjust the default label size if not.

## Type 3: bridge (Bluetooth, not recommended)

What it is: a helper device beside the printer claims jobs from printkit,
downloads the PNG and prints over Bluetooth. Either an Android phone running
Bridge mode in Chrome, or a Raspberry Pi running `bridge-agent/`.

**Android (NIIMBOT B1 + any Android phone with Chrome):**

1. On the phone, sign in to printkit, open Bridge, pair the B1.
2. Test print. Pass: a sample label.
3. Leave Bridge open and place an order from the iPad. Pass: it prints, and
   the booth shows online. Lock the phone for 2 minutes. The booth should go
   offline (the heartbeat stops), which is the expected, documented
   weakness.

**Raspberry Pi (Pi 4+, Raspberry Pi OS 64-bit, Node 24):**

1. printkit: Printers, add, NIIMBOT B1, Raspberry Pi. Note the pairing code.
2. Follow the guide: install Node 24 and git, `git clone` the repo,
   `cd Printkit/bridge-agent`, `sudo ./install.sh`. Pass: the install
   finishes, including building the Bluetooth library.
3. `printkit-bridge pair <code>`, then `printkit-bridge use "B1-XXXX" B1`,
   then `sudo systemctl start printkit-bridge@$USER`.
4. `journalctl -u printkit-bridge@$USER -f` shows "Connected to ...". Place
   an order. Pass: it prints, and the job shows `printed`.
5. Negative checks:
   - Turn the printer off and place an order. The job should end `failed`,
     and the next job after the printer is back should print.
   - Remove the printer in printkit. The agent should stop polling
     (unauthorised) rather than retry forever.
   - Reboot the Pi. It should come back and print without any command.

## What "done" looks like

A connector's catalog entry flips to `hardwareVerified: true` only after its
gate passes, including the negative checks. Record the printer's firmware,
the date and the tester in the commit that flips the flag.
