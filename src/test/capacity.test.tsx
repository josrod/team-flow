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
  const en = actual.translations.en;
  return {
    ...actual,
    useLang: () => ({
      t: {
        teamNotFound: translations.en.teamNotFound,
        members: translations.en.members,
        add: translations.en.add,
        newMember: translations.en.newMember,
        name: translations.en.name,
        role: translations.en.role,
        search: translations.en.search,
        all: translations.en.all,
        available: translations.en.available,
        vacation: translations.en.vacation,
        sickLeave: translations.en.sickLeave,
        team: translations.en.team,
        workTopics: translations.en.workTopics,
        addTopic: translations.en.addTopic,
        confirmMove: translations.en.confirmMove,
        confirmMoveDesc: translations.en.confirmMoveDesc,
        cancel: translations.en.cancel,
        confirm: translations.en.confirm,
        resetCapacityConfirmTitle: translations.en.resetCapacityConfirmTitle,
        resetCapacityConfirmDesc: translations.en.resetCapacityConfirmDesc,
        capacityConfig: translations.en.capacityConfig,
        maxCapacity: translations.en.maxCapacity,
        baseCapacity: translations.en.baseCapacity,
        resetCapacity: translations.en.resetCapacity,
        undo: translations.en.undo,
        taskDetailInProgress: translations.en.taskDetailInProgress,
        taskDetailAll: translations.en.taskDetailAll,
        inProgressTasksCount: translations.en.inProgressTasksCount,
        allTasksCount: translations.en.allTasksCount,
        onlyInProgress: translations.en.onlyInProgress,
        allTasks: translations.en.allTasks,
      }
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
    const members = await scretranslations.en.findAllByText("Carlos");
    fireEvent.click(members[0]);

    // Check effort indicator for "Carlos" (10h from 'In Progress' task)
    await waitFor(() => {
      // It should display '1 In Progress' label
      expect(scretranslations.en.queryAllByText(translations.en.inProgressTasksCount.replace("{count}", "1")).length).toBeGreaterThan(0);
      // And the total effort rendered in the matrix cell should be 10h
      expect(scretranslations.en.queryAllByText("10h").length).toBeGreaterThan(0);
    });

    // Click on the matrix cell to open the modal
    const cellWith10h = scretranslations.en.getAllByText("10h")[0].closest("td");
    fireEvent.click(cellWith10h!);

    // Modal should show only "Task 1" and the title should indicate "In Progress"
    await waitFor(() => {
      expect(scretranslations.en.queryByText(translations.en.taskDetailInProgress.replace("{name}", "Carlos"))).not.toBeNull();
      expect(scretranslations.en.queryAllByText("[1] Task 1").length).toBeGreaterThan(0);
      expect(scretranslations.en.queryAllByText("[2] Task 2").length).toBe(0);
      expect(scretranslations.en.queryAllByText("[3] Task 3").length).toBe(0);
    });

    // Close the modal by pressing escape on the dialog itself
    const activeDialog = scretranslations.en.getByRole("dialog");
    fireEvent.keyDown(activeDialog, { key: "Escape", code: "Escape" });
    await waitFor(() => {
      // The task detail modal should be closed
      expect(scretranslations.en.queryByText(translations.en.taskDetailInProgress.replace("{name}", "Carlos"))).toBeNull();
    });

    // Now toggle the switch to show all tasks
    const toggle = document.getElementById("show-all-tasks");
    expect(toggle).not.toBeNull();
    fireEvent.click(toggle!);

    // Effort should now be 15h (10h In Progress + 5h Pending) - Done tasks are excluded because of isActiveTask
    await waitFor(() => {
      expect(scretranslations.en.queryAllByText(translations.en.allTasksCount.replace("{count}", "2")).length).toBeGreaterThan(0); // Label changes to "{count} Tasks"
      expect(scretranslations.en.queryAllByText("15h").length).toBeGreaterThan(0);
    });

    // Click on the matrix cell again
    const cellWith15h = scretranslations.en.getAllByText("15h")[0].closest("td");
    fireEvent.click(cellWith15h!);

    // Modal should show Task 1 and Task 2 and the title should indicate "All"
    await waitFor(() => {
      expect(scretranslations.en.queryByText(translations.en.taskDetailAll.replace("{name}", "Carlos"))).not.toBeNull();
      expect(scretranslations.en.queryAllByText("[1] Task 1").length).toBeGreaterThan(0);
      expect(scretranslations.en.queryAllByText("[2] Task 2").length).toBeGreaterThan(0);
      expect(scretranslations.en.queryAllByText("[3] Task 3").length).toBe(0);
    });
  });

  it("should reset member capacity to undefined and instantly recalculate workload matrix", async () => {
    render(<TestMatrixWrapper />);
    
    // Select first member in team page
    const members = await scretranslations.en.findAllByText("Carlos"); // First mock member
    fireEvent.click(members[0]);
    
    // Find capacity inputs
    const inputs = await scretranslations.en.findAllByRole("spinbutton");
    const maxCapacityInput = inputs.find(i => i.getAttribute("max") === "168" || i.previousElementSibling?.textContent?.includes("Max Capacity"));
    
    expect(maxCapacityInput).toBeDefined();
    
    // Change capacity
    fireEvent.change(maxCapacityInput!, { target: { value: "45" } });
    
    // Now the reset button should appear
    const resetButtons = await scretranslations.en.findAllByRole("button", { name: /Reset/i });
    expect(resetButtons.length).toBeGreaterThan(0);
    const resetButton = resetButtons[0];
    
    // Verify matrix reflects the changed capacity (4 weeks = at least 4 cells)
    await waitFor(() => {
      expect(scretranslations.en.queryAllByText("M:45h").length).toBeGreaterThan(0);
    });
    
    // Click reset
    fireEvent.click(resetButton);
    
    // Wait for confirmation dialog and click the confirm button
    const confirmReset = await scretranslations.en.findByRole("button", { name: translations.en.resetCapacity });
    fireEvent.click(confirmReset);
    
    // The capacity input should go back to 40
    await waitFor(() => {
      expect((maxCapacityInput as HTMLInputElement).value).toBe("40");
    });
    
    // The matrix should reflect the default max capacity (40h) again
    await waitFor(() => {
      expect(scretranslations.en.queryAllByText("M:40h").length).toBeGreaterThan(0);
      expect(scretranslations.en.queryAllByText("M:45h").length).toBe(0);
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
    const members = await scretranslations.en.findAllByText("Carlos");
    fireEvent.click(members[0]);

    // Check effort indicator for "Carlos"
    // There are 2 "In Progress" tasks (case insensitive mapping via isTaskInProgress)
    // Total 'In Progress' hours = 8 + 4 = 12h
    await waitFor(() => {
      // It should display exactly '2 In Progress'
      expect(scretranslations.en.queryAllByText(translations.en.inProgressTasksCount.replace("{count}", "2")).length).toBeGreaterThan(0);
      
      // And the total effort rendered in the matrix cell should be 12h
      expect(scretranslations.en.queryAllByText("12h").length).toBeGreaterThan(0);
      
      // The pending (20h) and done (5h) should not be included by default
      expect(scretranslations.en.queryAllByText("32h").length).toBe(0);
    });

    // Open the cell details to check the order/list of tasks
    const cellWith12h = scretranslations.en.getAllByText("12h")[0].closest("td");
    fireEvent.click(cellWith12h!);

    // Modal should show only "Task 1" and "Task 2"
    await waitFor(() => {
      expect(scretranslations.en.queryAllByText("[1] Task 1").length).toBeGreaterThan(0);
      expect(scretranslations.en.queryAllByText("[2] Task 2").length).toBeGreaterThan(0);
      expect(scretranslations.en.queryAllByText("[3] Task 3").length).toBe(0);
      expect(scretranslations.en.queryAllByText("[4] Task 4").length).toBe(0);
    });
  });
});