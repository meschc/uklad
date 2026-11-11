import { destinationMark } from "@/lib/destinationMark";
import { cn } from "@/lib/utils";

/** Назначение крупной цветной плашкой: цвет у адреса один на всех столах. */
export function DestinationChip({
  destination,
  className,
}: {
  destination: string;
  className?: string;
}) {
  const mark = destinationMark(destination);
  return (
    <span
      className={cn("inline-flex items-center rounded-full px-3 py-1 font-semibold", className)}
      style={{
        backgroundColor: `hsl(var(${mark.token}))`,
        color: mark.darkInk ? "hsl(var(--tag-ink))" : "white",
      }}
    >
      {destination}
    </span>
  );
}
