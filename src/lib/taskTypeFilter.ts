// Centralized logic for the task "type" filter so that Task/Bug behave
// identically across every view (Tasks, Bugs, Features…).

export type TaskTypeView = "tasks" | "bugs" | "features" | string;

/**
 * Returns true when a task type must be hidden from the given view.
 * Currently we exclude "Product Backlog Item" from the Tasks view, which
 * is meant to show only Task and Bug.
 */
export const isExcludedTaskType = (type: string, view: TaskTypeView): boolean => {
  if (!type) return false;
  if (view === "tasks" && /product backlog item/i.test(type)) return true;
  return false;
};

/**
 * Returns the colour token used to render a type chip.
 * Bugs reuse the "sick" status colour; everything else uses "info".
 */
export const getTaskTypeColor = (type: string): string => {
  return /bug/i.test(type) ? "hsl(var(--status-sick))" : "hsl(var(--status-info))";
};

/**
 * Computes the distinct, view-aware list of task types present in `tasks`,
 * sorted alphabetically. In the Tasks view the list is restricted to
 * Task and Bug so that no other type (e.g. Product Backlog Item) leaks in.
 */
export const computeAvailableTaskTypes = <T extends { type: string }>(
  tasks: readonly T[],
  view: TaskTypeView,
): string[] => {
  const set = new Set<string>();
  tasks.forEach((t) => {
    if (!t.type) return;
    if (isExcludedTaskType(t.type, view)) return;
    set.add(t.type);
  });
  const types = Array.from(set).sort((a, b) => a.localeCompare(b));
  if (view === "tasks") {
    return types.filter((type) => /^(Task|Bug)$/i.test(type));
  }
  return types;
};
