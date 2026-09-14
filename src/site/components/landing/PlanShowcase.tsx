import { cn } from "@/lib/utils";
import { c, useT } from "../../lib/copy";

const T = {
  alt: c(
    "План склада: занятые и свободные ячейки, выноска на конкретное место товара",
    "Warehouse floor plan: occupied and free slots, with a callout to one item’s exact place",
  ),
  intake: c("Приёмка", "Intake"),
};

/**
 * Главная картинка витрины — план склада, на котором видно занятость.
 *
 * Это не абстракция «для красоты»: ровно так выглядит экран раскладки в
 * приложении. Обещание лендинга («видно, где лежит товар») должно
 * подтверждаться первым же экраном, иначе оно остаётся словами над стоковой
 * иллюстрацией.
 *
 * Рисунок — SVG, а не скриншот: он переживает смену темы, масштабируется под
 * любую ширину и весит меньше килобайта против сотни у PNG.
 *
 * Скругления здесь продолжают цепочку вложения витрины, а не живут своей
 * жизнью. Плита пола заполняет весь viewBox и получает радиус 11 — при
 * типовой ширине окна масштаб близок к 1,1, то есть на экране это ровно те
 * 12px, которые даёт правило: окно 20 минус его поле 8.
 *
 * Дальше правило работает там, где контейнер обнимает содержимое: секция 10,
 * поле до ячейки 9 → ячейка 1. И в обратную сторону: пульс отстоит от ячейки
 * на 2, значит его радиус 1 + 2 = 3.
 *
 * Секции при этом не «вложены» в пол в смысле правила — между ними и кромкой
 * пола 30 единиц воздуха. Это предметы, стоящие на поверхности, а не панели в
 * контейнере, и радиус им задаёт собственный размер. Правило про вложение
 * касается только плотной посадки, иначе оно вырождается: 11 − 30 меньше нуля.
 */

const SECTION_W = 132;
const SECTION_H = 84;
const COLS = 4;
const ROWS = 3;

/** Стеллажные секции: три ряда по два блока, между ними проход. */
const SECTIONS = [
  { x: 30, y: 46, label: "A" },
  { x: 194, y: 46, label: "B" },
  { x: 358, y: 46, label: "C" },
  { x: 30, y: 190, label: "D" },
  { x: 194, y: 190, label: "E" },
  { x: 358, y: 190, label: "F" },
];

/**
 * Занятость ячеек. Зашита явной маской, а не случайным числом: у «случайной»
 * раскладки регулярно получаются либо почти пустой склад, либо почти полный, а
 * картинка должна показывать рабочую середину — и заполненные зоны у прохода,
 * и запас наверху.
 */
const FILL: boolean[][] = [
  [true, true, true, false, true, true, false, false, true, false, false, false],
  [true, true, true, true, true, false, true, true, false, true, false, false],
  [true, true, false, true, false, true, false, false, true, false, false, false],
  [true, true, true, true, true, true, true, false, true, true, false, true],
  [true, false, true, true, false, true, true, false, false, false, true, false],
  [true, true, true, false, true, false, false, true, false, false, false, false],
];

/** Ячейка, к которой ведёт выноска: та самая «моя коробка». */
const TARGET = { section: 1, cell: 6 };

function cellRect(sectionIndex: number, cellIndex: number) {
  const s = SECTIONS[sectionIndex];
  const pad = 9;
  const gap = 4;
  const w = (SECTION_W - pad * 2 - gap * (COLS - 1)) / COLS;
  const h = (SECTION_H - pad * 2 - gap * (ROWS - 1)) / ROWS;
  const col = cellIndex % COLS;
  const row = Math.floor(cellIndex / COLS);
  return {
    x: s.x + pad + col * (w + gap),
    y: s.y + pad + row * (h + gap),
    w,
    h,
  };
}

export function PlanShowcase({ className }: { className?: string }) {
  const t = useT();
  const target = cellRect(TARGET.section, TARGET.cell);

  return (
    <svg viewBox="0 0 520 300" className={cn("w-full", className)} role="img" aria-label={t(T.alt)}>
      <defs>
        <pattern id="plan-grid" width="24" height="24" patternUnits="userSpaceOnUse">
          <path d="M24 0H0V24" fill="none" stroke="hsl(var(--grid-minor))" strokeWidth="1" />
        </pattern>
        <linearGradient id="plan-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="hsl(var(--canvas-bg))" />
          <stop offset="1" stopColor="hsl(var(--muted))" />
        </linearGradient>
      </defs>

      {/* Плита пола: габарит этажа с «миллиметровкой». Заполняет кадр целиком —
          так поверхность плана совпадает с внутренним полем окна, и между ними
          не появляется второго, паразитного отступа. */}
      <rect x="0" y="0" width="520" height="300" rx="11" fill="url(#plan-fade)" />
      <rect x="0" y="0" width="520" height="300" rx="11" fill="url(#plan-grid)" opacity=".8" />
      <rect
        x="0.5"
        y="0.5"
        width="519"
        height="299"
        rx="10.5"
        fill="none"
        stroke="hsl(var(--floor-edge))"
      />

      {SECTIONS.map((s, si) => (
        <g key={s.label}>
          <rect
            x={s.x}
            y={s.y}
            width={SECTION_W}
            height={SECTION_H}
            rx="10"
            fill="hsl(var(--m-section))"
            opacity=".55"
          />
          <text
            x={s.x + 8}
            y={s.y - 6}
            className="font-mono"
            fontSize="9"
            fontWeight="700"
            fill="hsl(var(--m-section-fg))"
            opacity=".75"
          >
            {s.label}
          </text>

          {FILL[si].map((busy, ci) => {
            const r = cellRect(si, ci);
            const isTarget = si === TARGET.section && ci === TARGET.cell;
            return (
              <rect
                key={ci}
                className="plan-cell"
                x={r.x}
                y={r.y}
                width={r.w}
                height={r.h}
                rx="1"
                fill={
                  isTarget
                    ? "hsl(var(--brand))"
                    : busy
                      ? "hsl(var(--m-section-fg))"
                      : "hsl(var(--background))"
                }
                opacity={isTarget ? 1 : busy ? 0.82 : 0.9}
                // Волна заполнения слева направо: план «собирается» на глазах,
                // а не появляется готовым кадром.
                style={{ animationDelay: `${240 + si * 90 + ci * 26}ms` }}
              />
            );
          })}
        </g>
      ))}

      {/* Пульс вокруг целевой ячейки. */}
      <rect
        x={target.x - 2}
        y={target.y - 2}
        width={target.w + 4}
        height={target.h + 4}
        rx="3"
        fill="none"
        stroke="hsl(var(--brand))"
        strokeWidth="1.5"
        className="animate-float"
        opacity=".7"
      />

      {/* Выноска. Ведёт вверх-вправо, в пустое поле над секцией C. */}
      <path
        d={`M${target.x + target.w} ${target.y + target.h / 2} H${target.x + 66} V28 H${target.x + 120}`}
        fill="none"
        stroke="hsl(var(--muted-foreground))"
        strokeWidth="1"
        strokeDasharray="3 3"
        opacity=".55"
      />
      {/* Адрес ячейки — пилюля. На витрине пилюля означает «к этому можно
          обратиться»: та же форма, что у кнопки и у чипа-анонса, и она
          отделяет живую подпись от геометрии плана. */}
      <g transform={`translate(${target.x + 126} 20)`}>
        <rect width="128" height="17" rx="8.5" fill="hsl(var(--foreground))" />
        <text
          x="9.5"
          y="12"
          fontSize="9.5"
          fontWeight="600"
          className="font-mono"
          fill="hsl(var(--background))"
        >
          УК-1042 · B-01-02-03
        </text>
      </g>

      {/* Зона приёмки и коробка, которая едет оттуда на полку. */}
      <rect x="30" y="248" width="96" height="26" rx="8" fill="hsl(var(--m-stairs))" opacity=".6" />
      <text x="43" y="265" fontSize="10" fontWeight="600" fill="hsl(var(--m-stairs-fg))">
        {t(T.intake)}
      </text>
      {/* Коробка того же цвета, что и целевая ячейка: это один и тот же груз,
          просто в двух моментах времени. */}
      <g className="plan-fly">
        <rect width="13" height="11" rx="1" fill="hsl(var(--brand))" />
        <path d="M6.5 0V11" stroke="hsl(var(--background))" strokeWidth="1" opacity=".5" />
      </g>
    </svg>
  );
}
