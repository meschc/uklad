import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Reveal } from "../Reveal";
import { ru, useT, type Copy } from "../../lib/copy";

const T = {
  title: ru("Знакомо?"),
  statement: ru(
    "Типовые программы рассчитаны на усреднённый склад, и процессы приходится менять под программу.",
  ),
  statementAccent: ru("В Укладе наоборот: система подстраивается под то, как вы работаете."),
};

const PAINS: { title: Copy; body: Copy; art: ReactNode }[] = [
  {
    title: ru("Учёт в Excel, чатах и разных программах"),
    body: ru(
      "Чтобы найти товар, проверить остаток, провести приёмку или отгрузку, приходится сверять несколько источников.",
    ),
    art: <ScatteredArt />,
  },
  {
    title: ru("Задачи ставятся устно, часы считаются отдельно"),
    body: ru(
      "Кто что сделал, не фиксируется. Рабочее время ведётся в другой программе или не ведётся вовсе.",
    ),
    art: <TasksArt />,
  },
  {
    title: ru("Ответы клиентам ищут по чатам"),
    body: ru(
      "Чтобы ответить про остатки и отгрузки, сотрудник ищет переписку в мессенджерах или вспоминает звонки.",
    ),
    art: <ChatsArt />,
  },
];

/**
 * Боль склада тремя колонками с рисунками и полоса-вывод под ними.
 *
 * Заголовок «Знакомо?», а не утверждение о складе (19 окт): утверждение
 * звучало как упрёк, вопрос предлагает узнать себя.
 */
export function Familiar() {
  const t = useT();

  return (
    <>
      <section className="mx-auto mt-24 max-w-[1280px] px-5 sm:mt-32 sm:px-10">
        <Reveal>
          <h2 className="wh-h2 text-center">{t(T.title)}</h2>
        </Reveal>
        <div className="mt-12 grid grid-cols-1 border-t border-[var(--wh-line)] sm:mt-16 lg:grid-cols-3">
          {PAINS.map((p, i) => (
            <Reveal
              key={p.title.ru}
              delay={i * 80}
              className={cn(
                "border-[var(--wh-line)] py-8 lg:pb-2 lg:pt-10",
                i < PAINS.length - 1 && "border-b lg:border-b-0 lg:border-r",
                i === 0 && "lg:pr-8",
                i === 1 && "lg:px-8",
                i === 2 && "lg:pl-8",
              )}
            >
              {/* Иллюстрации всех блоков лендинга — на одной серой плашке:
                  белые детали, синий акцент (Кирилл 31 окт: «где-то с
                  заливкой, где-то без»). Та же плашка в «Как проходит
                  подключение» и в «Товар, сотрудники и селлеры». */}
              <div className="flex h-40 items-center justify-center rounded-[18px] bg-[var(--wh-soft)] p-5">
                {p.art}
              </div>
              <h3 className="mt-7 text-[22px] font-medium tracking-[-0.02em]">{t(p.title)}</h3>
              <p className="wh-muted mt-2.5 text-base leading-relaxed">{t(p.body)}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-24 max-w-[1280px] px-5 sm:mt-32 sm:px-10">
        <div className="rounded-[24px] bg-[var(--wh-soft)] sm:rounded-[32px]">
          <Reveal className="mx-auto max-w-[1040px] px-5 py-16 text-center sm:px-10 sm:py-24">
            <p className="text-[clamp(24px,2.8vw,40px)] leading-[1.2] tracking-[-0.025em] [text-wrap:balance]">
              {t(T.statement)} <span className="text-[var(--wh-blue)]">{t(T.statementAccent)}</span>
            </p>
          </Reveal>
        </div>
      </section>
    </>
  );
}

/*
 * Рисунки линиями: `currentColor` даёт приглушённый цвет, акцент — синий
 * страницы. Своих цветов нет, чтобы тёмная тема не ломала их.
 */
const BLUE = "var(--wh-blue)";
const MONO = "var(--font-mono, monospace)";

/** Высота у всех рисунков одна, ширина — по рисунку: подписи в пузырях длиннее. */
function Art({ children, width = 160 }: { children: ReactNode; width?: number }) {
  return (
    <svg
      viewBox={`0 0 ${width} 96`}
      width={width}
      height={96}
      className="wh-muted block h-24 max-w-full"
      aria-hidden
    >
      {children}
    </svg>
  );
}

/** Таблица, документ и сообщение, разбросанные друг поверх друга. */
function ScatteredArt() {
  return (
    <Art>
      <rect
        x="2"
        y="10"
        width="72"
        height="52"
        rx="6"
        fill="var(--wh-ground)"
        stroke="currentColor"
        strokeOpacity="0.5"
      />
      <path d="M2 27h72M2 44h72M26 10v52M50 10v52" stroke="currentColor" strokeOpacity="0.3" />
      <text x="8" y="7" fontSize="9" fontFamily={MONO} fill="currentColor">
        остатки.xlsx
      </text>
      <rect
        x="54"
        y="36"
        width="64"
        height="40"
        rx="6"
        fill="var(--wh-ground)"
        stroke="currentColor"
        strokeOpacity="0.5"
      />
      <path
        d="M62 48h40M62 58h28"
        stroke="currentColor"
        strokeOpacity="0.35"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <rect x="100" y="16" width="56" height="30" rx="15" fill={BLUE} />
      <path d="M112 28h32M112 35h20" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
    </Art>
  );
}

/** Список задач без исполнителя и часы сбоку. */
function TasksArt() {
  return (
    <Art>
      {[8, 38].map((y, i) => (
        <g key={y}>
          <rect
            x="2"
            y={y}
            width="96"
            height="22"
            rx="6"
            fill="var(--wh-ground)"
            stroke="currentColor"
            strokeOpacity="0.5"
          />
          <circle
            cx="14"
            cy={y + 11}
            r="4"
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.55"
          />
          <path
            d={`M26 ${y + 11}h${i ? 44 : 60}`}
            stroke="currentColor"
            strokeOpacity="0.35"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </g>
      ))}
      <rect
        x="2"
        y="68"
        width="96"
        height="22"
        rx="6"
        fill="var(--wh-ground)"
        stroke="currentColor"
        strokeOpacity="0.5"
        strokeDasharray="4 3"
      />
      <text x="50" y="83" fontSize="11" fontFamily={MONO} fill="currentColor" textAnchor="middle">
        кто?
      </text>
      <circle cx="132" cy="48" r="24" fill="none" stroke={BLUE} strokeWidth="2" />
      <path d="M132 34v14l9 6" fill="none" stroke={BLUE} strokeWidth="2" strokeLinecap="round" />
    </Art>
  );
}

/** Три вопроса клиента и счётчик непрочитанных. */
function ChatsArt() {
  const asks = [
    { x: 2, y: 6, text: "Сколько осталось?" },
    { x: 28, y: 36, text: "Когда отгрузка?" },
    { x: 2, y: 66, text: "Где моя поставка?" },
  ];
  return (
    <Art width={200}>
      {asks.map((a) => (
        <g key={a.text}>
          <rect
            x={a.x}
            y={a.y}
            width={132}
            height="24"
            rx="12"
            fill="var(--wh-ground)"
            stroke="currentColor"
            strokeOpacity="0.5"
          />
          <text x={a.x + 12} y={a.y + 16} fontSize="11" fill="currentColor">
            {a.text}
          </text>
        </g>
      ))}
      <circle cx="184" cy="18" r="11" fill={BLUE} />
      <text x="184" y="22" fontSize="11" fill="#fff" textAnchor="middle">
        12
      </text>
    </Art>
  );
}
