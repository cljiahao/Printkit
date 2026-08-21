-- One-time copy of existing local feedback rows into the shared
-- merqo.vendor_feedback table (merqo migration 0011). See
-- merqo/docs/superpowers/specs/2026-07-23-cross-kit-vendor-feedback-design.md
--
-- Guarded: paykit's own CI/local `supabase start` builds a fresh Postgres
-- from only paykit's migrations, with no merqo schema at all — the
-- unguarded INSERT hard-failed `supabase start` there (same class of
-- failure qkit's own vendor_profile backfill hit and fixed the same way,
-- see qkit/supabase/migrations/0054_vendor_profile_backfill.sql). Real
-- environments apply merqo's migrations first, so the table exists there
-- and the backfill runs as intended; this only short-circuits when it's
-- genuinely absent.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'merqo' and table_name = 'vendor_feedback'
  ) then
    insert into merqo.vendor_feedback (kit_slug, vendor_id, nps, message, created_at)
    select 'paykit', vendor_id, nps, message, created_at
    from paykit.feedback f
    where not exists (
      select 1 from merqo.vendor_feedback vf
      where vf.kit_slug = 'paykit'
        and vf.vendor_id = f.vendor_id
        and vf.created_at = f.created_at
    );
  end if;
end $$;
