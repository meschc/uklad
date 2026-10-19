import { useEffect, useRef, useState } from "react";
import { Check, MessagesSquare, PackageCheck, ScanLine, Truck } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Живой фрагмент кабинета для первого экрана: одна заявка проходит путь от
 * селлера до машины. Посетитель жмёт подсвеченную кнопку сам — это и есть
 * «взаимодействие с интерфейсом» (решение 19 окт); если не трогает, сцена
 * листается сама, пока он не нажмёт.
 *
 * Экраны собраны кодом по образцу настоящих («Задания», «Сборка», остатки
 * продавца), а не скриншотами: картинка устарела бы с первой правкой
 * кабинета, а здесь видно и движение, и текст остаётся текстом.
 * `data-ui` — фрагмент живёт по правилам кабинета, а не страницы.
 */

const ITEM = { sku: "УК-1103", name: "Пальто шерстяное, XL, camel", stock: 24, qty: 3 };
const CELL = "B-01-02-03";
const DEST = "СДЭК, Москва, шоссе Энтузиастов 56";

interface Scene {
  who: string;
  caption: string;
  action: string;
}

const SCENES: Scene[] = [
  {
    who: "Кабинет селлера",
    caption: "Селлер сам видит остатки и собирает заявку",
    action: "Отправить заявку",
  },
  {
    who: "Кабинет склада",
    caption: "Заявка сразу появляется в заданиях склада",
    action: "В работу",
  },
  {
    who: "ТСД сборщика",
    caption: "Сборщик идёт по адресу ячейки и сканирует товар",
    action: "Сканировать",
  },
  {
    who: "Кабинет склада",
    caption: "Собранное уезжает рейсом с номером машины",
    action: "Отгрузить",
  },
  { who: "Кабинет селлера", caption: "Селлер видит отгрузку без звонка складу", action: "Сначала" },
];

const AUTO_MS = 3200;

export function LiveFlow({ className }: { className?: string }) {
  const [step, setStep] = useState(0);
  const [scanned, setScanned] = useState(0);
  // Автопрокрутка до первого касания: дальше темп задаёт посетитель.
  const [auto, setAuto] = useState(true);
  const timer = useRef<number>();

  const next = () => {
    if (step === 2 && scanned < ITEM.qty) {
      setScanned((n) => n + 1);
      return;
    }
    setScanned(0);
    setStep((s) => (s + 1) % SCENES.length);
  };

  useEffect(() => {
    if (!auto || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    timer.current = window.setTimeout(next, step === 2 ? 700 : AUTO_MS);
    return () => window.clearTimeout(timer.current);
  });

  const press = () => {
    setAuto(false);
    next();
  };
  const scene = SCENES[step];

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {/* Рамка устройства: тёмный ободок вокруг экрана, как в референсе
          Roombox, — по нему видно, что это настоящий интерфейс, а не картинка. */}
      <div className="rounded-[26px] bg-[#0d0e11] p-2 sm:p-2.5">
        <div data-ui className="overflow-hidden rounded-[18px] bg-background text-foreground">
          <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-2.5 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{scene.who}</span>
            <span className="tabular-nums">
              {step + 1} из {SCENES.length}
            </span>
          </div>

          <div key={step} className="flow-scene min-h-[268px] p-4 sm:p-5">
            {step === 0 && <SellerOrder onPress={press} />}
            {step === 1 && <WarehouseTasks onPress={press} />}
            {step === 2 && <Picking scanned={scanned} onPress={press} />}
            {step === 3 && <Shipping onPress={press} />}
            {step === 4 && <SellerShipped onPress={press} />}
          </div>
        </div>
      </div>

      <div className="flex items-start justify-between gap-4">
        <p className="text-base leading-snug">{scene.caption}</p>
        <div className="flex shrink-0 gap-1.5 pt-2" aria-hidden>
          {SCENES.map((s, i) => (
            <span
              key={s.caption}
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                i === step ? "w-6 bg-current" : "w-1.5 bg-current opacity-30",
              )}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- Сцены ---------- */

function Title({ children, sub }: { children: string; sub: string }) {
  return (
    <div className="mb-4">
      <p className="text-base font-semibold">{children}</p>
      <p className="text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

function ActionButton({ children, onPress }: { children: string; onPress: () => void }) {
  return (
    <button
      type="button"
      onClick={onPress}
      // Кольцо подсказывает, что кнопку можно нажать: в макете это неочевидно.
      className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground ring-4 ring-primary/25 transition-transform hover:ring-primary/40 active:scale-[0.97]"
    >
      {children}
    </button>
  );
}

function ItemRow({ right }: { right: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm">{ITEM.name}</p>
        <p className="font-mono text-[11px] text-muted-foreground">{ITEM.sku}</p>
      </div>
      {right}
    </div>
  );
}

function Badge({ tone, children }: { tone: "new" | "done" | "ship"; children: string }) {
  const tones = {
    new: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    done: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    ship: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  };
  return (
    <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-medium", tones[tone])}>
      {children}
    </span>
  );
}

function SellerOrder({ onPress }: { onPress: () => void }) {
  return (
    <>
      <Title sub="Склад «Энтузиастов», 12 позиций">Остатки</Title>
      <ItemRow
        right={
          <div className="text-right">
            <p className="text-sm tabular-nums">{ITEM.qty} шт.</p>
            <p className="text-[11px] text-muted-foreground">на складе {ITEM.stock}</p>
          </div>
        }
      />
      <div className="mt-3 rounded-lg bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground">
        Куда: {DEST} · машина А 123 ВС 77
      </div>
      <div className="mt-4 flex justify-end">
        <ActionButton onPress={onPress}>{SCENES[0].action}</ActionButton>
      </div>
    </>
  );
}

function WarehouseTasks({ onPress }: { onPress: () => void }) {
  return (
    <>
      <Title sub="Заявки сгруппированы по назначению">Задания</Title>
      <p className="mb-2 text-xs font-medium text-muted-foreground">{DEST}</p>
      <ItemRow right={<Badge tone="new">Новая</Badge>} />
      <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
        <MessagesSquare className="size-3.5" /> Вопрос по заявке придёт сюда же, в чат
      </div>
      <div className="mt-4 flex justify-end">
        <ActionButton onPress={onPress}>{SCENES[1].action}</ActionButton>
      </div>
    </>
  );
}

function Picking({ scanned, onPress }: { scanned: number; onPress: () => void }) {
  const done = scanned >= ITEM.qty;
  return (
    <>
      <Title sub="Поштучный пересчёт">Сборка</Title>
      <div className="flex items-center justify-between rounded-lg border border-primary/40 bg-primary/5 px-3 py-3">
        <div>
          <p className="text-[11px] text-muted-foreground">Ячейка</p>
          <p className="font-mono text-lg font-semibold tracking-tight">{CELL}</p>
        </div>
        <p className="text-2xl font-semibold tabular-nums">
          {scanned}
          <span className="text-muted-foreground">/{ITEM.qty}</span>
        </p>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300"
          style={{ width: `${(scanned / ITEM.qty) * 100}%` }}
        />
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          {done ? (
            <PackageCheck className="size-4 shrink-0 text-emerald-600" />
          ) : (
            <ScanLine className="size-4 shrink-0" />
          )}
          <span className="truncate">{done ? "Собрано, можно грузить" : ITEM.name}</span>
        </span>
        <ActionButton onPress={onPress}>{done ? "Готово" : SCENES[2].action}</ActionButton>
      </div>
    </>
  );
}

function Shipping({ onPress }: { onPress: () => void }) {
  return (
    <>
      <Title sub={DEST}>Погрузка</Title>
      <ItemRow right={<Badge tone="done">Собрана</Badge>} />
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-muted/50 px-3 py-2">
          <p className="text-muted-foreground">Машина</p>
          <p className="mt-0.5 font-medium">А 123 ВС 77</p>
        </div>
        <div className="rounded-lg bg-muted/50 px-3 py-2">
          <p className="text-muted-foreground">Ответственный</p>
          <p className="mt-0.5 font-medium">Иван Петров</p>
        </div>
      </div>
      <div className="mt-4 flex justify-end">
        <ActionButton onPress={onPress}>{SCENES[3].action}</ActionButton>
      </div>
    </>
  );
}

function SellerShipped({ onPress }: { onPress: () => void }) {
  return (
    <>
      <Title sub="Склад «Энтузиастов»">Мои заявки</Title>
      <ItemRow right={<Badge tone="ship">Отгружена</Badge>} />
      <div className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2.5 text-xs text-emerald-800 dark:text-emerald-200">
        <Truck className="size-4" />
        Уехало 20.10 · машина А 123 ВС 77
        <Check className="ml-auto size-4" />
      </div>
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={onPress}
          className="inline-flex h-9 items-center rounded-md border border-border px-4 text-sm font-medium transition-colors hover:bg-muted"
        >
          {SCENES[4].action}
        </button>
      </div>
    </>
  );
}
