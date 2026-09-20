import { hashDeviceToken } from "@/lib/device-credentials";
import { getPrinterByTokenHash, type PrinterRow } from "@/lib/printers";

/**
 * Resolves a Raspberry Pi agent's bearer token to its printer. The token is
 * the whole credential: an agent never names a printer, booth or vendor, so
 * a stolen token reaches exactly one printer and nothing else. Revoking the
 * credential (or deleting the printer) stops that agent immediately.
 */
export async function resolveAgent(
  request: Request,
): Promise<PrinterRow | null> {
  const header = request.headers.get("authorization") ?? "";
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return null;

  const token = header.slice(prefix.length).trim();
  if (!token) return null;

  const printer = await getPrinterByTokenHash(hashDeviceToken(token));
  if (!printer) return null;
  return printer.connector === "bridge" ? printer : null;
}
