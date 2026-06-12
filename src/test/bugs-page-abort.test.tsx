import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { LanguageProvider } from "@/context/LanguageContext";
import { BugsPage } from "@/pages/BugsPage";
import type { TfsBug } from "@/services/tfs";

// Capture every call made to fetchTfsBugsByIterations so tests can inspect
// the AbortSignal each one received and resolve them at will.
interface PendingCall {
  signal?: AbortSignal;
  resolve: (value: { items: TfsBug[] }) => void;
}
const pendingCalls: PendingCall[] = [];

vi.mock("@/services/tfs", () => ({
  fetchTfsBugsByIterations: vi.fn(
    (_conn: unknown, _paths: unknown, signal?: AbortSignal) =>
      new Promise((resolve) => {
        pendingCalls.push({ signal, resolve });
      }),
  ),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: vi
        .fn()
        .mockResolvedValue({ data: { user: { id: "test-user" } } }),
    },
    from: () => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          server_url: "https://tfs.example.com",
          collection: "DefaultCollection",
          project: "MyProject",
          team: null,
          pat_encrypted: "fake-pat",
          iteration_paths: ["MyProject\\Sprint 1"],
        },
      }),
    }),
  },
}));

// IntersectionObserver is not present in jsdom — capture the callback so
// tests can trigger the sentinel intersection manually.
type IoCallback = (entries: Array<{ isIntersecting: boolean }>) => void;
const ioCallbacks: IoCallback[] = [];
class MockIntersectionObserver {
  callback: IoCallback;
  constructor(cb: IoCallback) {
    this.callback = cb;
    ioCallbacks.push(cb);
  }
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  takeRecords = vi.fn().mockReturnValue([]);
}
Object.defineProperty(window, "IntersectionObserver", {
  writable: true,
  configurable: true,
  value: MockIntersectionObserver,
});

// Track every AbortController constructed during a test so we can identify
// the one created by startLoadMore (always the most recent at that point).
const createdControllers: AbortController[] = [];
const NativeAbortController = globalThis.AbortController;
class TrackedAbortController extends NativeAbortController {
  constructor() {
    super();
    createdControllers.push(this);
  }
}
globalThis.AbortController = TrackedAbortController as unknown as typeof AbortController;

const renderPage = () =>
  render(
    <MemoryRouter>
      <LanguageProvider>
        <BugsPage />
      </LanguageProvider>
    </MemoryRouter>,
  );

const makeBug = (id: number): TfsBug => ({
  id,
  title: `Stale bug ${id}`,
  state: "Active",
  workItemType: "Bug",
  assignedTo: "Someone",
  iterationPath: "MyProject\\Sprint 1",
  areaPath: "MyProject",
  htmlUrl: `https://tfs.example.com/bug/${id}`,
});

describe("BugsPage — AbortController cleanup", () => {
  beforeEach(() => {
    pendingCalls.length = 0;
    ioCallbacks.length = 0;
    createdControllers.length = 0;
  });

  it("aborts the in-flight request when filters change and ignores the stale response", async () => {
    renderPage();

    await waitFor(() => expect(pendingCalls.length).toBe(1));
    const firstCall = pendingCalls[0];
    expect(firstCall.signal?.aborted).toBe(false);

    const searchInput = screen.getByPlaceholderText(/buscar por título/i);
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: "anything" } });
    });

    expect(firstCall.signal?.aborted).toBe(true);

    await act(async () => {
      firstCall.resolve({ items: [makeBug(99999)] });
      await Promise.resolve();
    });

    expect(screen.queryByText(/Stale bug 99999/)).toBeNull();
    expect(screen.queryByText("99999")).toBeNull();
  });

  it("aborts the in-flight request when the page unmounts", async () => {
    const { unmount } = renderPage();

    await waitFor(() => expect(pendingCalls.length).toBe(1));
    const call = pendingCalls[0];
    expect(call.signal?.aborted).toBe(false);

    unmount();

    expect(call.signal?.aborted).toBe(true);

    await act(async () => {
      call.resolve({ items: [makeBug(77777)] });
      await Promise.resolve();
    });
  });

  it("aborts the load-more request when filters change during infinite scroll", async () => {
    renderPage();

    await waitFor(() => expect(pendingCalls.length).toBe(1));

    // Resolve with more than PAGE_SIZE (30) bugs so the sentinel renders and
    // infinite-scroll loading is reachable.
    const items = Array.from({ length: 45 }, (_, i) => makeBug(1000 + i));
    await act(async () => {
      pendingCalls[0].resolve({ items });
      await Promise.resolve();
    });

    // Wait for the IntersectionObserver to be wired up to the sentinel.
    await waitFor(() => expect(ioCallbacks.length).toBeGreaterThan(0));

    const controllersBeforeLoadMore = createdControllers.length;

    // Simulate the sentinel intersecting — this triggers startLoadMore which
    // creates a fresh AbortController and a 400 ms work timer.
    await act(async () => {
      ioCallbacks[ioCallbacks.length - 1]([{ isIntersecting: true }]);
      await Promise.resolve();
    });

    expect(createdControllers.length).toBeGreaterThan(controllersBeforeLoadMore);
    const loadMoreController = createdControllers[createdControllers.length - 1];
    expect(loadMoreController.signal.aborted).toBe(false);

    // Change a filter while the load-more work is still pending — the
    // filter-change effect must call cancelLoadMore() and abort the signal.
    const searchInput = screen.getByPlaceholderText(/buscar por título/i);
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: "1000" } });
    });

    expect(loadMoreController.signal.aborted).toBe(true);
  });
});
