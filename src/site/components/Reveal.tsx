import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Появление блока при входе в кадр. Один IntersectionObserver на элемент,
 * дальше вся анимация — на CSS (`.reveal` / `.is-in` в `site.css`).
 *
 * Наблюдение снимается сразу после срабатывания: блок должен появиться один
 * раз. Страница, которая заново «проявляет» уже прочитанный блок при скролле
 * вверх, ощущается не живой, а дёрганой.
 *
 * `as` — чтобы обёртка не ломала семантику: секцию можно оставить `section`,
 * элемент списка — `li`.
 */
export function Reveal({
  children,
  delay = 0,
  className,
  as: Tag = "div",
}: {
  children: ReactNode;
  /** Задержка каскада, мс. */
  delay?: number;
  className?: string;
  as?: "div" | "section" | "li" | "article";
}) {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Наблюдателя может не быть в старом окружении (и в тестовой среде) —
    // тогда просто показываем блок, а не оставляем страницу пустой.
    if (typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setShown(true);
        io.disconnect();
      },
      // Нижняя граница поднята: блок проявляется, когда вошёл в кадр по-
      // настоящему, а не краем первого пикселя.
      { rootMargin: "0px 0px -12% 0px", threshold: 0.05 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag
      ref={ref as never}
      className={cn("reveal", shown && "is-in", className)}
      style={{ "--reveal-delay": `${delay}ms` } as React.CSSProperties}
    >
      {children}
    </Tag>
  );
}
