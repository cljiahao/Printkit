export type NextJob = { jobId: string } | null;

export type PrintResult = "printed" | "failed";

/** printkit mints agent tokens as 32 random bytes in base64url (43 chars). */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,128}$/;
const JOB_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The origin every request goes to, checked because it comes from a config
 * file or an environment variable: HTTPS only, except plain HTTP to this
 * machine for local development, so the agent token never crosses a
 * network in the clear.
 */
export function printkitOrigin(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`Not a valid printkit address: ${JSON.stringify(raw)}`);
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) {
    throw new Error("The printkit address must start with https://");
  }
  return url.origin;
}

function checkedToken(token: unknown): string {
  if (typeof token !== "string" || !TOKEN_PATTERN.test(token)) {
    throw new Error("The agent token is not in the expected format.");
  }
  return token;
}

export class UnauthorizedError extends Error {
  constructor() {
    super("This agent is no longer paired with a printer.");
    this.name = "UnauthorizedError";
  }
}

/**
 * The agent's whole conversation with printkit: poll, download, report.
 * Every call carries the agent token, which is the only thing that decides
 * which printer this agent can reach.
 */
export class PrintkitClient {
  private readonly origin: string;
  private readonly token: string;

  constructor(baseUrl: string, token: string) {
    this.origin = printkitOrigin(baseUrl);
    this.token = checkedToken(token);
  }

  private url(path: string): string {
    return `${this.origin}${path}`;
  }

  private jobUrl(jobId: string, action: "label" | "result"): string {
    return this.url(
      `/api/v1/bridge-agent/jobs/${encodeURIComponent(jobId)}/${action}`,
    );
  }

  private headers(): Record<string, string> {
    return { authorization: `Bearer ${this.token}` };
  }

  /**
   * Trades a vendor's pairing code for a long-lived agent token. The only
   * call that does not need a token already.
   */
  static async pair(baseUrl: string, code: string): Promise<string> {
    const response = await fetch(
      `${printkitOrigin(baseUrl)}/api/v1/bridge-agent/pair`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      },
    );

    if (!response.ok) {
      throw new Error(
        response.status === 401
          ? "That pairing code is not valid any more. Make a new one in printkit."
          : `Pairing failed (${response.status})`,
      );
    }

    const body = (await response.json()) as { token?: unknown };
    if (!body.token) throw new Error("Pairing returned no token.");
    return checkedToken(body.token);
  }

  async nextJob(): Promise<NextJob> {
    const response = await fetch(this.url("/api/v1/bridge-agent/next-job"), {
      headers: this.headers(),
    });

    if (response.status === 204) return null;
    if (response.status === 401) throw new UnauthorizedError();
    if (!response.ok) throw new Error(`Poll failed (${response.status})`);

    const body = (await response.json()) as { job_id?: unknown };
    if (!body.job_id) return null;
    if (typeof body.job_id !== "string" || !JOB_ID_PATTERN.test(body.job_id)) {
      throw new Error("printkit returned a job id in an unexpected format.");
    }
    return { jobId: body.job_id };
  }

  async fetchLabel(jobId: string): Promise<Uint8Array> {
    const response = await fetch(this.jobUrl(jobId, "label"), {
      headers: this.headers(),
    });

    if (response.status === 401) throw new UnauthorizedError();
    if (!response.ok) {
      throw new Error(`Label download failed (${response.status})`);
    }
    return new Uint8Array(await response.arrayBuffer());
  }

  async reportResult(jobId: string, result: PrintResult): Promise<void> {
    const response = await fetch(this.jobUrl(jobId, "result"), {
      method: "POST",
      headers: { ...this.headers(), "content-type": "application/json" },
      body: JSON.stringify({ result }),
    });

    if (response.status === 401) throw new UnauthorizedError();
    if (!response.ok) {
      throw new Error(`Reporting the result failed (${response.status})`);
    }
  }
}
