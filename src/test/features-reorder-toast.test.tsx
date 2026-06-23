import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { toast } from "sonner";

import { LanguageProvider } from "@/context/LanguageContext";
import { AppProvider } from "@/context/AppContext";
import { ThemeProvider } from "@/context/ThemeContext";
import FeaturesPage from "@/pages/FeaturesPage";

window.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

vi.mock("sonner", async () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
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

vi.mock("@/components/SortableRows", () => ({
  SortableRows: ({ items, enabled, onReorder, renderCells }: any) => (
    <>
      {items.map((item: any) => (
        <tr key={item.id} data-testid={`row-${item.id}`}>
          {renderCells(
            item,
            enabled ? (
              <button
                type="button"
                data-testid={`reorder-${item.id}`}
                onClick={() => {
                  const overId = items.find((it: any) => it.id !== item.id)?.id ?? item.id;
                  onReorder(item.id, overId);
                }}
              >
                Reorder
              </button>
            ) : null,
          )}
        </tr>
      ))}
    </>
  ),
}));

function renderTasks(initialUrl: string) {
  return render(
    <MemoryRouter initialEntries={[initialUrl]}>
      <LanguageProvider>
        <ThemeProvider>
          <AppProvider>
            <Routes>
              <Route path="/tasks" element={<FeaturesPage view="tasks" />} />
            </Routes>
          </AppProvider>
        </ThemeProvider>
      </LanguageProvider>
    </MemoryRouter>,
  );
}

describe("Tasks page — drag-and-drop reorder toast", () => {
  beforeEach(() => {
    localStorage.clear();
    toastSuccess.mockClear();
  });

  it("shows a toast with the new task order and developer bucket after reordering", async () => {
    renderTasks("/tasks?person=Carlos");

    // Switch to flat list view so SortableRows is rendered.
    const flatListBtn = await screen.findByRole("button", { name: /Ver listado plano/i });
    fireEvent.click(flatListBtn);

    // Switch to priority sort so DnD is enabled.
    const sortSelect = (await screen.findByLabelText(/Ordenar por/i)) as HTMLSelectElement;
    fireEvent.change(sortSelect, { target: { value: "priority" } });

    // Trigger the mocked drag-and-drop reorder.
    const reorderBtn = await screen.findByTestId(/^reorder-topic-0-0$/);
    fireEvent.click(reorderBtn);

    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalled();
    });

    const call = toastSuccess.mock.calls[0];
    expect(call[0]).toBe("Tarea reordenada");
    expect(call[1].description).toMatch(/topic-0-0/);
    expect(call[1].description).toMatch(/Carlos/);
    expect(call[1].description).toMatch(/posición \d+ de \d+/);
  });
});
