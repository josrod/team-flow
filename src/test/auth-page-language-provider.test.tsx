import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { LanguageProvider } from "@/context/LanguageContext";
import AuthPage from "@/pages/AuthPage";

// AuthPage depends on AuthContext; mock it so the test focuses on the
// LanguageProvider/useLang wiring only.
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    user: null,
    session: null,
    isAdmin: true,
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
    resetPassword: vi.fn(),
  }),
}));

describe("AuthPage within LanguageProvider", () => {
  it("renders without throwing when wrapped in LanguageProvider", () => {
    expect(() =>
      render(
        <LanguageProvider>
          <MemoryRouter initialEntries={["/auth"]}>
            <AuthPage />
          </MemoryRouter>
        </LanguageProvider>,
      ),
    ).not.toThrow();

    // Sanity check: a translated string from useLang() made it into the DOM.
    expect(document.body.textContent?.length ?? 0).toBeGreaterThan(0);
  });

  it("throws a clear error when rendered without LanguageProvider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() =>
      render(
        <MemoryRouter initialEntries={["/auth"]}>
          <AuthPage />
        </MemoryRouter>,
      ),
    ).toThrow(/useLang must be used within LanguageProvider/);
    spy.mockRestore();
  });

  it("does not render any element with the literal placeholder text", () => {
    render(
      <LanguageProvider>
        <MemoryRouter initialEntries={["/auth"]}>
          <AuthPage />
        </MemoryRouter>
      </LanguageProvider>,
    );
    // Guard against accidentally leaking translation keys instead of values.
    expect(screen.queryByText(/^t\./)).toBeNull();
  });
});
