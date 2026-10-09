export const MAX_REQUEST_BODY_BYTES = 16 * 1024;

export class RequestBodyError extends Error {
  constructor(public readonly status: 400 | 413) {
    super(status === 413 ? "Request body too large" : "Invalid request");
  }
}

async function validateDeclaredSize(request: Request, maxBytes: number) {
  const declared = request.headers.get("content-length");
  if (declared !== null) {
    if (!/^\d+$/.test(declared)) throw new RequestBodyError(400);
    if (Number(declared) > maxBytes) {
      await request.body?.cancel().catch(() => undefined);
      throw new RequestBodyError(413);
    }
  }
}

export async function readBoundedBody(
  request: Request,
  maxBytes = MAX_REQUEST_BODY_BYTES,
): Promise<Uint8Array> {
  await validateDeclaredSize(request, maxBytes);
  if (!request.body) throw new RequestBodyError(400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value.byteLength === 0) continue;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new RequestBodyError(413);
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  } catch (error) {
    if (error instanceof RequestBodyError) throw error;
    throw new RequestBodyError(400);
  } finally {
    reader.releaseLock();
  }
}
