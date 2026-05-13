import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { LanguageProvider } from "@/context/LanguageContext";
import { AppProvider } from "@/context/AppContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { AppLayout } from "@/components/AppLayout";
import FeaturesPage from "@/pages/FeaturesPage";

// Mock resize observer
window.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock sonner
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn()
  }
}));

// Mock Supabase
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    channel: () => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn()
    }),
    removeChannel: vi.fn(),
    from: () => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null })
    })
  }
}));

// Mock AuthContext
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "test-user-123", email: "test@example.com" },
    session: null,
    signOut: vi.fn(),
  }),
  AuthProvider: ({ children }: any) => <>{children}</>
}));

describe("Language Switching", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("should translate Tareas page titles and sidebar when switching language", async () => {
    render(
      <MemoryRouter initialEntries={["/tasks"]}>
        <LanguageProvider>
          <ThemeProvider>
            <AppProvider>
              <AppLayout>
                <Routes>
                  <Route path="/tasks" element={<FeaturesPage view="tasks" />} />
                </Routes>
              </AppLayout>
            </AppProvider>
          </ThemeProvider>
        </LanguageProvider>
      </MemoryRouter>
    );

    // Default is ES
    // Sidebar items
    expect(screen.getByRole("link", { name: /Tareas/i })).toBeInTheDocument();
    
    // Page Title
    expect(screen.getByRole("heading", { name: "Tareas", level: 1 })).toBeInTheDocument();
    
    // Page Subtitle
    expect(screen.getByText("Trabajo asignado por persona, abierto y en progreso.")).toBeInTheDocument();

    // Toggle language
    const langBtn = screen.getByRole("button", { name: /^ES$/ });
    fireEvent.click(langBtn);

    // Wait for translation
    await waitFor(() => {
      // Button should say EN
      expect(screen.getByRole("button", { name: /^EN$/ })).toBeInTheDocument();
    });

    // Check English
    expect(screen.getByRole("link", { name: /Tasks/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Tasks", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("Assigned work per person, open and in progress.")).toBeInTheDocument();
  });

  it("should translate Workload page titles and sidebar when switching language", async () => {
    render(
      <MemoryRouter initialEntries={["/workload"]}>
        <LanguageProvider>
          <ThemeProvider>
            <AppProvider>
              <AppLayout>
                <Routes>
                  <Route path="/workload" element={<FeaturesPage view="workload" />} />
                </Routes>
              </AppLayout>
            </AppProvider>
          </ThemeProvider>
        </LanguageProvider>
      </MemoryRouter>
    );

    // Default is ES
    // Sidebar
    expect(screen.getByRole("link", { name: /Carga & Capacidad/i })).toBeInTheDocument();
    
    // Page Title
    expect(screen.getByRole("heading", { name: "Carga & Capacidad", level: 1 })).toBeInTheDocument();
    
    // Page Subtitle
    expect(screen.getByText("Disponibilidad y carga de trabajo agrupada por semana (solo tareas In Progress).")).toBeInTheDocument();

    // Inside WorkloadMatrix
    expect(screen.getByRole("heading", { name: "Carga de Trabajo y Disponibilidad" })).toBeInTheDocument();

    // Toggle language
    const langBtn = screen.getByRole("button", { name: /^ES$/ });
    fireEvent.click(langBtn);

    // Wait for EN
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^EN$/ })).toBeInTheDocument();
    });

    // Check English
    expect(screen.getByRole("link", { name: /Workload & Capacity/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Workload & Capacity", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("Availability and workload grouped by week (only In Progress tasks).")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Workload and Availability" })).toBeInTheDocument();
  });
});
