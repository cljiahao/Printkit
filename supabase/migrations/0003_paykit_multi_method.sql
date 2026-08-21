-- Adds the `pointer` payment-method kind (a vendor's own payment link or QR
-- image) alongside the existing `paynow` kind. Additive only — no column
-- drops, no data loss. Existing rows are all implicitly `kind = 'paynow'`
-- via the column default, so no backfill UPDATE is needed.
-- See docs/superpowers/specs/2026-07-22-paykit-multi-method-byo-design.md

alter table paykit.vendor_payment_config
  add column kind text not null default 'paynow' check (kind in ('paynow', 'pointer')),
  add column label text,
  add column url text,
  add column qr_image_url text;

alter table paykit.vendor_payment_config
  alter column payee_name drop not null;

alter table paykit.vendor_payment_config
  drop constraint vendor_payment_config_one_proxy;

alter table paykit.vendor_payment_config
  add constraint vendor_payment_config_kind_shape check (
    (kind = 'paynow' and payee_name is not null
      and ((uen is not null and mobile is null) or (uen is null and mobile is not null))
      and label is null and url is null and qr_image_url is null)
    or
    (kind = 'pointer' and payee_name is null and uen is null and mobile is null
      and label is not null
      and ((url is not null and qr_image_url is null) or (url is null and qr_image_url is not null)))
  );

-- Extend the existing column-scoped grants (see 0001_paykit_core.sql) to
-- cover the new columns. `plan` stays excluded — service-role only.
grant insert (vendor_id, kind, uen, mobile, payee_name, label, url, qr_image_url, verification_method)
  on paykit.vendor_payment_config to authenticated;
grant update (kind, uen, mobile, payee_name, label, url, qr_image_url, verification_method)
  on paykit.vendor_payment_config to authenticated;
