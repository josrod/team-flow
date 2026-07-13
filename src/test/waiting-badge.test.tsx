import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { WaitingBadge } from "@/components/WaitingBadge";
import { LanguageProvider } from "@/context/LanguageContext";

const renderWithLang = (tags: string[] | null | undefined) =>
  render(
    <LanguageProvider>
      <WaitingBadge tags={tags} />
    </LanguageProvider>,
  );

describe("WaitingBadge", () => {
  it("renders the waiting chip when the tag is present", () => {
    renderWithLang(["waiting"]);
    expect(screen.getByText(/waiting|en espera/i)).toBeInTheDocument();
  });

  it("matches case-insensitively and alongside other tags", () => {
    renderWithLang(["Bug", "WAITING", "urgent"]);
    expect(screen.getByText(/waiting|en espera/i)).toBeInTheDocument();
  });

  it("renders nothing when the tag is absent", () => {
    const { container } = renderWithLang(["urgent", "regression"]);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing for empty / null / undefined tag lists", () => {
    const cases: Array<string[] | null | undefined> = [[], null, undefined];
    for (const tags of cases) {
      const { container, unmount } = renderWithLang(tags);
      expect(container.firstChild).toBeNull();
      unmount();
    }
  });

  it("does not match substrings like 'awaiting'", () => {
    const { container } = renderWithLang(["awaiting", "waiting-review"]);
    expect(container.firstChild).toBeNull();
  });
});
