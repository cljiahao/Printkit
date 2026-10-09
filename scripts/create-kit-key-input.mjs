export function parseKeyOptions(args) {
  const [kitSlug, ...rest] = args;
  if (!kitSlug || !/^[a-z][a-z\d_-]{0,31}$/.test(kitSlug))
    throw new Error(
      "Use a lowercase kit slug, followed by optional --callback-url URL --callback-secret-stdin.",
    );
  let callbackUrl;
  let readSecret = false;
  for (let index = 0; index < rest.length; index++) {
    if (rest[index] === "--callback-url" && callbackUrl === undefined) {
      const value = rest[++index];
      let parsed;
      try {
        parsed = new URL(value);
      } catch {
        throw new Error("Callback URL must be an absolute HTTPS endpoint.");
      }
      if (
        parsed.protocol !== "https:" ||
        parsed.username ||
        parsed.password ||
        parsed.hash
      )
        throw new Error(
          "Callback URL must be HTTPS without credentials or a fragment.",
        );
      callbackUrl = parsed.href;
    } else if (rest[index] === "--callback-secret-stdin" && !readSecret)
      readSecret = true;
    else
      throw new Error(
        "Unknown or duplicate option. Secrets are accepted only through standard input, never command arguments.",
      );
  }
  if (Boolean(callbackUrl) !== readSecret)
    throw new Error(
      "Callback configuration requires both --callback-url and --callback-secret-stdin.",
    );
  return { kitSlug, callbackUrl, readSecret };
}

export async function readCallbackSecret(input) {
  if (input.isTTY)
    throw new Error(
      "Pipe the callback secret from your secret manager; interactive input would echo it.",
    );
  const chunks = [];
  let length = 0;
  for await (const chunk of input) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += bytes.length;
    if (length > 4096) throw new Error("Callback secret input is too large.");
    chunks.push(bytes);
  }
  const secret = Buffer.concat(chunks).toString("utf8").trim();
  if (!/^[a-zA-Z\d_-]{32,256}$/.test(secret))
    throw new Error(
      "Callback secret must contain 32 to 256 letters, digits, underscores or hyphens.",
    );
  return secret;
}
