import { readBoundedBody, RequestBodyError } from "./bounded-body";
export { MAX_REQUEST_BODY_BYTES, RequestBodyError } from "./bounded-body";

export async function readBoundedJson(
  request: Request,
  maxBytes?: number,
): Promise<unknown> {
  const bytes = await readBoundedBody(request, maxBytes);
  try {
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    ) as unknown;
  } catch {
    throw new RequestBodyError(400);
  }
}

export async function readBoundedForm(request: Request): Promise<FormData> {
  const bytes = await readBoundedBody(request);
  try {
    return await new Response(new Uint8Array(bytes), {
      headers: { "content-type": request.headers.get("content-type") ?? "" },
    }).formData();
  } catch {
    throw new RequestBodyError(400);
  }
}
