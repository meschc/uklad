import { useEffect, useRef, useState } from "react";

/**
 * Число, которое меняется с прокруткой и лёгким размытием (Кирилл, 20 окт):
 * больше — новое приходит сверху, меньше — снизу. Старое значение уходит в
 * обратную сторону. Ширина держится по новому числу, цифры моноширинные.
 */
export function RollNumber({ value, format }: { value: number; format: (n: number) => string }) {
  const prev = useRef(value);
  const [roll, setRoll] = useState<{ from: number; dir: 1 | -1; key: number } | null>(null);

  useEffect(() => {
    if (prev.current === value) return;
    setRoll((r) => ({
      from: prev.current,
      dir: value > prev.current ? 1 : -1,
      key: (r?.key ?? 0) + 1,
    }));
    prev.current = value;
  }, [value]);

  return (
    <span className="relative inline-grid overflow-hidden align-bottom tabular-nums">
      <span
        key={`in-${roll?.key ?? 0}`}
        className={roll ? (roll.dir > 0 ? "wh-roll-in-down" : "wh-roll-in-up") : undefined}
        style={{ gridArea: "1 / 1" }}
      >
        {format(value)}
      </span>
      {roll && (
        <span
          key={`out-${roll.key}`}
          aria-hidden
          className={roll.dir > 0 ? "wh-roll-out-down" : "wh-roll-out-up"}
          style={{ gridArea: "1 / 1" }}
        >
          {format(roll.from)}
        </span>
      )}
    </span>
  );
}
