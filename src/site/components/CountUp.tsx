import { useEffect, useRef, useState } from "react";

const DURATION_MS = 1100;

/**
 * Число, которое досчитывается при появлении в кадре.
 *
 * Считает не через `setInterval`, а через `requestAnimationFrame` с
 * easing-кривой: линейный счётчик выглядит как загрузка, а замедляющийся —
 * как «вот сколько получилось».
 *
 * Разметка сразу содержит конечное значение в `aria-label`, чтобы скринридер
 * прочитал итог, а не поймал случайное число в середине анимации.
 */
export function CountUp({
  to,
  prefix = "",
  suffix = "",
  className,
}: {
  to: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  // Среду проверяем при первом рендере, а не в эффекте. Там, где анимации не
  // будет — нет наблюдателя, страница собирается в статику, человек попросил
  // меньше движения, — число должно быть готовым сразу. Эффект успел бы
  // показать ноль и только потом исправиться на настоящее значение.
  const [instant] = useState(
    () =>
      typeof IntersectionObserver === "undefined" ||
      (typeof window !== "undefined" &&
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches),
  );
  const [counted, setCounted] = useState(0);
  const value = instant ? to : counted;

  useEffect(() => {
    const el = ref.current;
    if (!el || instant) return;

    let frame = 0;
    let start = 0;

    const step = (now: number) => {
      if (!start) start = now;
      const p = Math.min(1, (now - start) / DURATION_MS);
      const eased = 1 - Math.pow(1 - p, 3);
      setCounted(Math.round(to * eased));
      if (p < 1) frame = requestAnimationFrame(step);
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        frame = requestAnimationFrame(step);
      },
      { threshold: 0.4 },
    );

    io.observe(el);
    return () => {
      io.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [to, instant]);

  return (
    <span ref={ref} className={className} aria-label={`${prefix}${to}${suffix}`}>
      <span aria-hidden="true">
        {prefix}
        {value.toLocaleString("ru-RU")}
        {suffix}
      </span>
    </span>
  );
}
