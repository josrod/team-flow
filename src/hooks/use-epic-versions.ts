import { useCallback, useEffect, useMemo, useState } from "react";

import {
  createEpicVersion,
  deleteEpicVersion,
  listEpicVersionAssignments,
  listEpicVersions,
  setEpicVersion,
  updateEpicVersion,
  type EpicVersion,
  type EpicVersionAssignments,
} from "@/services/epicVersions";

export interface UseEpicVersionsResult {
  versions: EpicVersion[];
  assignments: EpicVersionAssignments;
  versionById: Map<string, EpicVersion>;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  addVersion: (name: string, colorKey: string) => Promise<void>;
  editVersion: (id: string, patch: { name?: string; colorKey?: string }) => Promise<void>;
  removeVersion: (id: string) => Promise<void>;
  assignVersion: (epicId: string, versionId: string | null) => Promise<void>;
}

/** Loads the delivery version catalogue and per-epic assignments. */
export const useEpicVersions = (): UseEpicVersionsResult => {
  const [versions, setVersions] = useState<EpicVersion[]>([]);
  const [assignments, setAssignments] = useState<EpicVersionAssignments>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [list, map] = await Promise.all([
        listEpicVersions(),
        listEpicVersionAssignments(),
      ]);
      setVersions(list);
      setAssignments(map);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const addVersion = useCallback(
    async (name: string, colorKey: string) => {
      const created = await createEpicVersion(name, colorKey, versions.length);
      setVersions((prev) => [...prev, created]);
    },
    [versions.length],
  );

  const editVersion = useCallback(
    async (id: string, patch: { name?: string; colorKey?: string }) => {
      await updateEpicVersion(id, patch);
      setVersions((prev) =>
        prev.map((v) =>
          v.id === id
            ? { ...v, name: patch.name ?? v.name, colorKey: patch.colorKey ?? v.colorKey }
            : v,
        ),
      );
    },
    [],
  );

  const removeVersion = useCallback(async (id: string) => {
    await deleteEpicVersion(id);
    setVersions((prev) => prev.filter((v) => v.id !== id));
    setAssignments((prev) => {
      const next: EpicVersionAssignments = {};
      for (const [epicId, versionId] of Object.entries(prev)) {
        if (versionId !== id) next[epicId] = versionId;
      }
      return next;
    });
  }, []);

  const assignVersion = useCallback(async (epicId: string, versionId: string | null) => {
    await setEpicVersion(epicId, versionId);
    setAssignments((prev) => {
      const next = { ...prev };
      if (versionId === null) delete next[epicId];
      else next[epicId] = versionId;
      return next;
    });
  }, []);

  const versionById = useMemo(
    () => new Map(versions.map((v) => [v.id, v])),
    [versions],
  );

  return {
    versions,
    assignments,
    versionById,
    loading,
    error,
    reload,
    addVersion,
    editVersion,
    removeVersion,
    assignVersion,
  };
};
