import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import Classify from "./Classify";

vi.mock("../../api/client", () => ({
  classifyText: vi.fn(),
}));

import { classifyText } from "../../api/client";
const mockClassify = vi.mocked(classifyText);

describe("Classify", () => {
  it("disables button when input is empty", () => {
    render(<Classify />);
    expect(screen.getByRole("button", { name: /classify/i })).toBeDisabled();
  });

  it("enables button when text is entered", async () => {
    render(<Classify />);
    await userEvent.type(screen.getByRole("textbox"), "some text");
    expect(screen.getByRole("button", { name: /classify/i })).toBeEnabled();
  });

  it("shows loading state during classification", async () => {
    mockClassify.mockImplementation(() => new Promise(() => {})); // never resolves
    render(<Classify />);

    await userEvent.type(screen.getByRole("textbox"), "test input");
    await userEvent.click(screen.getByRole("button", { name: /classify/i }));

    expect(screen.getByRole("button", { name: /classifying/i })).toBeDisabled();
  });

  it("displays result on success", async () => {
    mockClassify.mockResolvedValue({
      source: "service-a",
      classification: { category: "incident", confidence: 0.95, model: "mock" },
    });
    render(<Classify />);

    await userEvent.type(screen.getByRole("textbox"), "server is down");
    await userEvent.click(screen.getByRole("button", { name: /classify/i }));

    await waitFor(() => {
      expect(screen.getByText("incident")).toBeInTheDocument();
      expect(screen.getByText("95.0%")).toBeInTheDocument();
      expect(screen.getByText("mock")).toBeInTheDocument();
    });
  });

  it("displays error on failure", async () => {
    mockClassify.mockRejectedValue(new Error("Classification failed: 503"));
    render(<Classify />);

    await userEvent.type(screen.getByRole("textbox"), "some text");
    await userEvent.click(screen.getByRole("button", { name: /classify/i }));

    await waitFor(() => {
      expect(screen.getByText("Classification failed: 503")).toBeInTheDocument();
    });
  });

  it("populates input when example chip is clicked", async () => {
    render(<Classify />);
    const chip = screen.getAllByRole("button").find((b) => b.classList.contains("example-chip"))!;
    await userEvent.click(chip);

    expect(screen.getByRole("textbox")).not.toHaveValue("");
  });

  it("clears result when input is emptied", async () => {
    mockClassify.mockResolvedValue({
      source: "service-a",
      classification: { category: "incident", confidence: 0.9, model: "mock" },
    });
    render(<Classify />);

    await userEvent.type(screen.getByRole("textbox"), "text");
    await userEvent.click(screen.getByRole("button", { name: /classify/i }));
    await waitFor(() => expect(screen.getByText("incident")).toBeInTheDocument());

    await userEvent.clear(screen.getByRole("textbox"));
    expect(screen.queryByText("incident")).not.toBeInTheDocument();
  });
});
