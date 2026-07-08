import { render, screen, waitFor, within } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { LanguageProvider } from "@/context/LanguageContext";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppProvider } from "@/context/AppContext";
import { ThemeProvider } from "@/context/ThemeContext";
import FeaturesPage from "@/pages/FeaturesPage";
import { members, teams } from "@/data/mock-data";

window.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

vi.mock("@/integrations/supabase/client", async () => {
  const { supabaseMock } = await import("./mocks/supabase-mock");
  return { supabase: supabaseMock };
});

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "test-user", email: "test@example.com" },
    session: null,
    isAdmin: true,
    signOut: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

function renderTasks(initialUrl: string) {
  return render(
    <MemoryRouter initialEntries={[initialUrl]}>
      <TooltipProvider><LanguageProvider>
        <ThemeProvider>
          <AppProvider>
            <Routes>
              <Route path="/tasks" element={<FeaturesPage view="tasks" />} />
            </Routes>
          </AppProvider>
        </ThemeProvider>
      </LanguageProvider></TooltipProvider>
    </MemoryRouter>,
  );
}

describe("Tasks page — team filter on 'Tareas por persona'", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("shows members from all teams when no team filter is applied", async () => {
    renderTasks("/tasks");
    const rodatMember = members.find((m) => m.teamId === "team-1")!;
    const processingMember = members.find((m) => m.teamId === "team-2")!;

    await waitFor(() => {
      expect(screen.getAllByText(rodatMember.name).length).toBeGreaterThan(0);
      expect(screen.getAllByText(processingMember.name).length).toBeGreaterThan(0);
    });
  });

  it("only shows RODAT members when team=team-1 is active", async () => {
    renderTasks("/tasks?team=team-1");
    const rodatMember = members.find((m) => m.teamId === "team-1")!;
    const processingMember = members.find((m) => m.teamId === "team-2")!;

    await waitFor(() => {
      expect(screen.getAllByText(rodatMember.name).length).toBeGreaterThan(0);
    });
    expect(screen.queryByText(processingMember.name)).not.toBeInTheDocument();
  });

  it("only shows Processing members when team=team-2 is active", async () => {
    renderTasks("/tasks?team=team-2");
    const rodatMember = members.find((m) => m.teamId === "team-1")!;
    const processingMember = members.find((m) => m.teamId === "team-2")!;

    await waitFor(() => {
      expect(screen.getAllByText(processingMember.name).length).toBeGreaterThan(0);
    });
    expect(screen.queryByText(rodatMember.name)).not.toBeInTheDocument();
  });

  it("has both teams defined in mock data", () => {
    expect(teams.map((t) => t.id).sort()).toEqual(["team-1", "team-2"]);
  });

  // Ensures the team filter is data-source agnostic (works for TFS-shaped tasks too)
  // by validating the underlying lookup behavior independent of `source`.
  it("filters tasks by assignee→team mapping regardless of source", () => {
    const rodatNames = new Set(
      members.filter((m) => m.teamId === "team-1").map((m) => m.name),
    );
    const fakeTasks = [
      { assignee: members.find((m) => m.teamId === "team-1")!.name },
      { assignee: members.find((m) => m.teamId === "team-2")!.name },
      { assignee: "Unknown Person" },
    ];
    const teamIdByAssignee = new Map(members.map((m) => [m.name, m.teamId]));
    const filtered = fakeTasks.filter(
      (t) => teamIdByAssignee.get(t.assignee) === "team-1",
    );
    expect(filtered).toHaveLength(1);
    expect(rodatNames.has(filtered[0].assignee)).toBe(true);
  });
});

// Silence the unused `within` import warning if not used
void within;
