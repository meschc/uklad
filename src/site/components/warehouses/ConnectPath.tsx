import type { ReactNode } from "react";
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
    time: ru("3 месяца"),
    body: ru("Учёт ведётся в Укладе, систему адаптируем под ваши запросы."),
  },
  {
    title: ru("Дальше"),
    time: ru("по тарифу"),
    body: ru("Система остаётся настроенной под ваш склад."),
  },
];

/**
 * Путь подключения: пять шагов на одной горизонтальной линии и под ними три
 * схемы внедрения. Схемы нарисованы линиями, а не скриншотами: схема не
 * устаревает, когда меняются экраны кабинета.
 *
 * На узком экране шаги встают в колонку, и линия-путь прячется: разорванная
 * на переносе, она перестаёт быть путём.
 */
export function ConnectPath() {
  const t = useT();

  return (
    <section
      id="connect-path"
      className="mx-auto mt-24 max-w-[1280px] scroll-mt-24 px-5 sm:mt-36 sm:px-10"
    >
      <Reveal>
        <h2 className="wh-h2 text-center">{t(T.title)}</h2>
      </Reveal>

      <div className="relative mt-12 sm:mt-[72px]">
        <span
          className="absolute inset-x-[10%] top-[19px] hidden h-0.5 bg-[var(--wh-blue)] opacity-25 lg:block"
          aria-hidden
        />
        <ol className="relative grid grid-cols-1 gap-x-4 gap-y-10 text-center sm:grid-cols-2 lg:grid-cols-5">
          {STEPS.map((step, i) => {
            const last = i === STEPS.length - 1;
            return (
              <Reveal
                key={step.title.ru}
                as="li"
                delay={i * 60}
                className="flex flex-col items-center"
              >
                <span
                  className={
                    last
                      ? "flex size-10 items-center justify-center rounded-full bg-[var(--wh-ground)] font-medium text-[var(--wh-blue)] shadow-[inset_0_0_0_2px_var(--wh-blue)]"
                      : "flex size-10 items-center justify-center rounded-full bg-[var(--wh-blue)] font-medium text-white"
                  }
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
            <AddressesScheme />
          </Scheme>
        </Reveal>
        <Reveal delay={90}>
          <Scheme title={t(T.schemeGoods)}>
            <GoodsScheme />
          </Scheme>
        </Reveal>
        <Reveal delay={180}>
          <Scheme title={t(T.schemeStaff)}>
            <StaffScheme />
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
                  fill={marked ? "var(--wh-soft)" : "none"}
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
            fill={i === 0 ? "var(--wh-soft)" : "none"}
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
