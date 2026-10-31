import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { OFFER, monthsRu } from "../../data/offer";
import { cn } from "@/lib/utils";
import { Reveal } from "../Reveal";
import { ru, useT, type Copy } from "../../lib/copy";

const T = {
  title: ru("Как проходит подключение"),
  schemeAddresses: ru("Настраиваем адреса"),
  schemeGoods: ru("Переносим товары"),
  schemeStaff: ru("Добавляем сотрудников"),
};

interface Step {
  title: Copy;
  time: Copy;
  body: Copy;
}

const STEPS: Step[] = [
  {
    title: ru("Заявка"),
    time: ru("1 минута"),
    body: ru("Имя, как связаться, как сейчас ведёте учёт."),
  },
  {
    title: ru("Знакомство"),
    time: ru("20 минут по телефону или в чате"),
    body: ru("Как устроены приёмка, хранение и отгрузка, кто что делает."),
  },
  {
    title: ru("Внедрение"),
    time: ru("вместе с вами"),
    body: ru("Настраиваем адреса, переносим товары, добавляем сотрудников."),
  },
  {
    title: ru("Тестовый период"),
    time: ru(monthsRu(OFFER.freeMonths)),
    body: ru("Учёт ведётся в Укладе, систему адаптируем под ваши запросы."),
  },
  {
    title: ru("Дальше"),
    time: ru("по тарифу"),
    body: ru("Система остаётся настроенной под ваш склад."),
  },
];

/** Без анимаций: настройка устройства или среда без наблюдателя (сборка в статику). */
function useStill() {
  const [still] = useState(
    () =>
      typeof IntersectionObserver === "undefined" ||
      (typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches),
  );
  return still;
}

/**
 * Вошёл ли блок в кадр. `once` — запомнить первое вхождение (путь заполняется
 * один раз); без него флаг гаснет, когда блок уходит, и циклы схем не крутятся
 * вхолостую за краем экрана.
 */
function useInView(ref: RefObject<Element | null>, once: boolean) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setOn(true);
          if (once) io.disconnect();
        } else if (!once) setOn(false);
      },
      { rootMargin: "0px 0px -15% 0px", threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, once]);
  return on;
}

/**
 * Насколько путь прокручен: 0 — ряд шагов только показался снизу (на 85 %
 * высоты окна), 1 — дошёл до 45 %. Шаги загораются по мере прокрутки, а не
 * по таймеру (Кирилл 31 окт): человек сам ведёт путь колесом.
 */
function useScrollProgress(ref: RefObject<Element | null>, off: boolean) {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || off) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const vh = window.innerHeight;
      // По центру блока: путь начинается, когда середина шагов входит снизу,
      // и пятый шаг загорается, только когда блок встал посередине экрана
      // (Кирилл 31 окт: раньше он горел, пока блок ещё не долистан).
      const r = el.getBoundingClientRect();
      const center = r.top + r.height / 2;
      setProgress(Math.min(1, Math.max(0, (vh * 0.95 - center) / (vh * 0.45))));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [ref, off]);
  return progress;
}

/** Шаг цикла схемы: растёт раз в `ms`, пока схема в кадре. */
function useTick(active: boolean, ms: number) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setTick((v) => v + 1), ms);
    return () => window.clearInterval(id);
  }, [active, ms]);
  return tick;
}

/**
 * Путь подключения: пять шагов на одной горизонтальной линии и под ними три
 * схемы внедрения. Схемы нарисованы линиями, а не скриншотами: схема не
 * устаревает, когда меняются экраны кабинета.
 *
 * На узком экране шаги встают в колонку, и линия-путь прячется: разорванная
 * на переносе, она перестаёт быть путём.
 *
 * Движение (Кирилл 19 окт: «тут всё статично»): при входе в кадр линия
 * заполняется слева направо по мере прокрутки, и кружки шагов загораются по
 * очереди, когда линия до них доходит; схемы показывают свою работу — подсветка идёт по
 * ячейкам, строки таблицы переезжают в список товаров с отсчётом остатков,
 * карточки сотрудников подсвечиваются по одной. Без анимаций всё стоит в
 * конечном виде.
 */
export function ConnectPath() {
  const t = useT();
  const still = useStill();
  const pathRef = useRef<HTMLDivElement>(null);
  const scrolled = useScrollProgress(pathRef, still);
  const progress = still ? 1 : scrolled;

  return (
    <section
      id="connect-path"
      className="mx-auto mt-24 max-w-[1280px] scroll-mt-24 px-5 sm:mt-36 sm:px-10"
    >
      <Reveal>
        <h2 className="wh-h2 text-center">{t(T.title)}</h2>
      </Reveal>

      <div ref={pathRef} className="relative mt-12 sm:mt-[72px]">
        <span
          className="absolute inset-x-[10%] top-[19px] hidden h-0.5 bg-[var(--wh-blue)] opacity-20 lg:block"
          aria-hidden
        />
        <span
          className="absolute inset-x-[10%] top-[19px] hidden h-0.5 origin-left bg-[var(--wh-blue)] transition-transform duration-200 ease-out lg:block"
          style={{ transform: `scaleX(${progress})` }}
          aria-hidden
        />
        <ol className="relative grid grid-cols-1 gap-x-4 gap-y-10 text-center sm:grid-cols-2 lg:grid-cols-5">
          {STEPS.map((step, i) => {
            const last = i === STEPS.length - 1;
            // Кружок горит, когда линия до него дошла.
            const lit = progress > 0 && progress >= i / (STEPS.length - 1) - 0.001;
            return (
              <Reveal
                key={step.title.ru}
                as="li"
                delay={i * 60}
                className="flex flex-col items-center"
              >
                {/* Кружок загорается, когда линия до него дошла. Пока не
                    загорелся — контур цветом линий страницы. */}
                <span
                  className={cn(
                    "relative flex size-10 items-center justify-center rounded-full font-medium transition-[background-color,color,box-shadow,transform] duration-500",
                    !lit &&
                      "scale-90 bg-[var(--wh-ground)] text-[var(--wh-muted)] shadow-[inset_0_0_0_2px_var(--wh-line)]",
                    lit &&
                      (last
                        ? "bg-[var(--wh-ground)] text-[var(--wh-blue)] shadow-[inset_0_0_0_2px_var(--wh-blue)]"
                        : "bg-[var(--wh-blue)] text-white"),
                  )}
                >
                  {i + 1}
                </span>
                <h3 className="mt-5 text-xl font-medium">{t(step.title)}</h3>
                <p className="mt-1 text-sm text-[var(--wh-blue)]">{t(step.time)}</p>
                <p className="wh-muted mt-2 max-w-[260px] text-[15px] leading-relaxed">
                  {t(step.body)}
                </p>
              </Reveal>
            );
          })}
        </ol>
      </div>

      <div className="mt-14 grid grid-cols-1 gap-4 md:grid-cols-3">
        <Reveal>
          <Scheme title={t(T.schemeAddresses)}>
            <AddressesScheme still={still} />
          </Scheme>
        </Reveal>
        <Reveal delay={90}>
          <Scheme title={t(T.schemeGoods)}>
            <GoodsScheme still={still} />
          </Scheme>
        </Reveal>
        <Reveal delay={180}>
          <Scheme title={t(T.schemeStaff)}>
            <StaffScheme still={still} />
          </Scheme>
        </Reveal>
      </div>
    </section>
  );
}

function Scheme({ title, children }: { title: string; children: ReactNode }) {
  return (
    <figure className="rounded-[18px] bg-[var(--wh-soft)] p-5">
      <div className="wh-muted">{children}</div>
      <figcaption className="mt-3 text-sm font-medium">{title}</figcaption>
    </figure>
  );
}

/*
 * Схемы рисуются линиями в цветах темы: `currentColor` берёт приглушённый
 * цвет текста, акцент — `--wh-blue`. Своих цветов у схем нет, иначе в тёмной
 * теме они выпадали бы из страницы.
 */
const PRIMARY = "var(--wh-blue)";
const MONO = "var(--font-mono, monospace)";

/** Цвет и обводка меняются плавно: подсветка переходит, а не перескакивает. */
const EASE = { transition: "fill 450ms ease, stroke 450ms ease, stroke-opacity 450ms ease" };

/** Склад сверху: два ряда стеллажей, подсветка обходит ячейки по адресам. */
function AddressesScheme({ still }: { still: boolean }) {
  const ref = useRef<SVGSVGElement>(null);
  const on = useInView(ref, false) && !still;
  const tick = useTick(on, 1100);
  const cols = [0, 1, 2, 3];
  // Без движения подсвечена вторая ячейка — как на статичной схеме.
  const cur = still ? 1 : (tick + 1) % 8;
  return (
    <svg ref={ref} viewBox="0 0 200 110" className="w-full" aria-hidden>
      {[14, 64].map((y, row) => (
        <g key={y}>
          {cols.map((col) => {
            const x = 14 + col * 44;
            const marked = row * 4 + col === cur;
            return (
              <g key={col}>
                <rect
                  x={x}
                  y={y}
                  width={40}
                  height={30}
                  rx={4}
                  fill={marked ? "var(--wh-soft)" : "transparent"}
                  stroke={marked ? PRIMARY : "currentColor"}
                  strokeOpacity={marked ? 1 : 0.5}
                  style={EASE}
                />
                <text
                  x={x + 20}
                  y={y + 19}
                  textAnchor="middle"
                  fontSize="8"
                  fontFamily={MONO}
                  fill={marked ? PRIMARY : "currentColor"}
                  style={EASE}
                >
                  {`А-0${row + 1}-0${col + 1}`}
                </text>
              </g>
            );
          })}
        </g>
      ))}
      {/* Проход между рядами. */}
      <line x1="14" y1="54" x2="186" y2="54" stroke="currentColor" strokeOpacity="0.3" />
    </svg>
  );
}

/** Остатки в списке товаров после переноса. */
const STOCK = [120, 45, 8];

/** Число набегает от нуля до `to`, когда `run` включился. */
function CountUp({ to, run, delay }: { to: number; run: boolean; delay: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!run) return;
    let raf = 0;
    let start = 0;
    const step = (now: number) => {
      if (!start) start = now + delay;
      const p = Math.min(1, Math.max(0, (now - start) / 900));
      setN(Math.round(to * (1 - (1 - p) ** 3)));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [run, to, delay]);
  return <>{n}</>;
}

/**
 * Таблица переходит стрелкой в список товаров с остатками: строки по одной
 * выезжают со стороны таблицы, остатки набегают от нуля. Один раз — при
 * первом входе в кадр.
 */
function GoodsScheme({ still }: { still: boolean }) {
  const ref = useRef<SVGSVGElement>(null);
  const seen = useInView(ref, true);
  const run = seen && !still;
  return (
    <svg ref={ref} viewBox="0 0 200 110" className="w-full" aria-hidden>
      {/* Таблица узнаётся по клеткам, содержимое ей не нужно. */}
      <rect
        x="10"
        y="20"
        width="70"
        height="70"
        rx="4"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.5"
      />
      {[37.5, 55, 72.5].map((y) => (
        <line key={y} x1="10" y1={y} x2="80" y2={y} stroke="currentColor" strokeOpacity="0.3" />
      ))}
      <line x1="40" y1="20" x2="40" y2="90" stroke="currentColor" strokeOpacity="0.3" />
      <text x="45" y="14" textAnchor="middle" fontSize="8" fontFamily={MONO} fill="currentColor">
        .xlsx
      </text>

      <path
        d="M90 55h22m-6-6 6 6-6 6"
        fill="none"
        stroke={PRIMARY}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Список товаров: строка названия и остаток справа. */}
      {[24, 46, 68].map((y, i) => {
        const delay = 250 + i * 220;
        return (
          <g
            key={y}
            style={
              still
                ? undefined
                : {
                    transform: seen ? "none" : "translateX(-44px)",
                    opacity: seen ? 1 : 0,
                    transition: `transform 700ms cubic-bezier(0.16,1,0.3,1) ${delay}ms, opacity 500ms ease ${delay}ms`,
                  }
            }
          >
            <rect
              x="122"
              y={y}
              width="68"
              height="16"
              rx="3"
              fill="none"
              stroke="currentColor"
              strokeOpacity="0.5"
            />
            <line
              x1="128"
              y1={y + 8}
              x2="160"
              y2={y + 8}
              stroke="currentColor"
              strokeOpacity="0.5"
            />
            <text x="184" y={y + 11} textAnchor="end" fontSize="8" fontFamily={MONO} fill={PRIMARY}>
              {still ? STOCK[i] : <CountUp to={STOCK[i]} run={run} delay={delay + 200} />}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Карточки сотрудников с ролями; подсветка переходит от одной к другой. */
function StaffScheme({ still }: { still: boolean }) {
  const ref = useRef<SVGSVGElement>(null);
  const on = useInView(ref, false) && !still;
  const tick = useTick(on, 1400);
  const cur = still ? 0 : tick % 3;
  const people = [
    { x: 10, role: "Кладовщик" },
    { x: 72, role: "Приёмщик" },
    { x: 134, role: "Сборщик" },
  ];
  return (
    <svg ref={ref} viewBox="0 0 200 110" className="w-full" aria-hidden>
      {people.map((p, i) => {
        const marked = i === cur;
        return (
          <g key={p.role}>
            <rect
              x={p.x}
              y="18"
              width="56"
              height="74"
              rx="5"
              fill={marked ? "var(--wh-soft)" : "transparent"}
              stroke={marked ? PRIMARY : "currentColor"}
              strokeOpacity={marked ? 1 : 0.5}
              style={EASE}
            />
            <circle
              cx={p.x + 28}
              cy="42"
              r="10"
              fill="none"
              stroke={marked ? PRIMARY : "currentColor"}
              strokeOpacity={marked ? 1 : 0.6}
              style={EASE}
            />
            <path
              d={`M${p.x + 12} 72c3-9 9-13 16-13s13 4 16 13`}
              fill="none"
              stroke={marked ? PRIMARY : "currentColor"}
              strokeOpacity={marked ? 1 : 0.6}
              style={EASE}
            />
            <text
              x={p.x + 28}
              y="86"
              textAnchor="middle"
              fontSize="7"
              fill={marked ? PRIMARY : "currentColor"}
              style={EASE}
            >
              {p.role}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
