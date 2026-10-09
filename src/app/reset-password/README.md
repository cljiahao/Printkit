# Password recovery

The callback exchanges the recovery code, then redirects here. The form validates the authenticated user before showing password inputs, validates matching passwords with an eight-character floor in Zod, and calls Supabase updateUser. Supabase owns the authoritative password policy. Missing, failed, expired and rejected requests render a retry/sign-in path; no service-role client is used.
