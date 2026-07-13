import { describe, it, expect } from "vitest";
import {
  computeWip,
  hasWaitingTag,
  isBugType,
  normalizeState,
} from "@/lib/tasksState";

describe("normalizeState", () => {
  it("maps common TFS state strings to normalized buckets", () => {
    expect(normalizeState("Active")).toBe("active");
    expect(normalizeState("In Progress")).toBe("active");
    expect(normalizeState("Committed")).toBe("active");
    expect(normalizeState("New")).toBe("pending");
    expect(normalizeState("To Do")).toBe("pending");
    expect(normalizeState("Blocked")).toBe("blocked");
    expect(normalizeState("Done")).toBe("done");
    expect(normalizeState("Completed")).toBe("done");
    expect(normalizeState("Resolved")).toBe("resolved");
    expect(normalizeState("Closed")).toBe("closed");
  });
});

describe("isBugType", () => {
  it("only returns true for 'bug' (case-insensitive)", () => {
    expect(isBugType("Bug")).toBe(true);
    expect(isBugType("bug")).toBe(true);
    expect(isBugType("BUG")).toBe(true);
    expect(isBugType("Task")).toBe(false);
    expect(isBugType("User Story")).toBe(false);
    expect(isBugType(undefined)).toBe(false);
  });
});

describe("computeWip", () => {
  it("counts only Open/In Progress tasks and bugs", () => {
    const items = [
      { type: "Task", state: "Active" },
      { type: "Task", state: "In Progress" },
      { type: "Task", state: "New" },
      { type: "Bug", state: "Active" },
      { type: "Bug", state: "New" },
    ];
    expect(computeWip(items)).toEqual({
      activeTasks: 2,
      activeBugs: 1,
      pendingTasks: 1,
      pendingBugs: 1,
      total: 5,
    });
  });

  it("excludes closed and resolved tasks and bugs", () => {
    const items = [
      { type: "Task", state: "Active" },
      { type: "Task", state: "Closed" },
      { type: "Task", state: "Done" },
      { type: "Task", state: "Completed" },
      { type: "Bug", state: "Resolved" },
      { type: "Bug", state: "Closed" },
    ];
    expect(computeWip(items)).toEqual({
      activeTasks: 1,
      activeBugs: 0,
      pendingTasks: 0,
      pendingBugs: 0,
      total: 1,
    });
  });

  it("excludes blocked items from WIP", () => {
    const items = [
      { type: "Task", state: "Blocked" },
      { type: "Bug", state: "Blocked" },
      { type: "Task", state: "Active" },
    ];
    expect(computeWip(items).total).toBe(1);
  });

  it("returns zeros for an empty list", () => {
    expect(computeWip([])).toEqual({
      activeTasks: 0,
      activeBugs: 0,
      pendingTasks: 0,
      pendingBugs: 0,
      total: 0,
    });
  });

  it("groups pending items separately from active ones", () => {
    const items = [
      { type: "Task", state: "New" },
      { type: "Task", state: "New" },
      { type: "Bug", state: "New" },
    ];
    expect(computeWip(items)).toMatchObject({
      pendingTasks: 2,
      pendingBugs: 1,
      activeTasks: 0,
      activeBugs: 0,
      total: 3,
    });
  });
});

describe("hasWaitingTag", () => {
  it("detects the waiting tag case-insensitively", () => {
    expect(hasWaitingTag(["waiting"])).toBe(true);
    expect(hasWaitingTag(["WAITING"])).toBe(true);
    expect(hasWaitingTag(["Waiting", "bug"])).toBe(true);
  });

  it("returns false for null/empty/absent", () => {
    expect(hasWaitingTag(null)).toBe(false);
    expect(hasWaitingTag(undefined)).toBe(false);
    expect(hasWaitingTag([])).toBe(false);
    expect(hasWaitingTag(["urgent", "bug"])).toBe(false);
  });

  it("does not match substrings like 'awaiting' or 'waiting-review'", () => {
    expect(hasWaitingTag(["awaiting"])).toBe(false);
    expect(hasWaitingTag(["waiting-review"])).toBe(false);
    expect(hasWaitingTag(["prewaiting"])).toBe(false);
  });
});
