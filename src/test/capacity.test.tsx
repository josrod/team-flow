import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AppProvider } from "@/context/AppContext";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import TeamPage from "@/pages/TeamPage";
import { WorkloadMatrix } from "@/components/WorkloadMatrix";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { TfsWorkItem } from "@/services/tfs";
import { useState } from "react";
import { translations } from "@/context/LanguageContext";

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

// Mock LanguageContext using real translations for assertions
vi.mock("@/context/LanguageContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/context/LanguageContext")>();
  return {
    ...actual,
    useLang: () => ({
      lang: "en" as const,
      toggleLang: vi.fn(),
      t: actual.translations.en,
    })
  };
});

const TestMatrixWrapper = ({ initialTasks = [] }: { initialTasks?: TfsWorkItem[] }) => {
  const [showAllTasks, setShowAllTasks] = useState(false);
  return (
    <AppProvider>
      <MemoryRouter initialEntries={["/team/team-1"]}>
        <Routes>
          <Route path="/team/:teamId" element={<TeamPage />} />
        </Routes>
      </MemoryRouter>
      <WorkloadMatrix tasks={initialTasks} showAllTasks={showAllTasks} onShowAllTasksChange={setShowAllTasks} />
    </AppProvider>
  );
};

describe("Capacity Management", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("should render only 'In Progress' tasks by default and toggle to all active tasks", async () => {
    const mockTasks: TfsWorkItem[] = [
      { id: 1, title: "Task 1", state: "In Progress", workItemType: "Task", assignedTo: "Carlos", remainingWork: 10, effort: 10, originalEstimate: 10, url: "" },
      { id: 2, title: "Task 2", state: "Pending", workItemType: "Task", assignedTo: "Carlos", remainingWork: 5, effort: 5, originalEstimate: 5, url: "" },
      { id: 3, title: "Task 3", state: "Done", workItemType: "Task", assignedTo: "Carlos", remainingWork: 2, effort: 2, originalEstimate: 2, url: "" }
    ];

    render(<TestMatrixWrapper initialTasks={mockTasks} />);
    
    // Select first member in team page
    const members = await screen.findAllByText("Carlos");
    fireEvent.click(members[0]);

    // Check effort indicator for "Carlos" (10h from 'In Progress' task)
    await waitFor(() => {
      // It should display '1 In Progress' label
      expect(screen.queryAllByText(translations.en.inProgressTasksCount.replace("{count}", "1")).length).toBeGreaterThan(0);
      // And the total effort rendered in the matrix cell should be 10h
      expect(screen.queryAllByText("10h").length).toBeGreaterThan(0);
    });

    // Click on the matrix cell to open the modal
    const cellWith10h = screen.getAllByText("10h")[0].closest("td");
    fireEvent.click(cellWith10h!);

    // Modal should show only "Task 1" and the title should indicate "In Progress"
    await waitFor(() => {
      expect(screen.queryByText(translations.en.taskDetailInProgress.replace("{name}", "Carlos"))).not.toBeNull();
      expect(screen.queryAllByText("[1] Task 1").length).toBeGreaterThan(0);
      expect(screen.queryAllByText("[2] Task 2").length).toBe(0);
      expect(screen.queryAllByText("[3] Task 3").length).toBe(0);
    });

    // Close the modal by pressing escape on the dialog itself
    const activeDialog = screen.getByRole("dialog");
    fireEvent.keyDown(activeDialog, { key: "Escape", code: "Escape" });
    await waitFor(() => {
      // The task detail modal should be closed
      expect(screen.queryByText(translations.en.taskDetailInProgress.replace("{name}", "Carlos"))).toBeNull();
    });

    // Now toggle the switch to show all tasks
    const toggle = document.getElementById("show-all-tasks");
    expect(toggle).not.toBeNull();
    fireEvent.click(toggle!);

    // Effort should now be 15h (10h In Progress + 5h Pending) - Done tasks are excluded because of isActiveTask
    await waitFor(() => {
      expect(screen.queryAllByText(translations.en.allTasksCount.replace("{count}", "2")).length).toBeGreaterThan(0); // Label changes to "{count} Tasks"
      expect(screen.queryAllByText("15h").length).toBeGreaterThan(0);
    });

    // Click on the matrix cell again
    const cellWith15h = screen.getAllByText("15h")[0].closest("td");
    fireEvent.click(cellWith15h!);

    // Modal should show Task 1 and Task 2 and the title should indicate "All"
    await waitFor(() => {
      expect(screen.queryByText(translations.en.taskDetailAll.replace("{name}", "Carlos"))).not.toBeNull();
      expect(screen.queryAllByText("[1] Task 1").length).toBeGreaterThan(0);
      expect(screen.queryAllByText("[2] Task 2").length).toBeGreaterThan(0);
      expect(screen.queryAllByText("[3] Task 3").length).toBe(0);
    });
  });

  it("should reset member capacity to undefined and instantly recalculate workload matrix", async () => {
    render(<TestMatrixWrapper />);
    
    // Select first member in team page
    const members = await screen.findAllByText("Carlos"); // First mock member
    fireEvent.click(members[0]);
    
    // Find capacity inputs
    const inputs = await screen.findAllByRole("spinbutton");
    const maxCapacityInput = inputs.find(i => i.getAttribute("max") === "168" || i.previousElementSibling?.textContent?.includes("Max Capacity"));
    
    expect(maxCapacityInput).toBeDefined();
    
    // Change capacity
    fireEvent.change(maxCapacityInput!, { target: { value: "45" } });
    
    // Now the reset button should appear
    const resetButtons = await screen.findAllByRole("button", { name: /Reset/i });
    expect(resetButtons.length).toBeGreaterThan(0);
    const resetButton = resetButtons[0];
    
    // Verify matrix reflects the changed capacity (4 weeks = at least 4 cells)
    await waitFor(() => {
      expect(screen.queryAllByText("M:45h").length).toBeGreaterThan(0);
    });
    
    // Click reset
    fireEvent.click(resetButton);
    
    // Wait for confirmation dialog and click the confirm button
    const confirmReset = await screen.findByRole("button", { name: translations.en.resetCapacity });
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

  it("should accurately count only 'In Progress' tasks and sum their hours correctly", async () => {
    const mockTasks: TfsWorkItem[] = [
      { id: 1, title: "Task 1", state: "In Progress", workItemType: "Task", assignedTo: "Carlos", remainingWork: 8, effort: 8, originalEstimate: 8, url: "" },
      { id: 2, title: "Task 2", state: "IN progress ", workItemType: "Task", assignedTo: "Carlos", remainingWork: 4, effort: 4, originalEstimate: 4, url: "" },
      { id: 3, title: "Task 3", state: "Pending", workItemType: "Task", assignedTo: "Carlos", remainingWork: 20, effort: 20, originalEstimate: 20, url: "" },
      { id: 4, title: "Task 4", state: "Done", workItemType: "Task", assignedTo: "Carlos", remainingWork: 5, effort: 5, originalEstimate: 5, url: "" }
    ];

    render(<TestMatrixWrapper initialTasks={mockTasks} />);
    
    // Select first member in team page
    const members = await screen.findAllByText("Carlos");
    fireEvent.click(members[0]);

    // Check effort indicator for "Carlos"
    // There are 2 "In Progress" tasks (case insensitive mapping via isTaskInProgress)
    // Total 'In Progress' hours = 8 + 4 = 12h
    await waitFor(() => {
      // It should display exactly '2 In Progress'
      expect(screen.queryAllByText(translations.en.inProgressTasksCount.replace("{count}", "2")).length).toBeGreaterThan(0);
      
      // And the total effort rendered in the matrix cell should be 12h
      expect(screen.queryAllByText("12h").length).toBeGreaterThan(0);
      
      // The pending (20h) and done (5h) should not be included by default
      expect(screen.queryAllByText("32h").length).toBe(0);
    });

    // Open the cell details to check the order/list of tasks
    const cellWith12h = screen.getAllByText("12h")[0].closest("td");
    fireEvent.click(cellWith12h!);

    // Modal should show only "Task 1" and "Task 2"
    await waitFor(() => {
      expect(screen.queryAllByText("[1] Task 1").length).toBeGreaterThan(0);
      expect(screen.queryAllByText("[2] Task 2").length).toBeGreaterThan(0);
      expect(screen.queryAllByText("[3] Task 3").length).toBe(0);
      expect(screen.queryAllByText("[4] Task 4").length).toBe(0);
    });
  });
});
