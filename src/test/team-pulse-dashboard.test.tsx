import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { AppProvider } from "@/context/AppContext";
import { TeamPulseDashboard } from "@/components/TeamPulseDashboard";

// Recharts uses ResponsiveContainer which needs ResizeObserver in jsdom
window.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Avoid noisy auth context dependency if AppProvider transitively reads it
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "test-user" },
    session: null,
    signOut: vi.fn(),
  }),
}));

function renderDashboard() {
  return render(
    <AppProvider>
      <TeamPulseDashboard />
    </AppProvider>
  );
}

describe("TeamPulseDashboard", () => {
  it("renders the main heading and KPI labels", () => {
    renderDashboard();
    expect(
      screen.getByRole("heading", { level: 1, name: /team pulse/i })
    ).toBeInTheDocument();
    expect(screen.getAllByText(/team utilization/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/absent today/i)).toBeInTheDocument();
    expect(screen.getByText(/handover coverage/i)).toBeInTheDocument();
  });

  it("exposes the tab bar with proper ARIA roles and selection state", () => {
    renderDashboard();
    const tablist = screen.getByRole("tablist", { name: /dashboard sections/i });
    expect(tablist).toBeInTheDocument();

    const tabs = within(tablist).getAllByRole("tab");
    expect(tabs).toHaveLength(3);

    // Pulse is the default active tab
    const pulseTab = within(tablist).getByRole("tab", { name: /pulse/i });
    expect(pulseTab).toHaveAttribute("aria-selected", "true");
    expect(pulseTab).toHaveAttribute("tabindex", "0");

    const flowTab = within(tablist).getByRole("tab", { name: /topic flow/i });
    expect(flowTab).toHaveAttribute("aria-selected", "false");
    expect(flowTab).toHaveAttribute("tabindex", "-1");
  });

  it("switches the active tabpanel when a tab is clicked", () => {
    renderDashboard();
    const flowTab = screen.getByRole("tab", { name: /topic flow/i });
    fireEvent.click(flowTab);

    expect(flowTab).toHaveAttribute("aria-selected", "true");
    const panel = screen.getByRole("tabpanel");
    expect(panel).toHaveAttribute("aria-labelledby", "pulse-tab-flow");
  });

  it("supports keyboard arrow navigation between tabs", () => {
    renderDashboard();
    const pulseTab = screen.getByRole("tab", { name: /pulse/i });
    const flowTab = screen.getByRole("tab", { name: /topic flow/i });

    pulseTab.focus();
    fireEvent.keyDown(pulseTab, { key: "ArrowRight" });

    expect(flowTab).toHaveAttribute("aria-selected", "true");
    expect(pulseTab).toHaveAttribute("aria-selected", "false");
  });

  it("renders absence type filter chips with aria-pressed state", () => {
    renderDashboard();
    // "Vacaciones" comes from ABSENCE_LABELS
    const chip = screen.getByRole("button", { name: /vacaciones/i });
    expect(chip).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(chip);
    expect(chip).toHaveAttribute("aria-pressed", "false");
  });

  it("renders an 'All teams' scope chip selected by default", () => {
    renderDashboard();
    const allTeams = screen.getByRole("button", { name: /all teams/i });
    expect(allTeams).toHaveAttribute("aria-pressed", "true");
  });
});
