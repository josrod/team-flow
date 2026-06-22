import { useState } from "react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { PriorityBadge } from "@/components/PriorityBadge";
import { PRIORITY_LEVELS, PriorityLevel } from "@/lib/taskPriority";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface PrioritySelectProps {
  value: PriorityLevel;
  onChange: (level: PriorityLevel) => void;
}

export const PrioritySelect = ({ value, onChange }: PrioritySelectProps) => {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Cambiar prioridad personal (actual: ${value})`}
          className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
        >
          <PriorityBadge level={value} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-44 p-1" align="start">
        <div className="flex flex-col gap-0.5" role="listbox" aria-label="Prioridad personal">
          {PRIORITY_LEVELS.map((level) => (
            <button
              key={level}
              type="button"
              role="option"
              aria-selected={value === level}
              onClick={() => {
                onChange(level);
                setOpen(false);
              }}
              className={cn(
                "flex items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-muted",
                value === level && "bg-muted",
              )}
            >
              <PriorityBadge level={level} />
              {value === level && <Check className="h-3.5 w-3.5 text-muted-foreground" />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};
