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
  id,
  as: Tag = "div",
}: {
  children: ReactNode;
  /** Задержка каскада, мс. */
  delay?: number;
  className?: string;
  /** Якорь: на блок ведёт ссылка вида `#ideas` с той же страницы. */
  id?: string;
  as?: "div" | "section" | "li" | "article";
}) {
  const ref = useRef<HTMLElement>(null);
  // Наблюдателя может не быть: старый браузер, тестовая среда, сборка страниц
  // в статику. Проверяем это при первом рендере, а не в эффекте, — иначе
  // собранная страница уезжает в файл с невидимым блоком, и тот, кто скриптов
  // не выполняет, видит пустоту. Анимация появления не должна решать, увидит
  // ли человек текст вообще.
  const [noObserver] = useState(() => typeof IntersectionObserver === "undefined");
  const [seen, setSeen] = useState(false);
  const shown = noObserver || seen;

  useEffect(() => {
    const el = ref.current;
    if (!el || noObserver) return;

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setSeen(true);
        io.disconnect();
      },
      // Нижняя граница поднята: блок проявляется, когда вошёл в кадр по-
      // настоящему, а не краем первого пикселя.
      { rootMargin: "0px 0px -12% 0px", threshold: 0.05 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [noObserver]);

  return (
    <Tag
      ref={ref as never}
      id={id}
      className={cn("reveal", shown && "is-in", className)}
      style={{ "--reveal-delay": `${delay}ms` } as React.CSSProperties}
    >
      {children}
    </Tag>
  );
}
