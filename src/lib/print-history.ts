import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";
import type { PrintJob } from "@/lib/print-jobs-list";

const cursorSchema = z.object({
  createdAt: z.string().datetime({ offset: true }),
  id: z
    .string()
    .uuid()
    .transform((value) => value.toLowerCase()),
});
type Cursor = z.infer<typeof cursorSchema>;
export function decodeHistoryCursor(value?: string): Cursor | null {
  if (!value) return null;
  if (value.length > 512) throw new Error("Invalid history cursor");
  try {
    return cursorSchema.parse(
      JSON.parse(Buffer.from(value, "base64url").toString("utf8")),
    );
  } catch {
    throw new Error("Invalid history cursor");
  }
}
function encodeCursor(row: PrintJob): string {
  return Buffer.from(
    JSON.stringify(
      cursorSchema.parse({ createdAt: row.created_at, id: row.id }),
    ),
  ).toString("base64url");
}

export async function listPrintHistoryPage(
  supabase: SupabaseClient<Database, "printkit">,
  vendorId: string,
  options: { unrouted?: boolean; cursor?: string } = {},
): Promise<{ jobs: PrintJob[]; nextCursor: string | null }> {
  let cursor = decodeHistoryCursor(options.cursor);
  const rows: PrintJob[] = [];
  while (rows.length < 51) {
    let query = supabase
      .from("print_jobs")
      .select("*, print_locations(label)")
      .eq("vendor_id", vendorId);
    if (options.unrouted)
      query = query.is("location_id", null).eq("status", "queued");
    if (cursor)
      query = query.or(
        "created_at.lt." +
          cursor.createdAt +
          ",and(created_at.eq." +
          cursor.createdAt +
          ",id.lt." +
          cursor.id +
          ")",
      );
    const { data, error } = await query
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(51 - rows.length);
    if (error)
      throw new Error("Could not load print history", { cause: error });
    const batch = (data ?? []) as PrintJob[];
    if (batch.length === 0) break;
    const last = batch[batch.length - 1];
    const next = cursorSchema.parse({
      createdAt: last.created_at,
      id: last.id,
    });
    if (
      cursor &&
      (Date.parse(next.createdAt) > Date.parse(cursor.createdAt) ||
        (Date.parse(next.createdAt) === Date.parse(cursor.createdAt) &&
          next.id >= cursor.id))
    ) {
      throw new Error("Print history cursor did not advance");
    }
    rows.push(...batch);
    cursor = next;
  }
  const jobs = rows.slice(0, 50);
  return {
    jobs,
    nextCursor: rows.length > 50 ? encodeCursor(jobs[jobs.length - 1]) : null,
  };
}
