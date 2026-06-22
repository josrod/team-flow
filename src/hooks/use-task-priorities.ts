import { useCallback, useEffect, useState } from "react";
import {
  buildExportPayload,
  clearPriorities,
  loadPriorities,
  mergePriorities,
  moveTo,
  parseImportPayload,
  PriorityLevel,
  savePriorities,
  setPriorityLevel,
  STORAGE_KEY,
  TaskPriorityMap,
} from "@/lib/taskPriority";

const downloadJson = (filename: string, payload: unknown): void => {
  const json = "\uFEFF" + JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
};

export const useTaskPriorities = () => {
  const [priorities, setPriorities] = useState<TaskPriorityMap>(() => loadPriorities());

  // Listen for cross-tab updates so two open tabs stay in sync.
  useEffect(() => {
    const handler = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) setPriorities(loadPriorities());
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const commit = useCallback((next: TaskPriorityMap) => {
    setPriorities(next);
    savePriorities(next);
  }, []);

  const setLevel = useCallback(
    (id: string, level: PriorityLevel) => {
      commit(setPriorityLevel(priorities, id, level));
    },
    [priorities, commit],
  );

  const move = useCallback(
    (id: string, targetLevel: PriorityLevel, targetIndex: number) => {
      commit(moveTo(priorities, id, targetLevel, targetIndex));
    },
    [priorities, commit],
  );

  const reset = useCallback(() => {
    commit(clearPriorities());
  }, [commit]);

  const exportJson = useCallback(() => {
    const today = new Date().toISOString().slice(0, 10);
    downloadJson(`prioridades-tareas-${today}.json`, buildExportPayload(priorities));
  }, [priorities]);

  const importJson = useCallback(
    async (file: File) => {
      const raw = await file.text();
      const incoming = parseImportPayload(raw);
      commit(mergePriorities(priorities, incoming));
    },
    [priorities, commit],
  );

  return { priorities, setLevel, move, reset, exportJson, importJson };
};
