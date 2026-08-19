import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/context/AuthContext";
import { useLang } from "@/context/LanguageContext";
import { loadWaitingBoard, type WaitingBoardErrorCode } from "@/services/waitingBoardService";
import type { WaitingItem } from "@/lib/waitingGroups";

interface UseWaitingBoardResult {
  items: WaitingItem[];
  baseUrl: string | null;
  loading: boolean;
  error: string | null;
  reload: (options?: { forceRefresh?: boolean }) => Promise<void>;
}

/**
 * Loads the waiting board through the service layer, reusing the TFS result
 * cache so several views (board, digest, alert centre) share one fetch.
 */
export const useWaitingBoard = ({ auto = true }: { auto?: boolean } = {}): UseWaitingBoardResult => {
  const { user } = useAuth();
  const { t } = useLang();
  const [items, setItems] = useState<WaitingItem[]>([]);
  const [baseUrl, setBaseUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messageFor = useCallback(
    (code: WaitingBoardErrorCode, fallback?: string): string => {
      if (code === "config_unavailable") return t.errAdoConfigUnavailable;
      if (code === "config_incomplete") return t.errIncompleteAdoConfig;
      return fallback ?? "Unknown error";
    },
    [t],
  );

  const reload = useCallback(
    async ({ forceRefresh = false }: { forceRefresh?: boolean } = {}) => {
      setLoading(true);
      setError(null);
      try {
        const result = await loadWaitingBoard({ userId: user?.id, forceRefresh });
        setBaseUrl(result.baseUrl);
        if (result.errorCode) {
          setItems([]);
          setError(messageFor(result.errorCode, result.errorMessage));
          return;
        }
        setItems(result.items);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    },
    [user?.id, messageFor],
  );

  useEffect(() => {
    if (!auto) return;
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, auto]);

  return { items, baseUrl, loading, error, reload };
};
