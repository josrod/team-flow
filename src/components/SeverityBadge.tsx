import { cn } from "@/lib/utils";

type SeverityLevel = "critical" | "high" | "medium" | "low" | "unknown";

export const severityConfig: Record<SeverityLevel, { label: string; className: string }> = {
  critical: {
    label: "Critical",
    className: "bg-[hsl(var(--severity-critical))]/10 text-[hsl(var(--severity-critical))] border-[hsl(var(--severity-critical))]/30",
  },
  high: {
    label: "High",
    className: "bg-[hsl(var(--severity-high))]/10 text-[hsl(var(--severity-high))] border-[hsl(var(--severity-high))]/30",
  },
  medium: {
    label: "Medium",
    className: "bg-[hsl(var(--severity-medium))]/10 text-[hsl(var(--severity-medium))] border-[hsl(var(--severity-medium))]/30",
  },
  low: {
    label: "Low",
    className: "bg-[hsl(var(--severity-low))]/10 text-[hsl(var(--severity-low))] border-[hsl(var(--severity-low))]/30",
  },
  unknown: {
    label: "—",
    className: "text-muted-foreground",
  },
};

function normalizeSeverity(raw?: string | null): SeverityLevel {
  if (!raw) return "unknown";
  const lower = raw.toLowerCase().trim();
  if (lower.includes("critical") || lower === "1" || lower === "1 - critical") return "critical";
  if (lower.includes("high") || lower === "2" || lower === "2 - high") return "high";
  if (lower.includes("medium") || lower === "3" || lower === "3 - medium") return "medium";
  if (lower.includes("low") || lower === "4" || lower === "4 - low") return "low";
  return "unknown";
}

export function SeverityBadge({ severity }: { severity?: string | null }) {
  const level = normalizeSeverity(severity);
  const cfg = severityConfig[level];

  if (level === "unknown") {
    return <span className="text-muted-foreground text-xs">—</span>;
  }

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
        cfg.className,
      )}
    >
      {severity}
    </span>
  );
}
