# bridge-agent

## Purpose

The endpoints a Raspberry Pi print agent talks to. The Pi cannot hold a
vendor session, so it carries its own device token instead, minted once
from a pairing code the vendor reads off their screen.

Every route here resolves the printer from that token alone. An agent never
names a printer, booth or vendor, so a stolen token reaches exactly one
printer, and revoking the credential stops that agent immediately.

## Contents

- `pair/route.ts` — `POST /api/v1/bridge-agent/pair`. Trades a pairing code
  for an agent token. The code is single use and expires in ten minutes, so
  a code left in a screenshot is not a standing key to the printer.
- `next-job/route.ts` — `GET /api/v1/bridge-agent/next-job`. One request
  does everything a pull needs: authenticate, run the booth's lazy sweep,
  record the printer as alive, and claim at most one job through
  `claim_job`. `204` means nothing is waiting, which is the usual answer.
- `jobs/[id]/label/route.ts` — the label bytes, but only for a job at this
  agent's own booth that it has already claimed. Anything else is a 404, so
  a token cannot be used to read another booth's labels and the customer
  names on them.
- `jobs/[id]/result/route.ts` — what the agent saw, scoped the same way: an
  agent cannot report an outcome for another printer's job and, through the
  kit callback, tell a different vendor their label printed.

The agent program itself lives in `bridge-agent/` at the repo root.

## Parent

[v1](../README.md)
