import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { MemoryRouter, Route, Routes, useSearchParams } from "react-router-dom";

import { LanguageProvider } from "@/context/LanguageContext";
import { AppProvider } from "@/context/AppContext";
import { ThemeProvider } from "@/context/ThemeContext";
import FeaturesPage from "@/pages/FeaturesPage";

window.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    channel: () => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() }),
    removeChannel: vi.fn(),
    from: () => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null }),
    }),
  },
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "test-user", email: "test@example.com" },
    session: null,
    signOut: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Renders the current `?` search params so tests can assert URL-driven state
// after the "Limpiar filtros" button is clicked.
function SearchParamsProbe() {
  const [params] = useSearchParams();
  return <div data-testid="search-params">{params.toString()}</div>;
}

function renderTasks(initialUrl: string) {
  return render(
    <MemoryRouter initialEntries={[initialUrl]}>
      <LanguageProvider>
        <ThemeProvider>
          <AppProvider>
            <SearchParamsProbe />
            <Routes>
              <Route path="/tasks" element={<FeaturesPage view="tasks" />} />
            </Routes>
          </AppProvider>
        </ThemeProvider>
      </LanguageProvider>
    </MemoryRouter>,
  );
}

describe("Tasks page — empty state messaging in 'Tareas por persona'", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("shows a search-scoped message and a clear-filters button when search yields no matches", async () => {
    renderTasks("/tasks?q=zzznomatchzzz");

    const statuses = await screen.findAllByRole("status");
    const status = statuses.find((el) => el.textContent?.includes("zzznomatchzzz"));
    expect(status).toBeDefined();
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status!.textContent).toMatch(/zzznomatchzzz/);

    const clearButtons = screen.getAllByRole("button", { name: /limpiar filtros/i });
    expect(clearButtons.length).toBeGreaterThan(0);
  });

  it("shows a team-scoped message when team has no matching tasks", async () => {
    renderTasks("/tasks?team=team-1&q=zzznomatchzzz");

    const statuses = await screen.findAllByRole("status");
    const status = statuses.find(
      (el) => el.textContent?.includes("RODAT") && el.textContent?.includes("zzznomatchzzz"),
    );
    expect(status).toBeDefined();
    expect(screen.getAllByRole("button", { name: /limpiar filtros/i }).length).toBeGreaterThan(0);
  });

  it("clicking 'Limpiar filtros' resets the URL search params", async () => {
    renderTasks("/tasks?team=team-1&q=zzznomatchzzz");

    const probe = await screen.findByTestId("search-params");
    expect(probe.textContent).toContain("team=team-1");
    expect(probe.textContent).toContain("q=zzznomatchzzz");

    const clearBtn = await screen.findByRole("button", { name: /limpiar filtros/i });
    fireEvent.click(clearBtn);

    await waitFor(() => {
      expect(probe.textContent).toBe("");
    });
  });

  it("clicking 'Limpiar filtros' also clears the search input value", async () => {
    renderTasks("/tasks?q=zzznomatchzzz");

    const searchInput = (await screen.findByPlaceholderText(/Buscar tarea/i)) as HTMLInputElement;
    expect(searchInput.value).toBe("zzznomatchzzz");

    const clearBtn = await screen.findByRole("button", { name: /limpiar filtros/i });
    fireEvent.click(clearBtn);

    await waitFor(() => {
      expect(searchInput.value).toBe("");
    });
  });

  it("does NOT render the clear-filters button when no filter is active", async () => {
    // With no team/person/search active, the "Tareas por persona" view shows
    // grouped people, so the empty-state CTA must not appear.
    renderTasks("/tasks");

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /limpiar filtros/i })).not.toBeInTheDocument();
    });
  });
});

describe("Tasks page — empty-state message updates as user types (debounced)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  // Helper: find the role="status" container whose text matches a regex.
  // Used to disambiguate from other live regions on the page.
  const findStatusContaining = async (re: RegExp) => {
    return await waitFor(
      () => {
        const statuses = screen.queryAllByRole("status");
        const match = statuses.find((el) => re.test(el.textContent ?? ""));
        if (!match) throw new Error(`No status region matches ${re}`);
        return match;
      },
      { timeout: 1500 },
    );
  };

  it("updates the message when typing a search-only query", async () => {
    renderTasks("/tasks");

    const input = (await screen.findByPlaceholderText(/Buscar tarea/i)) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "zzznomatchzzz1" } });

    const status1 = await findStatusContaining(/zzznomatchzzz1/);
    expect(status1).toHaveAttribute("aria-live", "polite");

    // Now type a different query — the empty-state message must reflect it
    // after the debounce window elapses.
    fireEvent.change(input, { target: { value: "zzznomatchzzz2" } });
    const status2 = await findStatusContaining(/zzznomatchzzz2/);
    expect(status2.textContent).not.toMatch(/zzznomatchzzz1/);
  });

  it("updates the message for a team + search combination", async () => {
    renderTasks("/tasks?team=team-1");

    const input = (await screen.findByPlaceholderText(/Buscar tarea/i)) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "zzznoteammatch" } });

    const status = await findStatusContaining(/zzznoteammatch/);
    // Must mention the active team name (RODAT = team-1 in mock-data).
    expect(status.textContent).toMatch(/RODAT/);
    expect(status.textContent).toMatch(/zzznoteammatch/);
  });

  it("updates the message for a person + search combination", async () => {
    // Carlos is the first mock member and belongs to team-1.
    renderTasks("/tasks?person=Carlos");

    const input = (await screen.findByPlaceholderText(/Buscar tarea/i)) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "zzznopersonmatch" } });

    const status = await findStatusContaining(/zzznopersonmatch/);
    expect(status.textContent).toMatch(/Carlos/);
    expect(status.textContent).toMatch(/zzznopersonmatch/);
  });

  it("clearing the search removes the empty state once results appear again", async () => {
    renderTasks("/tasks?team=team-1");

    const input = (await screen.findByPlaceholderText(/Buscar tarea/i)) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "zzznoteammatch" } });

    // Empty-state message appears for team + search combination
    await findStatusContaining(/zzznoteammatch/);

    // Clear the search — RODAT has matching tasks again, so the empty-state
    // status region with our query (or with RODAT-only fallback) must go away.
    fireEvent.change(input, { target: { value: "" } });
    await waitFor(
      () => {
        const statuses = screen.queryAllByRole("status");
        const stillEmpty = statuses.find((el) => /zzznoteammatch/.test(el.textContent ?? ""));
        expect(stillEmpty).toBeUndefined();
      },
      { timeout: 1500 },
    );
  });
});
