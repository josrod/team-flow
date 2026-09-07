import { useCallback, useEffect, useRef, useState } from "react";

import { useAuth } from "@/context/AuthContext";
import { useLang } from "@/context/LanguageContext";
import { loadBacklogBoard, type BacklogErrorCode } from "@/services/backlogService";
import type { BacklogCardItem } from "@/lib/backlogBoard";

/** Background sync interval: keeps the board fresh without manual imports. */
const SYNC_INTERVAL_MS = 5 * 60 * 1000;

interface UseBacklogSyncResult {
  cards: BacklogCardItem[];
  baseUrl: string | null;
  loading: boolean;
  error: string | null;
  lastSyncedAt: Date | null;
  reload: (options?: { forceRefresh?: boolean }) => Promise<void>;
}

/**
 * Loads the backlog items board through the service layer and keeps it in sync
 * automatically: on mount, when the tab becomes visible again and on a timer.
 */
export const useBacklogSync = (
  { auto = true, intervalMs = SYNC_INTERVAL_MS }: { auto?: boolean; intervalMs?: number } = {},
): UseBacklogSyncResult => {
  const { user } = useAuth();
  const { t } = useLang();
  const [cards, setCards] = useState<BacklogCardItem[]>([]);
  const [baseUrl, setBaseUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const inFlight = useRef(false);

  const messageFor = useCallback(
    (code: BacklogErrorCode, fallback?: string): string => {
      if (code === "config_unavailable") return t.errAdoConfigUnavailable;
      if (code === "config_incomplete") return t.errIncompleteAdoConfig;
      return fallback ?? t.backlogSyncError;
    },
    [t],
  );

  const reload = useCallback(
    async ({ forceRefresh = false }: { forceRefresh?: boolean } = {}) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setLoading(true);
      setError(null);
      try {
        const result = await loadBacklogBoard({ userId: user?.id, forceRefresh });
        setBaseUrl(result.baseUrl);
        setCards(result.cards);
        setLastSyncedAt(new Date());
        if (result.errorCode) setError(messageFor(result.errorCode, result.errorMessage));
      } catch (err) {
        setError(err instanceof Error ? err.message : t.backlogSyncError);
      } finally {
        inFlight.current = false;
        setLoading(false);
      }
    },
    [user?.id, messageFor, t],
  );

  useEffect(() => {
    if (!auto) return;
    void reload();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void reload();
    }, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === "visible") void reload();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [auto, intervalMs, reload]);

  return { cards, baseUrl, loading, error, lastSyncedAt, reload };
};
