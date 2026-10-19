import type { ReactNode } from "react";
import { Reveal } from "../Reveal";
import { SectionHead } from "../SectionHead";
import { ru, useT, type Copy } from "../../lib/copy";
import { ConnectForm } from "./ConnectForm";

const T = {
  eyebrow: ru("Путь"),
  title: ru("Как проходит подключение"),
  schemeAddresses: ru("Настраиваем адреса"),
  schemeGoods: ru("Переносим товары"),
  schemeStaff: ru("Добавляем сотрудников"),
};

interface Step {
  title: Copy;
  /** Срок там, где он точный. «Несколько дней» хуже, чем ничего. */
  time?: Copy;
  body: Copy;
}

const STEPS: Step[] = [
  {
    title: ru("Заявка"),
    time: ru("1 минута"),
    body: ru("Имя, как с вами связаться, как сейчас ведёте учёт."),
  },
  {
    title: ru("Знакомство"),
    time: ru("20 минут по телефону или переписка в чате"),
    body: ru(
      "Расскажете, как устроены приёмка, хранение и отгрузка и кто что делает. Покажем, как ваши процессы лягут в систему, и предложим, что упростить.",
    ),
  },
  {
    title: ru("Внедрение"),
    body: ru("Помогаем настроить адреса, перенести товары и добавить сотрудников."),
  },
  {
    title: ru("Тестовый период"),
    time: ru("3 месяца"),
    body: ru(
      "Склад работает в обычном режиме, учёт ведётся в Укладе. Мы адаптируем систему под ваши запросы: до 4 новых функций, каждая до 5 рабочих дней.",
    ),
  },
  {
    title: ru("Дальше"),
    body: ru(
      "Система остаётся настроенной под ваш склад, работа продолжается по выбранному тарифу.",
    ),
  },
];

/**
 * Путь подключения: пять шагов на одной линии.
 *
 * Два шага несут не текст, а действие и картинку (решения 19 окт):
 * первый — это и есть заявка, поля стоят прямо в шаге, и склад заполняет её,
 * не уходя с пути; третий показан тремя схемами, нарисованными линиями, а не
 * скриншотами кабинета — схема не устаревает, когда меняются экраны.
 *
 * Линия вертикальная на любой ширине: форма и схемы в горизонтальную ленту из
 * пяти колонок не помещаются, а путь, разорванный на полпути, перестаёт быть
 * путём.
 */
export function ConnectPath() {
  const t = useT();

  return (
    <section id="connect" className="mx-auto mt-20 max-w-6xl scroll-mt-24 px-4 sm:mt-24 sm:px-6">
      <SectionHead align="left" eyebrow={t(T.eyebrow)} title={t(T.title)} />

      <ol className="mt-10">
        {STEPS.map((step, i) => (
          <Reveal key={step.title.ru} as="li" delay={i * 60}>
            <div className="grid grid-cols-[36px_minmax(0,1fr)] gap-3 sm:grid-cols-[40px_minmax(0,1fr)] sm:gap-6">
              {/* Номер и линия к следующему шагу. У последнего линии нет:
                  путь кончается на нём. */}
              <div className="flex flex-col items-center">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-primary/10 font-mono text-sm tabular-nums text-primary sm:size-10">
                  {i + 1}
                </span>
                {i < STEPS.length - 1 && <span className="w-px flex-1 bg-border" aria-hidden />}
              </div>

              <div className="pb-10">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 pt-1.5">
                  <h3 className="font-display text-xl font-heading tracking-tight">
                    {t(step.title)}
                  </h3>
                  {step.time && (
                    <span className="text-sm text-muted-foreground">{t(step.time)}</span>
                  )}
                </div>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                  {t(step.body)}
                </p>

                {/* На телефоне форма выходит на всю ширину поверх линии пути:
                    в колонке шага переключатель «как ведёте учёт» не влезает. */}
                {i === 0 && (
                  <div className="r-window relative -ml-12 mt-5 max-w-2xl border border-border bg-card p-4 sm:ml-0 sm:p-6">
                    <ConnectForm idPrefix="path" />
                  </div>
                )}

                {i === 2 && (
                  <div className="mt-5 grid max-w-3xl gap-4 sm:grid-cols-3">
                    <Scheme title={t(T.schemeAddresses)}>
                      <AddressesScheme />
                    </Scheme>
                    <Scheme title={t(T.schemeGoods)}>
                      <GoodsScheme />
                    </Scheme>
                    <Scheme title={t(T.schemeStaff)}>
                      <StaffScheme />
                    </Scheme>
                  </div>
                )}
              </div>
            </div>
          </Reveal>
        ))}
      </ol>
    </section>
  );
}

function Scheme({ title, children }: { title: string; children: ReactNode }) {
  return (
    <figure className="r-window border border-border bg-card p-4">
      <div className="text-muted-foreground">{children}</div>
      <figcaption className="mt-3 text-sm font-medium">{title}</figcaption>
    </figure>
  );
}

/*
 * Схемы рисуются линиями в цветах темы: `currentColor` берёт приглушённый
 * цвет текста, акцент — `--primary`. Своих цветов у схем нет, иначе в тёмной
 * теме они выпадали бы из страницы.
 */
const PRIMARY = "hsl(var(--primary))";
const MONO = "var(--font-mono, monospace)";

/** Склад сверху: два ряда стеллажей, у ячеек появляются адреса. */
function AddressesScheme() {
  const cols = [0, 1, 2, 3];
  return (
    <svg viewBox="0 0 200 110" className="w-full" aria-hidden>
      {[14, 64].map((y, row) => (
        <g key={y}>
          {cols.map((col) => {
            const x = 14 + col * 44;
            const marked = row === 0 && col === 1;
            return (
              <g key={col}>
                <rect
                  x={x}
                  y={y}
                  width={40}
                  height={30}
                  rx={4}
                  fill={marked ? "hsl(var(--primary) / 0.12)" : "none"}
                  stroke={marked ? PRIMARY : "currentColor"}
                  strokeOpacity={marked ? 1 : 0.5}
                />
                <text
                  x={x + 20}
                  y={y + 19}
                  textAnchor="middle"
                  fontSize="8"
                  fontFamily={MONO}
                  fill={marked ? PRIMARY : "currentColor"}
                >
                  {`А-0${row + 1}-0${col + 1}`}
                </text>
              </g>
            );
          })}
        </g>
      ))}
      {/* Проход между рядами. */}
      <line
        x1="14"
        y1="54"
        x2="186"
        y2="54"
        stroke="currentColor"
        strokeOpacity="0.3"
        strokeDasharray="3 3"
      />
    </svg>
  );
}

/** Таблица переходит стрелкой в список товаров с остатками. */
function GoodsScheme() {
  return (
    <svg viewBox="0 0 200 110" className="w-full" aria-hidden>
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
      {[24, 46, 68].map((y, i) => (
        <g key={y}>
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
          <line x1="128" y1={y + 8} x2="160" y2={y + 8} stroke="currentColor" strokeOpacity="0.5" />
          <text x="184" y={y + 11} textAnchor="end" fontSize="8" fontFamily={MONO} fill={PRIMARY}>
            {[120, 45, 8][i]}
          </text>
        </g>
      ))}
    </svg>
  );
}

/** Карточки сотрудников с ролями. */
function StaffScheme() {
  const people = [
    { x: 10, role: "Кладовщик" },
    { x: 72, role: "Приёмщик" },
    { x: 134, role: "Сборщик" },
  ];
  return (
    <svg viewBox="0 0 200 110" className="w-full" aria-hidden>
      {people.map((p, i) => (
        <g key={p.role}>
          <rect
            x={p.x}
            y="18"
            width="56"
            height="74"
            rx="5"
            fill={i === 0 ? "hsl(var(--primary) / 0.08)" : "none"}
            stroke={i === 0 ? PRIMARY : "currentColor"}
            strokeOpacity={i === 0 ? 1 : 0.5}
          />
          <circle
            cx={p.x + 28}
            cy="42"
            r="10"
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.6"
          />
          <path
            d={`M${p.x + 12} 72c3-9 9-13 16-13s13 4 16 13`}
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.6"
          />
          <text x={p.x + 28} y="86" textAnchor="middle" fontSize="7" fill="currentColor">
            {p.role}
          </text>
        </g>
      ))}
    </svg>
  );
}
