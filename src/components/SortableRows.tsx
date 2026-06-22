import { CSSProperties, ReactNode } from "react";
import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors, closestCenter } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { TableRow } from "@/components/ui/table";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

interface SortableRowsProps<T extends { id: string }> {
  items: T[];
  enabled: boolean;
  onReorder: (activeId: string, overId: string) => void;
  renderRow: (item: T, dragHandle: ReactNode) => ReactNode;
}

export const SortableRows = <T extends { id: string }>({
  items,
  enabled,
  onReorder,
  renderRow,
}: SortableRowsProps<T>) => {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const handleEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    onReorder(String(active.id), String(over.id));
  };

  if (!enabled) {
    return <>{items.map((item) => renderRow(item, null))}</>;
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleEnd}>
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        {items.map((item) => (
          <SortableRow key={item.id} id={item.id}>
            {(handle) => renderRow(item, handle)}
          </SortableRow>
        ))}
      </SortableContext>
    </DndContext>
  );
};

interface SortableRowProps {
  id: string;
  children: (handle: ReactNode) => ReactNode;
}

const SortableRow = ({ id, children }: SortableRowProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  const handle = (
    <button
      type="button"
      aria-label="Arrastrar para reordenar"
      className={cn(
        "inline-flex h-6 w-6 cursor-grab items-center justify-center rounded text-muted-foreground hover:bg-muted active:cursor-grabbing",
      )}
      {...attributes}
      {...listeners}
    >
      <GripVertical className="h-3.5 w-3.5" />
    </button>
  );

  return (
    <TableRow ref={setNodeRef} style={style}>
      {children(handle)}
    </TableRow>
  );
};
