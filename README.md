# printkit

Hardware print connector for Merqo vendors. v0.1 ships label printing via
the NIIMBOT B1; architecture is job-type-agnostic for later job types
(receipt, kitchen-ticket, shelf-label, invoice). Internal-only — reached
through a vendor's existing sibling-kit relationship (qkit today), no
public marketing site or pricing; `/` redirects straight to `/dashboard`.

See `AGENTS.md` for the full stack, commands, and data model.

Design: `docs/superpowers/specs/2026-08-21-printkit-v0.1-design.md`
