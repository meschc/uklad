import { useEffect, useRef, useState } from "react";

/**
 * Число, которое меняется плавно (Кирилл 12 ноя: «переключение данных,
 * особенно в цифрах, сделай плавнее, у нас всё очень грубо»).
 *
 * При смене значения число добегает от старого к новому за `duration-slow`
 * (320 мс) с той же кривой, что у остального движения кабинета. Первый показ —
 * сразу итог: анимировать загрузку экрана от нуля значило бы показывать
 * несуществующие цифры. При «уменьшить движение» в системе — тоже сразу итог.
 *
 *   <AnimatedNumber value={occupancy} format={(n) => `${n} %`} />
 */
const DURATION = 320;
const ease = (t: number) => 1 - Math.pow(1 - t, 3);

function reducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

function useAnimatedNumber(value: number): number {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const frame = useRef(0);

  useEffect(() => {
    const start = from.current;
    if (start === value || reducedMotion()) {
      from.current = value;
      setShown(value);
      return;
    }
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / DURATION);
      const v = start + (value - start) * ease(k);
      from.current = v;
      setShown(v);
      if (k < 1) frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame.current);
  }, [value]);

  return shown;
}

export function AnimatedNumber({
  value,
  format = (n) => Math.round(n).toLocaleString("ru-RU"),
  className,
}: {
  value: number;
  format?: (n: number) => string;
  className?: string;
}) {
  const shown = useAnimatedNumber(value);
  return (
    <span className={className ? `tabular-nums ${className}` : "tabular-nums"}>
      {format(shown)}
    </span>
  );
}
