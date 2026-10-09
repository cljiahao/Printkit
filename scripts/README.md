# Operator scripts

create-kit-key.mjs creates or rotates an inbound kit token and stores only its SHA256 hash. The new inbound token is intentionally printed once for transfer to the calling kit's secret store. Do not capture this command's output in shared logs.

To rotate only the inbound token, run node scripts/create-kit-key.mjs qkit. Existing callback fields stay unchanged.

To configure a callback, pipe the callback secret from your secret manager into node scripts/create-kit-key.mjs qkit --callback-url https://qkit.merqo.io/api/printkit/print-status --callback-secret-stdin. Callback secrets must never be supplied as command arguments: shell history and process listings can expose them. The callback URL requires HTTPS without embedded credentials. The bounded stdin reader rejects terminal input to avoid echoing secrets.

The operator supplies Supabase credentials through the shell environment; these scripts do not load dotenv files. create-kit-key-input.mjs contains argument and input validation. Regression tests run with node --test test/operators/*.test.mjs using synthetic values only.

[Parent](../README.md)
