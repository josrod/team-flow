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
  /** Renders the cells of the row. Receives the drag handle node (null when DnD is off). */
  renderCells: (item: T, dragHandle: ReactNode) => ReactNode;
}

export const SortableRows = <T extends { id: string }>({
  items,
  enabled,
  onReorder,
  renderCells,
}: SortableRowsProps<T>) => {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const handleEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    onReorder(String(active.id), String(over.id));
  };

  if (!enabled) {
    return (
      <>
        {items.map((item) => (
          <TableRow key={item.id}>{renderCells(item, null)}</TableRow>
        ))}
      </>
    );
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleEnd}>
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        {items.map((item) => (
          <SortableRow key={item.id} id={item.id} renderCells={(handle) => renderCells(item, handle)} />
        ))}
      </SortableContext>
    </DndContext>
  );
};

interface SortableRowInnerProps {
  id: string;
  renderCells: (handle: ReactNode) => ReactNode;
}

const SortableRow = ({ id, renderCells }: SortableRowInnerProps) => {
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
      {renderCells(handle)}
    </TableRow>
  );
};
