// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const reprintJobMock = vi.fn().mockResolvedValue({ success: true });
vi.mock("./actions", () => ({
  reprintJob: (...args: unknown[]) => reprintJobMock(...args),
}));

import { ReprintButton } from "./reprint-button";

describe("ReprintButton", () => {
  it("calls reprintJob with the job id when clicked", async () => {
    render(<ReprintButton jobId="job-1" />);
    fireEvent.click(screen.getByRole("button", { name: /reprint/i }));
    await waitFor(() => expect(reprintJobMock).toHaveBeenCalledWith("job-1"));
  });
});
