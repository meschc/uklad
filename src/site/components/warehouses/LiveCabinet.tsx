import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/*
 * Живые экраны кабинета на первом экране (Кирилл 31 окт: «интерактивные
 * элементы, реакция на наведение и кнопки, без перехода между страницами»).
 *
 * Это не встроенный кабинет, а его макет в HTML: тот же вид, что у `/app/`,
 * но свои маленькие данные и ни строчки из стора. Кабинет тянет за собой
 * Zustand, посев и localStorage — на лендинге это сотни килобайт и чужое
 * сохранение в браузере посетителя.
 *
 * Окно нарисовано в размере 1240×640 и масштабируется под колонку целиком,
 * как картинка: так раскладка не разъезжается на телефоне. Цвета светлые в
 * обеих темах — окно кабинета на лендинге всегда светлое, как и скриншоты,
 * которые оно заменило. Движется одно за раз и медленно: рядом ASCII-поле,
 * и второй «живой» слой утяжелил бы первый экран.
 */

export const LIVE_W = 1240;
export const LIVE_H = 640;

const BLUE = "#2463eb";

/** Окно фиксированного размера, вписанное в ширину родителя. */
export function ScaledWindow({ children }: { children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setScale(el.clientWidth / LIVE_W || 1);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={box} className="relative aspect-[1240/640] w-full overflow-hidden">
      <div
        style={{ width: LIVE_W, height: LIVE_H, transform: `scale(${scale})` }}
        className="absolute left-0 top-0 origin-top-left text-[#16181d]"
      >
        {children}
      </div>
    </div>
  );
}

/** Повтор раз в `ms`, пока вкладка видна и движение не выключено. */
function useEvery(ms: number, fn: () => void, on = true) {
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  });
  useEffect(() => {
    if (!on) return;
    const still =
      typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (still) return;
    const id = window.setInterval(() => {
      if (!document.hidden) ref.current();
    }, ms);
    return () => window.clearInterval(id);
  }, [ms, on]);
}

const NAV = [
  { id: "plan", label: "План склада" },
  { id: "tasks", label: "Задания", badge: 11 },
  { id: "chat", label: "Чат", badge: 2 },
  { id: "print", label: "Печать" },
  { id: "spec", label: "О складе" },
  { id: "stats", label: "Аналитика" },
];

/** Боковое меню кабинета: та же колонка, что в `/app/`. */
function Rail({ active }: { active: string }) {
  return (
    <aside className="flex w-[200px] shrink-0 flex-col gap-1 border-r border-[#ececef] bg-[#fbfbfc] p-3">
      <div className="mb-3 flex items-center gap-2.5 px-2 py-1.5">
        <span className="flex size-8 items-center justify-center rounded-lg bg-[#16181d] text-sm font-semibold text-white">
          У
        </span>
        <span className="text-[15px] font-semibold">Уклад</span>
      </div>
      {NAV.map((n) => (
        <span
          key={n.id}
          className={cn(
            "flex h-9 items-center justify-between rounded-lg px-3 text-sm",
            n.id === active ? "bg-[#e8effd] font-medium text-[#2463eb]" : "text-[#3b3e46]",
          )}
        >
          {n.label}
          {n.badge && (
            <span className="rounded-full bg-[#2463eb] px-1.5 text-[11px] font-semibold leading-[18px] text-white">
              {n.badge}
            </span>
          )}
        </span>
      ))}
    </aside>
  );
}

/* ——— План склада ——— */

const ROWS = ["A", "B", "C"];
const SECTIONS = 12;
const CELL_W = 48;
const CELL_H = 44;
const GAP = 4;
const AISLE = 36;
const ROW_GAP = 34;
const PLAN_X = 28;
const PLAN_Y = 32;
const ROW_STEP = CELL_H * 2 + AISLE + ROW_GAP;

const GOODS = [
  "Худи с капюшоном, XL",
  "Кроссовки беговые, 43",
  "Пальто шерстяное, M",
  "Термокружка 450 мл",
  "Рюкзак городской 20 л",
  "Футболка базовая, S",
  "Набор контейнеров",
  "Плед флисовый",
];

interface Cell {
  id: string;
  address: string;
  x: number;
  y: number;
  /** Сторона прохода: 0 — верхняя линия ряда, 1 — нижняя. */
  side: 0 | 1;
  fill: number;
  goods: string;
  qty: number;
}

/** Детерминированный шум: одинаковый план при каждом показе и в предрендере. */
function noise(i: number) {
  const s = Math.sin(i * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

function buildCells(): Cell[] {
  const cells: Cell[] = [];
  ROWS.forEach((row, r) => {
    for (const side of [0, 1] as const) {
      for (let s = 0; s < SECTIONS; s++) {
        const i = cells.length;
        const fill = noise(i + 3) < 0.18 ? 0 : 0.25 + noise(i) * 0.75;
        cells.push({
          id: `${row}${side}${s}`,
          address: `${row}-0${side + 1}-${String(s + 1).padStart(2, "0")}`,
          x: PLAN_X + s * (CELL_W + GAP),
          y: PLAN_Y + r * ROW_STEP + side * (CELL_H + AISLE),
          side,
          fill,
          goods: GOODS[Math.floor(noise(i + 7) * GOODS.length)],
          qty: fill ? Math.round(4 + fill * 60) : 0,
        });
      }
    }
  });
  return cells;
}

/** Порядок обхода сборщика: занятые ячейки вразброс по складу. */
function pickRoute(cells: Cell[]) {
  return cells.filter((c, i) => c.fill > 0.3 && noise(i + 11) > 0.62);
}

const CELLS = buildCells();
const ROUTE = pickRoute(CELLS);

export function LivePlan() {
  const cells = CELLS;
  const route = ROUTE;
  const [hover, setHover] = useState<Cell | null>(null);
  const [heat, setHeat] = useState(false);
  const [step, setStep] = useState(0);
  const target = route[step % route.length];

  useEvery(3200, () => setStep((s) => s + 1));

  // Сборщик стоит в проходе напротив ячейки, а не на ней.
  const picker = {
    x: target.x + CELL_W / 2,
    y: target.side === 0 ? target.y + CELL_H + AISLE / 2 : target.y - AISLE / 2,
  };
  const busy = cells.filter((c) => c.fill > 0).length;

  return (
    <div className="flex h-full">
      <Rail active="plan" />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-[#ececef] px-5">
          <span className="text-[15px] font-semibold">Складская 5 · Этаж 1</span>
          <div className="flex rounded-lg bg-[#f2f3f5] p-0.5 text-[13px]">
            {[
              { on: !heat, label: "2D-план", click: () => setHeat(false) },
              { on: heat, label: "Загруженность", click: () => setHeat(true) },
            ].map((b) => (
              <button
                key={b.label}
                type="button"
                onClick={b.click}
                aria-pressed={b.on}
                className={cn(
                  "h-8 rounded-md px-3 transition-colors",
                  b.on ? "bg-white font-medium shadow-sm" : "text-[#5b5e66] hover:text-[#16181d]",
                )}
              >
                {b.label}
              </button>
            ))}
          </div>
          <span className="text-[13px] text-[#0b7a57]">✓ Сохранено · только что</span>
        </div>
        <div className="flex min-h-0 flex-1">
          <div
            className="relative flex-1 bg-[#f8f9fb] [background-image:radial-gradient(#dfe2e8_1px,transparent_1px)] [background-size:14px_14px]"
            onMouseLeave={() => setHover(null)}
          >
            {ROWS.map((row, r) => (
              <span
                key={row}
                className="absolute font-mono text-[11px] text-[#7a7e88]"
                style={{
                  left: PLAN_X + SECTIONS * (CELL_W + GAP) + 8,
                  top: PLAN_Y + r * ROW_STEP + CELL_H + AISLE / 2 - 7,
                }}
              >
                Ряд {row}
              </span>
            ))}
            {cells.map((c) => {
              const on = hover?.id === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onMouseEnter={() => setHover(c)}
                  onFocus={() => setHover(c)}
                  aria-label={c.address}
                  className={cn(
                    "absolute rounded-[4px] transition-[background-color,box-shadow] duration-300",
                    on && "z-10 shadow-[0_0_0_2px_#2463eb]",
                  )}
                  style={{
                    left: c.x,
                    top: c.y,
                    width: CELL_W,
                    height: CELL_H,
                    background: cellColor(c, heat, c === target),
                  }}
                >
                  <span
                    className={cn(
                      "block text-center font-mono text-[10px]",
                      heat && c.fill > 0.55 ? "text-white" : "text-[#3a5aa8]",
                    )}
                  >
                    {c.address.slice(-2)}
                  </span>
                </button>
              );
            })}
            {/* Сборщик: одна точка ходит по проходам от ячейки к ячейке. */}
            <span
              aria-hidden
              className="pointer-events-none absolute z-20 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#f5821f] shadow-[0_0_0_4px_rgba(245,130,31,0.22)] transition-[left,top] duration-[1400ms] ease-in-out"
              style={{ left: picker.x, top: picker.y }}
            />
            <div className="absolute bottom-4 left-4 rounded-lg bg-white px-3 py-2 text-[13px] shadow-[0_0_0_1px_#ececef,0_4px_12px_rgba(13,14,17,0.06)]">
              <span className="text-[#5b5e66]">Сборка · </span>
              {target.goods} → <span className="font-mono text-[#2463eb]">{target.address}</span>
            </div>
          </div>
          <PlanPanel
            cell={hover}
            stats={{ cells: cells.length, busy, picked: 38 + step }}
            heat={heat}
          />
        </div>
      </div>
    </div>
  );
}

function cellColor(c: Cell, heat: boolean, target: boolean) {
  if (heat) return c.fill ? `rgba(36,99,235,${0.12 + c.fill * 0.78})` : "#eceef2";
  if (target) return "#fde7cf";
  return c.fill ? "#d6e3fd" : "#eceef2";
}

function PlanPanel({
  cell,
  stats,
  heat,
}: {
  cell: Cell | null;
  stats: { cells: number; busy: number; picked: number };
  heat: boolean;
}) {
  if (!cell) {
    return (
      <aside className="w-[270px] shrink-0 border-l border-[#ececef] bg-white p-5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#7a7e88]">
          {heat ? "Загруженность" : "Склад сегодня"}
        </p>
        <dl className="mt-4 space-y-4">
          <Stat label="Ячеек на этаже" value={String(stats.cells)} />
          <Stat
            label="Занято"
            value={`${Math.round((stats.busy / stats.cells) * 100)} %`}
            bar={stats.busy / stats.cells}
          />
          <Stat label="Собрано сегодня" value={`${stats.picked} шт.`} />
        </dl>
        <p className="mt-6 text-[13px] leading-relaxed text-[#7a7e88]">
          Наведите на ячейку: адрес, товар и остаток.
        </p>
      </aside>
    );
  }
  return (
    <aside className="w-[270px] shrink-0 border-l border-[#ececef] bg-white p-5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#7a7e88]">Ячейка</p>
      <p className="mt-2 font-mono text-[26px] font-medium text-[#2463eb]">{cell.address}</p>
      {cell.fill ? (
        <>
          <p className="mt-4 text-[15px] font-medium">{cell.goods}</p>
          <p className="mt-1 text-[13px] text-[#5b5e66]">{cell.qty} шт. на полке</p>
          <dl className="mt-5 space-y-4">
            <Stat label="Заполнено" value={`${Math.round(cell.fill * 100)} %`} bar={cell.fill} />
            <Stat label="Последняя операция" value="Приёмка, 10:42" />
          </dl>
        </>
      ) : (
        <p className="mt-4 text-[13px] leading-relaxed text-[#5b5e66]">
          Свободна. Подбор места поставит сюда товар по габаритам.
        </p>
      )}
    </aside>
  );
}

function Stat({ label, value, bar }: { label: string; value: string; bar?: number }) {
  return (
    <div>
      <dt className="text-[12px] text-[#7a7e88]">{label}</dt>
      <dd className="mt-0.5 text-[17px] font-medium tabular-nums">{value}</dd>
      {bar !== undefined && (
        <div className="mt-1.5 h-1.5 rounded-full bg-[#eceef2]">
          <div
            className="h-1.5 rounded-full transition-[width] duration-500"
            style={{ width: `${Math.round(bar * 100)}%`, background: BLUE }}
          />
        </div>
      )}
    </div>
  );
}

/* ——— Задания ——— */

type TaskStatus = "new" | "work" | "done" | "shipped";

interface Task {
  id: string;
  name: string;
  sku: string;
  qty: number;
  got: number;
  address: string;
  status: TaskStatus;
  group: number;
}

const GROUPS = ["ПВЗ Ozon, Москва, Дмитровское ш. 100", "Склад WB, Коледино"];

const START: Task[] = (
  [
    ["Пальто шерстяное, M, camel", "УК-1073", 9, "A-01-04", 0],
    ["Кроссовки беговые, 43, чёрный", "УК-1088", 6, "B-02-07", 0],
    ["Худи с капюшоном, XL, синий", "УК-1079", 3, "A-02-11", 0],
    ["Термокружка 450 мл", "УК-1102", 12, "C-01-02", 0],
    ["Рюкзак городской 20 л", "УК-1095", 4, "B-01-09", 1],
    ["Плед флисовый 150×200", "УК-1110", 7, "C-02-05", 1],
    ["Набор контейнеров, 5 шт.", "УК-1121", 10, "A-01-12", 1],
  ] as const
).map(([name, sku, qty, address, group], i) => ({
  id: String(i),
  name,
  sku,
  qty,
  got: 0,
  address,
  status: "new",
  group,
}));

const STATUS: Record<TaskStatus, { label: string; cls: string }> = {
  new: { label: "Новая", cls: "bg-[#f2f3f5] text-[#5b5e66]" },
  work: { label: "В работе", cls: "bg-[#e8effd] text-[#2463eb]" },
  done: { label: "Собрана", cls: "bg-[#e3f4ec] text-[#0b7a57]" },
  shipped: { label: "Отгружена", cls: "bg-[#f2f3f5] text-[#9a9da5]" },
};

const FILTERS: { id: TaskStatus | "all"; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "new", label: "Новые" },
  { id: "work", label: "В работе" },
  { id: "done", label: "Собранные" },
  { id: "shipped", label: "Отгруженные" },
];

/** Следующий шаг строки: новая → в работе (штуки набегают) → собрана. */
function advance(t: Task): Task {
  if (t.status === "new") return { ...t, status: "work", got: Math.ceil(t.qty / 3) };
  if (t.status === "work") return { ...t, status: "done", got: t.qty };
  return t;
}

/** Ход сборки сам по себе: одна строка за раз, после отгрузки — новый день. */
function autoStep(list: Task[]): Task[] {
  const i = list.findIndex((t) => t.status === "work" || t.status === "new");
  if (i !== -1) return list.map((t, k) => (k === i ? advance(t) : t));
  if (list.some((t) => t.status === "done"))
    return list.map((t) => (t.status === "done" ? { ...t, status: "shipped" } : t));
  return START;
}

export function LiveTasks() {
  const [tasks, setTasks] = useState(START);
  const [filter, setFilter] = useState<TaskStatus | "all">("all");
  // Под курсором сборка замирает: человек сам двигает строки.
  const [auto, setAuto] = useState(true);
  const [note, setNote] = useState<string | null>(null);

  useEvery(2600, () => setTasks(autoStep), auto);
  useEffect(() => {
    if (!note) return;
    const id = window.setTimeout(() => setNote(null), 2600);
    return () => window.clearTimeout(id);
  }, [note]);

  const done = tasks.filter((t) => t.status === "done").length;
  const visible = tasks.filter((t) => filter === "all" || t.status === filter);
  const count = (id: TaskStatus | "all") =>
    id === "all" ? tasks.length : tasks.filter((t) => t.status === id).length;

  const ship = () => {
    setTasks((list) => list.map((t) => (t.status === "done" ? { ...t, status: "shipped" } : t)));
    setNote(`Уехало позиций: ${done} · машина А 123 ВС 77`);
  };

  return (
    <div className="flex h-full">
      <Rail active="tasks" />
      <div
        className="relative flex min-w-0 flex-1 flex-col px-7 py-6"
        onMouseEnter={() => setAuto(false)}
        onMouseLeave={() => setAuto(true)}
      >
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-[20px] font-semibold">Задания</h3>
            <p className="mt-1 text-[13px] text-[#5b5e66]">
              Заявки селлеров, сгруппированы по назначению. Нажмите на строку — она сделает шаг.
            </p>
          </div>
          <button
            type="button"
            onClick={ship}
            disabled={!done}
            className={cn(
              "h-9 rounded-lg px-3.5 text-[13px] font-medium transition-colors",
              done ? "bg-[#2463eb] text-white hover:bg-[#1d4fd8]" : "bg-[#f2f3f5] text-[#9a9da5]",
            )}
          >
            Отгрузить ({done})
          </button>
        </div>
        <div className="mt-5 flex gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              aria-pressed={filter === f.id}
              className={cn(
                "h-8 rounded-lg px-3 text-[13px] transition-colors",
                filter === f.id
                  ? "bg-[#2463eb] text-white"
                  : "bg-[#f2f3f5] text-[#3b3e46] hover:bg-[#e8effd] hover:text-[#2463eb]",
              )}
            >
              {f.label} <span className="opacity-60">{count(f.id)}</span>
            </button>
          ))}
        </div>
        <div className="mt-5 flex flex-col gap-5 overflow-hidden">
          {GROUPS.map((g, gi) => {
            const rows = visible.filter((t) => t.group === gi);
            if (!rows.length) return null;
            return (
              <section key={g}>
                <p className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-[#3b3e46]">
                  {g}{" "}
                  <span className="font-normal normal-case text-[#9a9da5]">
                    · заявок: {rows.length}
                  </span>
                </p>
                <div className="overflow-hidden rounded-xl border border-[#ececef]">
                  {rows.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() =>
                        setTasks((list) => list.map((x) => (x.id === t.id ? advance(x) : x)))
                      }
                      className="grid w-full grid-cols-[1fr_90px_110px_110px] items-center border-b border-[#f0f1f3] px-4 py-2.5 text-left text-[14px] transition-colors last:border-b-0 hover:bg-[#f6f8fe]"
                    >
                      <span>
                        {t.name}
                        <span className="ml-2 font-mono text-[11px] text-[#9a9da5]">{t.sku}</span>
                      </span>
                      <span className="text-right tabular-nums">
                        {t.got}/{t.qty}
                      </span>
                      <span className="pl-5 font-mono text-[12px] text-[#2463eb]">{t.address}</span>
                      <span>
                        <span
                          className={cn(
                            "rounded-md px-2 py-0.5 text-[12px] font-medium transition-colors duration-300",
                            STATUS[t.status].cls,
                          )}
                        >
                          {STATUS[t.status].label}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
        {note && (
          <div className="wh-swap absolute bottom-5 left-1/2 -translate-x-1/2 rounded-lg bg-[#16181d] px-4 py-2.5 text-[13px] text-white shadow-lg">
            {note}
          </div>
        )}
      </div>
    </div>
  );
}
