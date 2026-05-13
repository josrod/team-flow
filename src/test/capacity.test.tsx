import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AppProvider } from "@/context/AppContext";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import TeamPage from "@/pages/TeamPage";
import { WorkloadMatrix } from "@/components/WorkloadMatrix";
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock resize observer
window.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock to isolate toast notifications
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  }
}));

// Mock AuthContext
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "test-user-123" },
    session: null,
    signOut: vi.fn(),
  })
}));

// Mock LanguageContext
vi.mock("@/context/LanguageContext", () => ({
  useLang: () => ({
    t: {
      teamNotFound: "Team not found",
      members: "Members",
      add: "Add",
      newMember: "New Member",
      name: "Name",
      role: "Role",
      search: "Search",
      all: "All",
      available: "Available",
      vacation: "Vacation",
      sickLeave: "Sick Leave",
      team: "Team",
      workTopics: "Work Topics",
      addTopic: "Add Topic",
      confirmMove: "Move member?",
      confirmMoveDesc: "Move {name} to {team}?",
      cancel: "Cancel",
      confirm: "Confirm",
      resetCapacityConfirmTitle: "Reset capacity?",
      resetCapacityConfirmDesc: "Are you sure you want to reset {name}'s capacity?",
      capacityConfig: "Capacity Configuration",
      maxCapacity: "Max Capacity (h/week)",
      baseCapacity: "Base Capacity (h/week)",
      resetCapacity: "Reset",
      undo: "Undo"
    }
  })
}));

const TestMatrixWrapper = () => {
  return (
    <AppProvider>
      <MemoryRouter initialEntries={["/team/team-1"]}>
        <Routes>
          <Route path="/team/:teamId" element={<TeamPage />} />
        </Routes>
      </MemoryRouter>
      <WorkloadMatrix tasks={[]} />
    </AppProvider>
  );
};

describe("Capacity Management", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("should reset member capacity to undefined and instantly recalculate workload matrix", async () => {
    render(<TestMatrixWrapper />);
    
    // Select first member in team page
    const members = await screen.findAllByText("Carlos"); // First mock member
    fireEvent.click(members[0]);
    
    // Find capacity inputs
    const inputs = await screen.findAllByRole("spinbutton");
    const maxCapacityInput = inputs.find(i => i.getAttribute("max") === "168" || i.previousElementSibling?.textContent?.includes("Capacidad Máxima"));
    
    expect(maxCapacityInput).toBeDefined();
    
    // Change capacity
    fireEvent.change(maxCapacityInput!, { target: { value: "45" } });
    
    // Now the reset button should appear
    const resetButtons = await screen.findAllByRole("button", { name: /Restablecer/i });
    expect(resetButtons.length).toBeGreaterThan(0);
    const resetButton = resetButtons[0];
    
    // Verify matrix reflects the changed capacity (4 weeks = at least 4 cells)
    await waitFor(() => {
      expect(screen.queryAllByText("M:45h").length).toBeGreaterThan(0);
    });
    
    // Click reset
    fireEvent.click(resetButton);
    
    // Wait for confirmation dialog and click the confirm button
    const confirmReset = await screen.findByRole("button", { name: "Restablecer" });
    fireEvent.click(confirmReset);
    
    // The capacity input should go back to 40
    await waitFor(() => {
      expect((maxCapacityInput as HTMLInputElement).value).toBe("40");
    });
    
    // The matrix should reflect the default max capacity (40h) again
    await waitFor(() => {
      expect(screen.queryAllByText("M:40h").length).toBeGreaterThan(0);
      expect(screen.queryAllByText("M:45h").length).toBe(0);
    });
  });
});