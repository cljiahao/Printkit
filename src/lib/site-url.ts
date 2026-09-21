/**
 * The absolute origin a device outside the browser can reach printkit on:
 * a CloudPRNT printer polling its URL, or Feie posting a print result.
 * Relative URLs are useless to both, so this answers null rather than ""
 * when nothing is configured, and callers decide what that means.
 *
 * PRINTKIT_PUBLIC_URL wins when set. Otherwise Vercel's own system
 * variables supply the host: the production domain in production, the
 * deployment's own host anywhere else.
 */
export function publicSiteUrl(): string | null {
  const configured = process.env.PRINTKIT_PUBLIC_URL?.trim();
  if (configured) {
    return configured.endsWith("/") ? configured.slice(0, -1) : configured;
  }

  const host =
    process.env.VERCEL_ENV === "production"
      ? process.env.VERCEL_PROJECT_PRODUCTION_URL
      : process.env.VERCEL_URL;
  return host ? `https://${host}` : null;
}
