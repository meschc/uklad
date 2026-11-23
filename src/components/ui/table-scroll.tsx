import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Обёртка таблицы кабинета — одна на все экраны (ДС, ADR 0007): без рамок,
 * на всю ширину экрана, если колонке не хватает (остальное содержимое остаётся
 * обычной ширины, см. `.table-bleed` в index.css), а когда не хватает и
 * экрана — прокрутка по горизонтали с тенью у края, где есть продолжение.
 */
export function TableScroll({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ left: false, right: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const left = el.scrollLeft > 1;
      const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
      setEdge((p) => (p.left === left && p.right === right ? p : { left, right }));
    };
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    // Ширина таблицы меняется от данных, а колонки — от окна: следим за обоими.
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    ro?.observe(el);
    if (el.firstElementChild) ro?.observe(el.firstElementChild);
    return () => {
      el.removeEventListener("scroll", measure);
      ro?.disconnect();
    };
  }, []);

  return (
    <div className={cn("table-bleed relative", className)}>
      <div ref={ref} className="scrollbar-thin overflow-x-auto" data-testid="table-scroll">
        {children}
      </div>
      <span
        aria-hidden
        data-edge="left"
        className={cn(
          "pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-foreground/10 to-transparent transition-opacity",
          edge.left ? "opacity-100" : "opacity-0",
        )}
      />
      <span
        aria-hidden
        data-edge="right"
        className={cn(
          "pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-foreground/10 to-transparent transition-opacity",
          edge.right ? "opacity-100" : "opacity-0",
        )}
      />
    </div>
  );
}

/** Классы шапки и строки таблицы — одни на все экраны (без фона, линия снизу). */
export const TABLE_HEAD = "text-xs text-muted-foreground";
export const TABLE_HEAD_ROW = "border-b border-border text-left";
export const TABLE_ROW = "border-b border-border last:border-0";
