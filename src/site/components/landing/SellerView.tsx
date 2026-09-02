import { useEffect, useState } from "react";
import { Boxes, ClipboardCheck, LayoutGrid, MessagesSquare, Truck } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChatPanel } from "../ChatPanel";
import { Reveal } from "../Reveal";
import { SectionHead } from "../SectionHead";
import { PlanShowcase } from "./PlanShowcase";

const TABS = [
  {
    id: "stock",
    icon: Boxes,
    title: "Остатки и стоимость",
    body: "Сколько единиц лежит, сколько зарезервировано под заявки, сколько места занято и на сколько набежало хранение.",
  },
  {
    id: "receiving",
    icon: ClipboardCheck,
    title: "Приёмка",
    body: "Что приехало и что не сошлось с накладной — по строкам, с фотографией брака. Расхождение видно в день приёмки, а не в конце месяца.",
  },
  {
    id: "plan",
    icon: LayoutGrid,
    title: "Где лежит товар",
    body: "Не строка «A-01-03-02», а сам склад сверху: видно ряд, стеллаж и ячейку, где стоит ваш товар.",
  },
  {
    id: "shipping",
    icon: Truck,
    title: "Отгрузка",
    body: "Заявка собрана, коробки подписаны, машина ушла. У каждой — статус, дата вывоза и номер рейса.",
  },
  {
    id: "chat",
    icon: MessagesSquare,
    title: "Вопрос складу",
    body: "Чат открыт на каждом экране и знает, о чём вы спрашиваете: у позиции, у поставки, у заявки. Кладовщик отвечает там же.",
  },
] as const;

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
  const [active, setActive] = useState(0);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    if (locked) return;
    const id = setInterval(() => setActive((i) => (i + 1) % TABS.length), AUTO_MS);
    return () => clearInterval(id);
  }, [locked]);

  return (
    <section id="product" className="mx-auto max-w-6xl px-4 py-24 sm:px-6 sm:py-28">
      <SectionHead
        eyebrow="Что видит селлер"
        title="Личный кабинет вместо переписки"
        // Перечень «остатки, место, стоимость, статусы» уже стоит пятым шагом
        // выше и повторяется во вкладках ниже. Здесь он был третий раз подряд.
        lead="Всё о вашем товаре — в кабинете, теми же данными, что видит кладовщик."
      />

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
              {tab.title}

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
        {TABS[active].body}
      </p>

      <div className="mt-6">
        <Reveal delay={120}>
          <div className="r-window overflow-hidden border border-border bg-card shadow-xl shadow-black/5">
            <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-4 py-2.5">
              <span className="size-2 rounded-full bg-muted-foreground/25" />
              <span className="size-2 rounded-full bg-muted-foreground/25" />
              <span className="size-2 rounded-full bg-muted-foreground/25" />
              <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                кабинет селлера · {TABS[active].title.toLowerCase()}
              </span>
            </div>
            {/* Разбор по идентификатору, а не по номеру вкладки: порядок
                вкладок — это редактура текста, и она не должна ломать то,
                какой макет к какой вкладке относится. */}
            <div key={active} className="animate-fade-in p-4 sm:p-6">
              {TABS[active].id === "stock" && <StockMock />}
              {TABS[active].id === "receiving" && <ReceivingMock />}
              {TABS[active].id === "plan" && <PlanShowcase />}
              {TABS[active].id === "shipping" && <ShippingMock />}
              {TABS[active].id === "chat" && (
                <ChatPanel
                  to="Ярус Логистик"
                  subject="УК-1071, приёмка от 14 мая"
                  responseHours={2}
                  presets={[
                    "Почему 4 штуки в расхождении?",
                    "Когда отгрузите заявку З-4472?",
                    "Есть фото брака?",
                  ]}
                />
              )}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

const STOCK = [
  { sku: "УК-1042", name: "Худи оверсайз, чёрное", total: 420, reserved: 96, cells: 6 },
  { sku: "УК-1071", name: "Кружка керамика 350 мл", total: 1180, reserved: 240, cells: 14 },
  { sku: "УК-2003", name: "Коврик для йоги, 6 мм", total: 96, reserved: 88, cells: 3 },
  { sku: "УК-2210", name: "Лампа настольная LED", total: 240, reserved: 12, cells: 5 },
];

function StockMock() {
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
              <span className="truncate text-sm font-semibold">{r.name}</span>
              <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                {r.sku}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-3">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${share}%` }}
                />
              </div>
              <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                {r.total} шт · бронь {r.reserved} · {r.cells} ячеек
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const RECEIVING = [
  { sku: "УК-1042", plan: 120, fact: 120 },
  { sku: "УК-1071", plan: 300, fact: 296 },
  { sku: "УК-2003", plan: 48, fact: 48 },
  { sku: "УК-2210", plan: 60, fact: 57 },
];

function ReceivingMock() {
  return (
    <div className="r-inset overflow-hidden border border-border">
      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 border-b border-border bg-muted/50 px-4 py-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        <span>Артикул</span>
        <span className="text-right">План</span>
        <span className="text-right">Факт</span>
        <span className="text-right">Расхождение</span>
      </div>
      {RECEIVING.map((r, i) => {
        const diff = r.fact - r.plan;
        return (
          <div
            key={r.sku}
            className="grid grid-cols-[1fr_auto_auto_auto] gap-4 border-b border-border px-4 py-2.5 text-sm last:border-0"
            style={{ animation: `plan-cell 420ms cubic-bezier(.16,1,.3,1) ${i * 70}ms backwards` }}
          >
            <span className="font-mono text-[12px]">{r.sku}</span>
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
        Две строки не сошлись: 4 кружки бой, 3 лампы без упаковки. Фото приложены
        к акту приёмки.
      </p>
    </div>
  );
}

const SHIPMENTS = [
  { id: "З-4471", to: "WB · Коледино", items: 96, state: "Уехала", when: "вчера, 19:40" },
  { id: "З-4472", to: "Ozon · Хоругвино", items: 48, state: "Ждёт погрузки", when: "сегодня, 16:00" },
  { id: "З-4473", to: "Яндекс · Софьино", items: 130, state: "Собирается", when: "завтра, 09:00" },
];

const STATE_TONE: Record<string, string> = {
  Уехала: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  "Ждёт погрузки": "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  Собирается: "bg-primary/12 text-primary",
};

function ShippingMock() {
  return (
    <div className="flex flex-col gap-2.5">
      {SHIPMENTS.map((s, i) => (
        <div
          key={s.id}
          className="r-inset flex flex-wrap items-center gap-3 border border-border bg-background p-3.5"
          style={{ animation: `plan-cell 420ms cubic-bezier(.16,1,.3,1) ${i * 80}ms backwards` }}
        >
          <span className="font-mono text-xs font-semibold">{s.id}</span>
          <span className="min-w-0 flex-1 truncate text-sm">{s.to}</span>
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {s.items} шт · {s.when}
          </span>
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-[10px] font-semibold",
              STATE_TONE[s.state],
            )}
          >
            {s.state}
          </span>
        </div>
      ))}
    </div>
  );
}
