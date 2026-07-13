import { Hourglass } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { hasWaitingTag } from "@/lib/tasksState";
import { useLang } from "@/context/LanguageContext";

interface WaitingBadgeProps {
  tags: readonly string[] | null | undefined;
}

/**
 * Renders a small "Waiting" chip when the work item carries the `waiting`
 * tag (case-insensitive). Returns null otherwise so it stays inert in rows
 * without the tag.
 */
export const WaitingBadge = ({ tags }: WaitingBadgeProps) => {
  const { t } = useLang();
  if (!hasWaitingTag(tags)) return null;
  return (
    <Badge
      variant="outline"
      className="gap-1 border-status-vacation/40 bg-status-vacation/10 text-status-vacation text-[10px]"
    >
      <Hourglass className="h-3 w-3" />
      {t.tagWaiting}
    </Badge>
  );
};
