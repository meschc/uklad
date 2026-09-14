import { useEffect, useState } from "react";
import { Boxes, ClipboardCheck, LayoutGrid, MessagesSquare, Truck } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChatPanel } from "../ChatPanel";
import { Reveal } from "../Reveal";
import { SectionHead } from "../SectionHead";
import { PlanShowcase } from "./PlanShowcase";
import { c, useT } from "../../lib/copy";

const TABS = [
  {
    id: "stock",
    icon: Boxes,
    title: c("Остатки и стоимость", "Stock and charges"),
    body: c(
      "Сколько единиц лежит, сколько зарезервировано под заявки, сколько места занято и на сколько набежало хранение.",
      "How many units are in, how many are reserved for requests, how much space is taken and how much storage has accrued.",
    ),
  },
  {
    id: "receiving",
    icon: ClipboardCheck,
    title: c("Приёмка", "Intake"),
    body: c(
      "Что приехало и что не сошлось с накладной — по строкам, с фотографией брака. Расхождение видно в день приёмки.",
      "What arrived and what did not match the waybill — line by line, with photos of defects. A discrepancy shows on intake day.",
    ),
  },
  {
    id: "plan",
    icon: LayoutGrid,
    title: c("Где лежит товар", "Where the goods are"),
    body: c(
      "Не строка «A-01-03-02», а сам склад сверху: видно ряд, стеллаж и ячейку, где стоит ваш товар.",
      "Not a line reading “A-01-03-02”, but the warehouse from above: the aisle, the rack and the slot your goods sit in.",
    ),
  },
  {
    id: "shipping",
    icon: Truck,
    title: c("Отгрузка", "Shipping"),
    body: c(
      "Заявка собрана, коробки подписаны, машина ушла. У каждой — статус, дата вывоза и номер рейса.",
      "The request is picked, the boxes are labelled, the van has left. Each one carries a status, a date and a trip number.",
    ),
  },
  {
    id: "chat",
    icon: MessagesSquare,
    title: c("Вопрос складу", "Ask the warehouse"),
    body: c(
      "Чат открыт на каждом экране и знает, о чём вы спрашиваете: у позиции, у поставки, у заявки. Кладовщик отвечает там же.",
      "The chat is on every screen and knows what you are asking about: an item, a delivery, a request. The storekeeper answers right there.",
    ),
  },
] as const;

const T = {
  eyebrow: c("Что видит селлер", "What the seller sees"),
  title: c("Личный кабинет вместо переписки", "An account instead of a mailbox"),
  // Перечень «остатки, место, стоимость, статусы» уже стоит пятым шагом выше и
  // повторяется во вкладках ниже. Здесь он был третий раз подряд.
  lead: c(
    "Всё о вашем товаре — в кабинете, теми же данными, что видит кладовщик.",
    "Everything about your goods in one account, on the same data the storekeeper sees.",
  ),
  chatTo: c("Ярус Логистик", "Yarus Logistics"),
  chatSubject: c("УК-1071, приёмка от 14 мая", "UK-1071, intake of 14 May"),
  chatPresets: [
    c("Почему 4 штуки в расхождении?", "Why are 4 units in discrepancy?"),
    c("Когда отгрузите заявку З-4472?", "When will request Z-4472 ship?"),
    c("Есть фото брака?", "Are there photos of the damage?"),
  ],
};

const AUTO_MS = 6000;

/**
 * «Что видит селлер» — пять вкладок с макетами экранов.
 *
 * Вкладки переключаются сами, но останавливаются навсегда после первого клика.
 * Карусель, которая продолжает крутиться под руками, — классический способ
 * отобрать у человека экран, который он только что выбрал сам.
 *
 * Раскладка — строка вкладок над макетом, а не колонка карточек сбоку. В
 * колонке лежало пять карточек с заголовком и тремя строками текста каждая:
 * вместе они были выше макета, ради которого секцию и открывают, и вся секция
 * переставала помещаться в экран. При этом четыре из пяти описаний в любой
 * момент относятся к тому, что сейчас не показано, — то есть высоту занимал
 * текст, который никто не читает.
 *
 * Теперь на виду только название вкладки, описание — одно, у выбранной, а
 * макет получил всю ширину: план склада и чат от этого выигрывают заметно.
 */
export function SellerView() {
  const t = useT();
  const [active, setActive] = useState(0);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    if (locked) return;
    const id = setInterval(() => setActive((i) => (i + 1) % TABS.length), AUTO_MS);
    return () => clearInterval(id);
  }, [locked]);

  return (
    <section id="product" className="mx-auto max-w-6xl px-4 py-24 sm:px-6 sm:py-28">
      <SectionHead eyebrow={t(T.eyebrow)} title={t(T.title)} lead={t(T.lead)} />

      <Reveal className="mt-12 flex flex-wrap justify-center gap-2">
        {TABS.map((tab, i) => {
          const on = i === active;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActive(i);
                setLocked(true);
              }}
              className={cn(
                "relative inline-flex h-10 items-center gap-2 overflow-hidden rounded-full border px-4 text-[13px] font-medium transition-colors",
                on
                  ? "border-primary/45 bg-primary/[0.08] text-foreground"
                  : "border-border text-muted-foreground hover:border-foreground/25 hover:text-foreground",
              )}
            >
              <tab.icon
                className={cn(
                  "size-4 shrink-0 transition-colors",
                  on ? "text-primary" : "text-muted-foreground",
                )}
              />
              {t(tab.title)}

              {/* Полоска-таймер: видно, что вкладка сменится сама. */}
              {on && !locked && (
                <span
                  key={active}
                  className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-primary/60"
                  style={{ animation: `plan-timer ${AUTO_MS}ms linear forwards` }}
                />
              )}
            </button>
          );
        })}
      </Reveal>

      {/* Высота зафиксирована снизу: описания у вкладок разной длины, и без
          этого макет под ними подпрыгивал бы на каждом переключении. Подпорка
          считается по самому длинному описанию — после сокращения текстов она
          на строку меньше, иначе под абзацем осталась бы пустая полоса. */}
      <p
        key={TABS[active].id}
        className="mx-auto mt-6 min-h-[68px] max-w-2xl animate-fade-in text-center text-sm leading-relaxed text-muted-foreground sm:min-h-[46px]"
      >
        {t(TABS[active].body)}
      </p>

      {/* Подобия окна браузера вокруг макета больше нет. Оно обещало
          скриншот чужой программы, хотя показывает ровно тот интерфейс, в
          который человек попадёт сам, — и добавляло второй кадр к тому, что и
          так в кадре: у таблицы, чата и плана рамки свои. */}
      <div className="mt-8">
        <Reveal delay={120}>
          {/* Разбор по идентификатору, а не по номеру вкладки: порядок
              вкладок — это редактура текста, и она не должна ломать то,
              какой макет к какой вкладке относится. */}
          <div key={active} className="animate-fade-in">
            {TABS[active].id === "stock" && <StockMock />}
            {TABS[active].id === "receiving" && <ReceivingMock />}
            {TABS[active].id === "plan" && <PlanShowcase />}
            {TABS[active].id === "shipping" && <ShippingMock />}
            {TABS[active].id === "chat" && (
              <ChatPanel
                to={t(T.chatTo)}
                subject={t(T.chatSubject)}
                responseHours={2}
                presets={T.chatPresets.map((p) => t(p))}
              />
            )}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/**
 * Артикулы хранятся числом, а буквенный префикс приходит из перевода: «УК» на
 * русском и «UK» на английском — это одно и то же обозначение, просто набранное
 * своим алфавитом, и латинская страница с кириллическим кодом читается как
 * недоделанный перевод.
 */
const M = {
  sku: c("УК", "UK"),
  order: c("З", "Z"),
  stock: c(
    "{total} шт · бронь {reserved} · {cells} ячеек",
    "{total} pcs · {reserved} reserved · {cells} slots",
  ),
  colSku: c("Артикул", "SKU"),
  colPlan: c("План", "Planned"),
  colFact: c("Факт", "Actual"),
  colDiff: c("Расхождение", "Difference"),
  mismatch: c(
    "Две строки не сошлись: 4 кружки бой, 3 лампы без упаковки. Фото приложены к акту.",
    "Two lines did not match: 4 mugs broken, 3 lamps unpacked. Photos are attached to the statement.",
  ),
  items: c("{n} шт · {when}", "{n} pcs · {when}"),
};

const STOCK = [
  {
    sku: 1042,
    name: c("Худи оверсайз, чёрное", "Oversized hoodie, black"),
    total: 420,
    reserved: 96,
    cells: 6,
  },
  {
    sku: 1071,
    name: c("Кружка керамика 350 мл", "Ceramic mug, 350 ml"),
    total: 1180,
    reserved: 240,
    cells: 14,
  },
  {
    sku: 2003,
    name: c("Коврик для йоги, 6 мм", "Yoga mat, 6 mm"),
    total: 96,
    reserved: 88,
    cells: 3,
  },
  {
    sku: 2210,
    name: c("Лампа настольная LED", "LED desk lamp"),
    total: 240,
    reserved: 12,
    cells: 5,
  },
];

function StockMock() {
  const t = useT();

  return (
    <div className="flex flex-col gap-2">
      {STOCK.map((r, i) => {
        const share = Math.round((r.reserved / r.total) * 100);
        return (
          <div
            key={r.sku}
            className="r-inset border border-border bg-background p-3"
            style={{ animation: `plan-cell 420ms cubic-bezier(.16,1,.3,1) ${i * 70}ms backwards` }}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-sm font-semibold">{t(r.name)}</span>
              <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                {t(M.sku)}-{r.sku}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-3">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${share}%` }} />
              </div>
              <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                {t(M.stock, { total: r.total, reserved: r.reserved, cells: r.cells })}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const RECEIVING = [
  { sku: 1042, plan: 120, fact: 120 },
  { sku: 1071, plan: 300, fact: 296 },
  { sku: 2003, plan: 48, fact: 48 },
  { sku: 2210, plan: 60, fact: 57 },
];

function ReceivingMock() {
  const t = useT();

  return (
    <div className="r-inset overflow-hidden border border-border">
      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 border-b border-border bg-muted/50 px-4 py-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        <span>{t(M.colSku)}</span>
        <span className="text-right">{t(M.colPlan)}</span>
        <span className="text-right">{t(M.colFact)}</span>
        <span className="text-right">{t(M.colDiff)}</span>
      </div>
      {RECEIVING.map((r, i) => {
        const diff = r.fact - r.plan;
        return (
          <div
            key={r.sku}
            className="grid grid-cols-[1fr_auto_auto_auto] gap-4 border-b border-border px-4 py-2.5 text-sm last:border-0"
            style={{ animation: `plan-cell 420ms cubic-bezier(.16,1,.3,1) ${i * 70}ms backwards` }}
          >
            <span className="font-mono text-[12px]">
              {t(M.sku)}-{r.sku}
            </span>
            <span className="text-right tabular-nums text-muted-foreground">{r.plan}</span>
            <span className="text-right tabular-nums">{r.fact}</span>
            <span
              className={cn(
                "text-right tabular-nums",
                // Оттенки на две ступени светлее «бумажных»: на тёмном фоне
                // 600-е из палитры Tailwind уходят в грязь и читаются хуже
                // серого текста рядом.
                diff === 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "font-semibold text-amber-600 dark:text-amber-400",
              )}
            >
              {diff === 0 ? "—" : diff}
            </span>
          </div>
        );
      })}
      <p className="bg-amber-500/10 px-4 py-2 text-[11px] text-amber-700 dark:text-amber-300">
        {t(M.mismatch)}
      </p>
    </div>
  );
}

/**
 * Статус хранится ключом, а не подписью. Раньше цвет плашки искался по русской
 * строке — стоило перевести её, и плашка молча теряла цвет.
 */
const SHIPMENT_STATES = {
  gone: {
    label: c("Уехала", "Shipped"),
    tone: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  },
  loading: {
    label: c("Ждёт погрузки", "Awaiting loading"),
    tone: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  },
  picking: { label: c("Собирается", "Being picked"), tone: "bg-primary/12 text-primary" },
} as const;

const SHIPMENTS = [
  {
    id: 4471,
    to: c("WB · Коледино", "WB · Koledino"),
    items: 96,
    state: "gone",
    when: c("вчера, 19:40", "yesterday, 19:40"),
  },
  {
    id: 4472,
    to: c("Ozon · Хоругвино", "Ozon · Khoruhvino"),
    items: 48,
    state: "loading",
    when: c("сегодня, 16:00", "today, 16:00"),
  },
  {
    id: 4473,
    to: c("Яндекс · Софьино", "Yandex · Sofyino"),
    items: 130,
    state: "picking",
    when: c("завтра, 09:00", "tomorrow, 09:00"),
  },
] as const;

function ShippingMock() {
  const t = useT();

  return (
    <div className="flex flex-col gap-2.5">
      {SHIPMENTS.map((s, i) => (
        <div
          key={s.id}
          className="r-inset flex flex-wrap items-center gap-3 border border-border bg-background p-3.5"
          style={{ animation: `plan-cell 420ms cubic-bezier(.16,1,.3,1) ${i * 80}ms backwards` }}
        >
          <span className="font-mono text-xs font-semibold">
            {t(M.order)}-{s.id}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm">{t(s.to)}</span>
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {t(M.items, { n: s.items, when: t(s.when) })}
          </span>
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-[10px] font-semibold",
              SHIPMENT_STATES[s.state].tone,
            )}
          >
            {t(SHIPMENT_STATES[s.state].label)}
          </span>
        </div>
      ))}
    </div>
  );
}
