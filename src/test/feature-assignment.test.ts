import { describe, it, expect } from "vitest";
import { assignTasksToFeatures, ORPHAN_FEATURE_ID } from "@/lib/featureAssignment";
import type { TfsWorkItem } from "@/services/tfs";

const feature = (over: Partial<TfsWorkItem> & { id: number }): TfsWorkItem => ({
  title: `Feature ${over.id}`,
  state: "Active",
  workItemType: "Feature",
  ...over,
});

const task = (over: Partial<TfsWorkItem> & { id: number }): TfsWorkItem => ({
  title: `Task ${over.id}`,
  state: "To Do",
  workItemType: "Task",
  ...over,
});

describe("assignTasksToFeatures", () => {
  it("assigns each task to exactly one feature via System.Parent", () => {
    const features = [
      feature({ id: 1, areaPath: "P\\A" }),
      feature({ id: 2, areaPath: "P\\B" }),
    ];
    const tasks = [
      task({ id: 10, parentId: 1 }),
      task({ id: 11, parentId: 1 }),
      task({ id: 12, parentId: 2 }),
    ];
    const out = assignTasksToFeatures(features, tasks);
    expect(out.find((f) => f.id === "1")?.taskCount).toBe(2);
    expect(out.find((f) => f.id === "2")?.taskCount).toBe(1);
    const total = out.reduce((acc, f) => acc + f.taskCount, 0);
    expect(total).toBe(tasks.length);
  });

  it("falls back to areaPath when parentId is missing", () => {
    const features = [feature({ id: 1, areaPath: "P\\A" })];
    const tasks = [task({ id: 10, areaPath: "P\\A" }), task({ id: 11, areaPath: "P\\A" })];
    const out = assignTasksToFeatures(features, tasks);
    expect(out.find((f) => f.id === "1")?.taskCount).toBe(2);
    expect(out.reduce((a, f) => a + f.taskCount, 0)).toBe(2);
  });

  it("never double-counts a task that matches both parentId and areaPath", () => {
    const features = [
      feature({ id: 1, areaPath: "P\\A" }),
      feature({ id: 2, areaPath: "P\\A" }),
    ];
    const tasks = [task({ id: 10, parentId: 2, areaPath: "P\\A" })];
    const out = assignTasksToFeatures(features, tasks);
    expect(out.find((f) => f.id === "2")?.taskCount).toBe(1);
    expect(out.find((f) => f.id === "1")?.taskCount).toBe(0);
    expect(out.reduce((a, f) => a + f.taskCount, 0)).toBe(1);
  });

  it("groups unmatched tasks under an orphan bucket", () => {
    const features = [feature({ id: 1, areaPath: "P\\A" })];
    const tasks = [
      task({ id: 10, parentId: 1 }),
      task({ id: 99, areaPath: "P\\Z" }),
      task({ id: 100 }),
    ];
    const out = assignTasksToFeatures(features, tasks);
    const orphan = out.find((f) => f.id === ORPHAN_FEATURE_ID);
    expect(orphan?.taskCount).toBe(2);
    expect(out.reduce((a, f) => a + f.taskCount, 0)).toBe(tasks.length);
  });

  it("per-card counts always sum to the global task total (mixed dataset)", () => {
    const features = [
      feature({ id: 1, areaPath: "P\\A" }),
      feature({ id: 2, areaPath: "P\\B" }),
      feature({ id: 3, areaPath: "P\\C" }),
    ];
    const tasks = [
      task({ id: 100, parentId: 1 }),
      task({ id: 101, parentId: 2, areaPath: "P\\A" }),
      task({ id: 102, areaPath: "P\\C" }),
      task({ id: 103, areaPath: "P\\B" }),
      task({ id: 104, parentId: 999 }), // orphan: parent missing
      task({ id: 105 }), // orphan: nothing
      task({ id: 106, areaPath: "P\\UNKNOWN" }), // orphan
    ];
    const out = assignTasksToFeatures(features, tasks);
    const sum = out.reduce((a, f) => a + f.taskCount, 0);
    expect(sum).toBe(tasks.length);
  });

  it("counts done tasks per feature using normalized state", () => {
    const features = [feature({ id: 1 })];
    const tasks = [
      task({ id: 10, parentId: 1, state: "Done" }),
      task({ id: 11, parentId: 1, state: "Closed" }),
      task({ id: 12, parentId: 1, state: "Active" }),
    ];
    const out = assignTasksToFeatures(features, tasks);
    expect(out[0].doneCount).toBe(2);
    expect(out[0].taskCount).toBe(3);
  });

  it("returns empty when there are no features and no tasks", () => {
    expect(assignTasksToFeatures([], [])).toEqual([]);
  });
});
