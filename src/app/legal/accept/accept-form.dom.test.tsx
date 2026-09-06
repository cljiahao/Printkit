// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AcceptForm } from "./accept-form";

vi.mock("./actions", () => ({ acceptLegalTerms: vi.fn() }));

describe("AcceptForm", () => {
  it("carries the redirect target in a hidden field and disables submit until agreed", async () => {
    render(<AcceptForm next="/admin" />);
    const nextField = document.querySelector('input[name="next"]');
    expect(nextField).toHaveValue("/admin");
    const submit = screen.getByRole("button", { name: "Continue" });
    expect(submit).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/your name/i), "Jane Vendor");
    await userEvent.click(screen.getByRole("checkbox"));
    expect(submit).toBeEnabled();
  });
});
