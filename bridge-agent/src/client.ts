export type NextJob = { jobId: string } | null;

export type PrintResult = "printed" | "failed";

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
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
  ) {}

  private url(path: string): string {
    return `${this.baseUrl.replace(/\/$/, "")}${path}`;
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
      `${baseUrl.replace(/\/$/, "")}/api/v1/bridge-agent/pair`,
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

    const body = (await response.json()) as { token?: string };
    if (!body.token) throw new Error("Pairing returned no token.");
    return body.token;
  }

  async nextJob(): Promise<NextJob> {
    const response = await fetch(this.url("/api/v1/bridge-agent/next-job"), {
      headers: this.headers(),
    });

    if (response.status === 204) return null;
    if (response.status === 401) throw new UnauthorizedError();
    if (!response.ok) throw new Error(`Poll failed (${response.status})`);

    const body = (await response.json()) as { job_id?: string };
    return body.job_id ? { jobId: body.job_id } : null;
  }

  async fetchLabel(jobId: string): Promise<Uint8Array> {
    const response = await fetch(
      this.url(`/api/v1/bridge-agent/jobs/${jobId}/label`),
      { headers: this.headers() },
    );

    if (response.status === 401) throw new UnauthorizedError();
    if (!response.ok) {
      throw new Error(`Label download failed (${response.status})`);
    }
    return new Uint8Array(await response.arrayBuffer());
  }

  async reportResult(jobId: string, result: PrintResult): Promise<void> {
    const response = await fetch(
      this.url(`/api/v1/bridge-agent/jobs/${jobId}/result`),
      {
        method: "POST",
        headers: { ...this.headers(), "content-type": "application/json" },
        body: JSON.stringify({ result }),
      },
    );

    if (response.status === 401) throw new UnauthorizedError();
    if (!response.ok) {
      throw new Error(`Reporting the result failed (${response.status})`);
    }
  }
}
