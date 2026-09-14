import { ArrowRight } from "lucide-react";
import { warehousesRepository } from "../../data/warehousesRepository";
import { href } from "../../lib/route";
import { c, useT, type TFunc } from "../../lib/copy";

/**
 * Первый экран.
 *
 * Здесь была плита: подложка со своим светом, внутри неё окно со своим фоном,
 * внутри окна план склада, а поверх плана ещё две плашки на полупрозрачном
 * фоне. Четыре уровня фона на одном экране — и каждый следующий приходилось
 * делать светлее предыдущего, чтобы он вообще был виден. Читается это не как
 * глубина, а как стопка бумаг.
 *
 * Сейчас фон один — фон страницы. Слева обещание, справа схема: три строки о
 * том, что происходит с товаром прямо сейчас, разделённые волосяными линейками.
 * Всё, что было объёмом, стало рамкой в один пиксель.
 *
 * Плана склада на первом экране нет намеренно. Он красивый и его хочется
 * показать первым, но это витрина поверх учёта, а не сам учёт: главное здесь —
 * что состояние товара видно без звонка на склад.
 */
const T = {
  badge: c("Селлеру — взгляд с вашей стороны", "For sellers — the view from your side"),
  titleTop: c("Фулфилмент,", "Fulfilment"),
  titleAccent: c("который видно насквозь", "you can see through"),
  lead: c(
    "Выбрали склад — он подтвердил приём и прислал условия. Подписали электронно, назвали дату — дальше склад принимает, хранит и отгружает. Без созвонов и личных договорённостей.",
    "You pick a warehouse — it confirms intake and sends the terms. Sign electronically, name the date, and the warehouse receives, stores and ships. No calls, no side deals.",
  ),
  cta: c("Подобрать склад", "Find a warehouse"),
  how: c("Как это работает", "How it works"),
  in: c("в", "in"),
  free: c("заявка ничего не стоит", "a request costs nothing"),
  panelTitle: c("Ваш товар прямо сейчас", "Your goods right now"),
  panelSource: c("из WMS склада", "from the warehouse WMS"),
  panelNote: c(
    "Те же данные, что у кладовщика. Вопрос по строке уходит в чат с её номером.",
    "The same data the storekeeper sees. A question about a line goes to chat with its number.",
  ),
};

/** Три состояния товара — то, ради чего селлер и открывает витрину. */
const ROWS = (t: TFunc) =>
  [
    {
      step: "01",
      title: c("Поставка ПС-118", "Delivery PS-118"),
      note: c(
        "принята 14 мая · расхождение 4 шт с фото",
        "received 14 May · 4 pcs short, with photo",
      ),
      state: c("Принята", "Received"),
      tone: "text-emerald-700 dark:text-emerald-300",
    },
    {
      step: "02",
      title: c("На хранении", "In storage"),
      note: c("128 мест · ряд B, стеллажи 4–6", "128 slots · row B, racks 4–6"),
      state: c("42 300 ₽ / мес", "42 300 ₽ / mo"),
      tone: "text-foreground",
    },
    {
      step: "03",
      title: c("Заявка на отгрузку З-4472", "Shipment request Z-4472"),
      note: c("48 позиций · вывоз сегодня, 16:00", "48 lines · pickup today, 16:00"),
      state: c("Собирается", "Picking"),
      tone: "text-primary",
    },
  ].map((r) => ({ ...r, title: t(r.title), note: t(r.note), state: t(r.state) }));

export function Hero() {
  const t = useT();
  const { total, cities } = warehousesRepository.stats();

  return (
    <section className="mx-auto max-w-6xl px-4 pt-28 sm:px-6 sm:pt-36">
      <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)] lg:gap-16">
        <div>
          <a
            href={href("/sellers")}
            className="group inline-flex items-center gap-2 rounded-full border border-foreground/[0.12] py-1.5 pl-2.5 pr-3 text-[12px] font-medium text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground"
          >
            <span className="size-1.5 rounded-full bg-primary" />
            {t(T.badge)}
            <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
          </a>

          <h1 className="mt-7 font-display text-[38px] font-medium leading-[1.05] tracking-[-0.025em] sm:text-[56px] lg:text-[52px] xl:text-[60px]">
            {t(T.titleTop)}
            <br />
            <span className="text-brand-strong">{t(T.titleAccent)}</span>
          </h1>

          <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-muted-foreground sm:text-base">
            {t(T.lead)}
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            {/* Пилюля в пилюле: высота 52, поле справа 6 → кружок 40. Единственное
                место на странице, где вложение показано формой, — и та же
                кнопка повторяется в финале. */}
            <a
              href={href("/market")}
              className="group inline-flex h-[52px] w-full items-center justify-between gap-4 rounded-full bg-foreground pl-6 pr-1.5 text-sm font-medium text-background transition-transform hover:-translate-y-px active:translate-y-0 sm:w-auto sm:justify-start"
            >
              {t(T.cta)}
              <span className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors group-hover:bg-primary/85">
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </a>

            <a
              href="#how"
              className="inline-flex h-[52px] w-full items-center justify-center rounded-full border border-foreground/[0.14] px-7 text-sm font-medium transition-colors hover:border-foreground/30 hover:bg-foreground/[0.04] sm:w-auto"
            >
              {t(T.how)}
            </a>
          </div>

          <p className="mt-9 text-[13px] leading-relaxed text-muted-foreground">
            <Num>{total}</Num>{" "}
            {t.plural(total, ["склад", "склада", "складов"], ["warehouse", "warehouses"])} {t(T.in)}{" "}
            <Num>{cities}</Num>{" "}
            {t.plural(cities, ["городе", "городах", "городах"], ["city", "cities"])} · FBO, FBS, DBS
            · {t(T.free)}
          </p>
        </div>

        {/* Схема, а не скриншот: три состояния товара одной колонкой. Рамка
            одна, заливки нет — строки разделены линейками, как в накладной. */}
        <div className="r-window border border-foreground/[0.09]">
          <div className="flex items-center justify-between gap-3 border-b border-foreground/[0.09] px-4 py-3">
            <span className="text-[13px] font-medium">{t(T.panelTitle)}</span>
            <span className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
              <span className="size-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400" />
              {t(T.panelSource)}
            </span>
          </div>

          {ROWS(t).map((row) => (
            <StateRow key={row.step} {...row} />
          ))}

          <p className="px-4 py-3 text-[11px] leading-relaxed text-muted-foreground">
            {t(T.panelNote)}
          </p>
        </div>
      </div>
    </section>
  );
}

/** Число внутри строки фактов: моноширинное и на тон светлее подписи. */
function Num({ children }: { children: React.ReactNode }) {
  return <span className="font-mono tabular-nums text-foreground">{children}</span>;
}

function StateRow({
  step,
  title,
  note,
  state,
  tone,
}: {
  step: string;
  title: string;
  note: string;
  state: string;
  /** Класс цвета для правого столбца: статус — единственное цветное пятно строки. */
  tone: string;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-foreground/[0.09] px-4 py-3.5 last:border-0">
      <span className="mt-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">
        {step}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{title}</span>
        <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">
          {note}
        </span>
      </span>
      <span className={`shrink-0 whitespace-nowrap text-[11px] font-semibold tabular-nums ${tone}`}>
        {state}
      </span>
    </div>
  );
}
