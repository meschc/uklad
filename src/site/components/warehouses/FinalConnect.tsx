import { useEffect, useState } from "react";
import { ru, useT, type Copy } from "../../lib/copy";
import { Reveal } from "../Reveal";
import { CELL_QR_PATH, CELL_QR_SIZE } from "./cellQr";
import { ConnectForm } from "./ConnectForm";
import { DemoForm } from "./DemoForm";
import { Segmented } from "@/components/ui/segmented";
import { CHAT_HOURS, OFFER, freeMonthsTitle, monthsWordsRu } from "../../data/offer";

const T = {
  ticker: [
    ru("Подключить склад"),
    ru(freeMonthsTitle()),
    ru(`До ${OFFER.newFeatures} новых функций`),
  ],
  title: ru("Подключить склад"),
  now: ru("В Москве {time} · {status}"),
  open: ru(`на связи до ${CHAT_HOURS.to}:00`),
  closed: ru(`ответим в рабочее время с ${CHAT_HOURS.from}:00`),
  label: ru("Заявка на подключение"),
  demoLabel: ru("Заявка на демо"),
  modes: ru("Что нужно"),
  modeConnect: ru("Подключить склад"),
  modeDemo: ru("Посмотреть демо"),
  cell: ru("A-01-01-01"),
  cellNote: ru("Первая ячейка вашего склада в Укладе"),
  qr: ru("QR-код ячейки A-01-01-01"),
};

const STEPS: { title: Copy; body: Copy }[] = [
  {
    title: ru("Свяжемся"),
    body: ru("В рабочий день после заявки. Расскажете, как устроен склад."),
  },
  {
    title: ru("Подключим"),
    body: ru("Настроим адреса ячеек, перенесём товар, добавим сотрудников."),
  },
  {
    title: ru(`Работаете ${monthsWordsRu(OFFER.freeMonths)} бесплатно`),
    body: ru("Срок идёт с загрузки первых товаров."),
  },
];

/** Время по Москве и рабочие часы чата: будни, 10–18. */
function moscowNow() {
  const d = new Date(Date.now() + 3 * 3600 * 1000);
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const day = d.getUTCDay();
  return {
    time: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
    open: day >= 1 && day <= 5 && h >= CHAT_HOURS.from && h < CHAT_HOURS.to,
  };
}

/**
 * Конец страницы (19 окт): бегущая строка, синий блок с живым статусом связи,
 * шагами после заявки и формой в виде складского ярлыка. Подвал страницы
 * продолжает этот синий блок отдельным компонентом (`WarehousesFooter`).
 *
 * Статус считается в браузере после монтирования: при предрендере время
 * сборки выдало бы посетителю чужие часы.
 */
export function FinalConnect() {
  const t = useT();
  const [now, setNow] = useState<ReturnType<typeof moscowNow> | null>(null);
  // Кнопки «Демо» на странице ведут сюда же, якорем `#demo`: демо открывает
  // только ссылка из письма, поэтому вместо кабинета — заявка на неё.
  const [mode, setMode] = useState<"connect" | "demo">("connect");
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    // Из таймера, как и часы ниже: синхронный setState в эффекте перерисовал
    // бы секцию второй раз подряд. На сборке окна нет — там всегда «подключить».
    const sync = () => {
      if (window.location.hash === "#demo") setMode("demo");
    };
    const first = window.setTimeout(() => {
      sync();
      setExpired(new URLSearchParams(window.location.search).get("demo") === "expired");
    }, 0);
    // Ссылки на свою страницу витрина прокручивает сама, через `pushState`
    // (`useLinkNavigation`), и `hashchange` при этом не приходит: ловим клик.
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a");
      if (a && new URL(a.href, window.location.href).hash === "#demo") setMode("demo");
    };
    window.addEventListener("hashchange", sync);
    document.addEventListener("click", onClick);
    return () => {
      window.clearTimeout(first);
      window.removeEventListener("hashchange", sync);
      document.removeEventListener("click", onClick);
    };
  }, []);

  useEffect(() => {
    // Первый замер тоже из таймера: синхронный setState в эффекте
    // перерисовал бы секцию второй раз подряд.
    const tick = () => setNow(moscowNow());
    const first = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, 30_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, []);

  const half = (
    <span className="flex shrink-0 items-center gap-10 pr-10">
      {[...T.ticker, ...T.ticker].map((c, i) => (
        <span key={i} className="flex items-center gap-10">
          {t(c)}
          <span className="block size-3.5 rounded-[3px] bg-[var(--wh-blue)]" />
        </span>
      ))}
    </span>
  );

  return (
    <>
      <div
        aria-hidden
        className="mt-24 overflow-hidden whitespace-nowrap border-y border-[var(--wh-line)] py-[18px] sm:mt-36"
      >
        <div className="wh-ticker inline-flex text-[clamp(32px,4vw,56px)] leading-none tracking-[-0.04em]">
          {half}
          {half}
        </div>
      </div>

      <section
        id="connect"
        className="mt-16 scroll-mt-4 rounded-t-[24px] bg-[var(--wh-blue)] text-white sm:rounded-t-[32px]"
      >
        <span id="demo" aria-hidden className="block scroll-mt-4" />
        {/* Поверх общей с подвалом ASCII-сцены (её рисует `WarehousesFooter`). */}
        <div className="relative z-[1] mx-auto max-w-[1280px] px-5 pt-16 sm:px-10 sm:pt-24">
          <div className="grid grid-cols-1 gap-14 lg:grid-cols-2 lg:gap-20">
            <Reveal>
              <h2 className="text-[clamp(40px,5vw,72px)] font-normal leading-[0.98] tracking-[-0.045em]">
                {t(T.title)}
              </h2>
              {now && (
                <p className="mt-6 inline-flex min-h-9 items-center gap-2.5 rounded-full bg-white/15 px-3.5 py-1.5 text-sm">
                  <span
                    className={`block size-2 shrink-0 rounded-full ${now.open ? "bg-[#3ecf8e]" : "bg-white/50"}`}
                  />
                  {t(T.now, { time: now.time, status: t(now.open ? T.open : T.closed) })}
                </p>
              )}
              <ol className="mt-12 border-b border-white/25">
                {STEPS.map((s, i) => (
                  <li key={s.title.ru} className="flex gap-5 border-t border-white/25 py-5">
                    <span className="pt-[3px] font-mono text-sm text-white/60">0{i + 1}</span>
                    <span>
                      <span className="block text-xl tracking-[-0.02em]">{t(s.title)}</span>
                      <span className="mt-1.5 block text-[15px] leading-relaxed text-white/75">
                        {t(s.body)}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            </Reveal>

            <Reveal
              delay={120}
              className="min-w-0 overflow-hidden rounded-[22px] bg-background text-foreground"
            >
              <div className="flex items-center justify-between gap-4 px-5 py-6 sm:px-8">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    {t(mode === "demo" ? T.demoLabel : T.label)}
                  </p>
                  <p className="mt-1.5 font-mono text-[22px] font-medium text-[var(--wh-blue)]">
                    {t(T.cell)}
                  </p>
                  <p className="mt-1 text-[13px] text-muted-foreground">{t(T.cellNote)}</p>
                </div>
                <svg
                  role="img"
                  aria-label={t(T.qr)}
                  viewBox={`-2 -2 ${CELL_QR_SIZE + 4} ${CELL_QR_SIZE + 4}`}
                  shapeRendering="crispEdges"
                  className="size-[84px] shrink-0 text-foreground sm:size-[92px]"
                >
                  {/* Без подложки, цветом текста (Кирилл 19 окт): на светлой карточке
                      код чёрный, на тёмной — инверсный белый. */}
                  <path fill="currentColor" d={CELL_QR_PATH} />
                </svg>
              </div>
              {/* Линия отрыва с вырезами по краям, как у ярлыка тары. */}
              <div aria-hidden className="relative mx-5 border-t-2 border-dashed border-border">
                <span className="absolute -left-8 -top-[13px] block size-6 rounded-full bg-[var(--wh-blue)]" />
                <span className="absolute -right-8 -top-[13px] block size-6 rounded-full bg-[var(--wh-blue)]" />
              </div>
              <div className="px-5 pb-8 pt-7 sm:px-8">
                <Segmented
                  size="md"
                  grow
                  ariaLabel={t(T.modes)}
                  className="mb-5"
                  value={mode}
                  onChange={setMode}
                  options={[
                    { value: "connect", label: t(T.modeConnect) },
                    { value: "demo", label: t(T.modeDemo) },
                  ]}
                />
                {mode === "demo" ? (
                  <DemoForm idPrefix="final-demo" expired={expired} />
                ) : (
                  <ConnectForm idPrefix="final" />
                )}
              </div>
            </Reveal>
          </div>
        </div>
      </section>
    </>
  );
}
