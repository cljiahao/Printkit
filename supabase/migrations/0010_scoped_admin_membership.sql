
-- Membership checks disclose only the caller's own status; server administration may inspect any user.
CREATE OR REPLACE FUNCTION printkit.is_admin(p_uid uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = '' AS $$
  SELECT p_uid IS NOT NULL AND
    (p_uid IS NOT DISTINCT FROM (select auth.uid()) OR (select auth.role()) IS NOT DISTINCT FROM 'service_role') AND
    EXISTS (SELECT 1 FROM printkit.admins WHERE user_id=p_uid);
$$;
REVOKE ALL ON FUNCTION printkit.is_admin(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION printkit.is_admin(uuid) TO authenticated,service_role;
