import { cn } from "@/lib/utils";

type SeverityLevel = "critical" | "high" | "medium" | "low" | "trivial" | "unknown";

export const severityConfig: Record<SeverityLevel, { label: string; className: string }> = {
  critical: {
    label: "Critical",
    className:
      "bg-[hsl(var(--severity-critical))]/10 text-[hsl(var(--severity-critical))] border-[hsl(var(--severity-critical))]/30",
  },
  high: {
    label: "High",
    className:
      "bg-[hsl(var(--severity-high))]/10 text-[hsl(var(--severity-high))] border-[hsl(var(--severity-high))]/30",
  },
  medium: {
    label: "Medium",
    className:
      "bg-[hsl(var(--severity-medium))]/10 text-[hsl(var(--severity-medium))] border-[hsl(var(--severity-medium))]/30",
  },
  low: {
    label: "Low",
    className:
      "bg-[hsl(var(--severity-low))]/10 text-[hsl(var(--severity-low))] border-[hsl(var(--severity-low))]/30",
  },
  trivial: {
    label: "Trivial",
    className: "bg-muted text-muted-foreground border-border",
  },
  unknown: {
    label: "—",
    className: "text-muted-foreground",
  },
};

export function normalizeSeverity(raw?: string | null): SeverityLevel {
  if (!raw) return "unknown";
  const lower = raw.toLowerCase().trim();

  // Critical / Blocker / Sev 1
  if (
    lower.includes("critical") ||
    lower.includes("blocker") ||
    lower.startsWith("1 ") ||
    lower === "1" ||
    lower === "sev1" ||
    lower === "sev 1"
  ) {
    return "critical";
  }

  // High / Major / Sev 2
  if (
    lower.includes("high") ||
    lower.includes("major") ||
    lower.startsWith("2 ") ||
    lower === "2" ||
    lower === "sev2" ||
    lower === "sev 2"
  ) {
    return "high";
  }

  // Medium / Moderate / Normal / Sev 3
  if (
    lower.includes("medium") ||
    lower.includes("moderate") ||
    lower.includes("normal") ||
    lower.startsWith("3 ") ||
    lower === "3" ||
    lower === "sev3" ||
    lower === "sev 3"
  ) {
    return "medium";
  }

  // Low / Minor / Sev 4
  if (
    lower.includes("low") ||
    lower.includes("minor") ||
    lower.startsWith("4 ") ||
    lower === "4" ||
    lower === "sev4" ||
    lower === "sev 4"
  ) {
    return "low";
  }

  // Trivial / Cosmetic / Enhancement / Sev 5
  if (
    lower.includes("trivial") ||
    lower.includes("cosmetic") ||
    lower.includes("enhancement") ||
    lower.startsWith("5 ") ||
    lower === "5" ||
    lower === "sev5" ||
    lower === "sev 5"
  ) {
    return "trivial";
  }

  return "unknown";
}

export function SeverityBadge({ severity }: { severity?: string | null }) {
  const level = normalizeSeverity(severity);
  const cfg = severityConfig[level];

  if (level === "unknown") {
    return <span className="text-muted-foreground text-xs">{severity ?? "—"}</span>;
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
