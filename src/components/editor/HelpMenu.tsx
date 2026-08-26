import { useEffect, useState } from "react";
import { BookOpen, Check, HelpCircle, Keyboard, RotateCcw, X } from "lucide-react";
import { useEditor } from "@/lib/store";
import { useT, type TFunc } from "@/lib/i18n";
import {
  ALT_KEY as ALT,
  DEL_KEY as DEL,
  MOD_KEY as MOD,
  SHIFT_KEY as SHIFT,
} from "@/lib/platform";
import { cn } from "@/lib/utils";

/**
 * Плавающая справка «?» (ТЗ, разд. 2 — онбординг и справка). Две вкладки:
 * «Справка» (частые вопросы + изометрические схемы + повтор онбординга) и
 * «Клавиши» (все горячие сочетания, символы модификаторов зависят от ОС).
 * Раньше здесь были только клавиши — теперь это единая точка помощи.
 */

const SPACE = "Space";

type Tok = { kbd: string } | { txt: string } | "plus";
interface Row {
  label: string;
  keys: Tok[];
}

function buildGroups(t: TFunc): { title: string; rows: Row[] }[] {
  const drag = t("help.k.drag");
  const click = t("help.k.click");
  return [
    {
      title: t("help.group.tools"),
      rows: [
        { label: t("tool.select"), keys: [{ kbd: "V" }] },
        { label: t("tool.pan"), keys: [{ kbd: "H" }] },
        { label: t("module.section.title"), keys: [{ kbd: "1" }] },
        { label: t("module.stairs.title"), keys: [{ kbd: "2" }] },
        { label: t("module.elevator.title"), keys: [{ kbd: "3" }] },
      ],
    },
    {
      title: t("help.group.edit"),
      rows: [
        { label: t("edit.undo"), keys: [{ kbd: MOD }, "plus", { kbd: "Z" }] },
        {
          label: t("edit.redo"),
          keys: [{ kbd: MOD }, "plus", { kbd: SHIFT }, "plus", { kbd: "Z" }],
        },
        { label: t("help.copy"), keys: [{ kbd: MOD }, "plus", { kbd: "C" }] },
        { label: t("help.cut"), keys: [{ kbd: MOD }, "plus", { kbd: "X" }] },
        { label: t("help.paste"), keys: [{ kbd: MOD }, "plus", { kbd: "V" }] },
        { label: t("help.duplicate"), keys: [{ kbd: MOD }, "plus", { kbd: "D" }] },
        {
          label: t("help.dragDup"),
          keys: [{ kbd: ALT }, "plus", { txt: drag }],
        },
        { label: t("help.selectAll"), keys: [{ kbd: MOD }, "plus", { kbd: "A" }] },
        { label: t("help.rotate"), keys: [{ kbd: "R" }] },
        { label: t("help.delete"), keys: [{ kbd: DEL }] },
        { label: t("help.deselect"), keys: [{ kbd: "Esc" }] },
      ],
    },
    {
      title: t("help.group.view"),
      rows: [
        { label: t("help.marquee"), keys: [{ txt: t("help.k.emptyDrag") }] },
        {
          label: t("help.addSel"),
          keys: [{ kbd: SHIFT }, "plus", { txt: click }],
        },
        {
          label: t("help.panGesture"),
          keys: [{ kbd: SPACE }, "plus", { txt: drag }],
        },
        {
          label: t("help.zoom"),
          keys: [{ txt: t("help.k.wheel") }, "plus", { txt: t("help.k.pinch") }],
        },
      ],
    },
  ];
}

function Keys({ keys }: { keys: Tok[] }) {
  return (
    <span className="flex items-center gap-1">
      {keys.map((k, i) =>
        k === "plus" ? (
          <span key={i} className="text-[10px] text-muted-foreground/50">
            +
          </span>
        ) : "kbd" in k ? (
          <kbd
            key={i}
            className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded border border-border bg-muted px-1 text-[11px] font-medium text-foreground shadow-[0_1px_0_hsl(var(--border))]"
          >
            {k.kbd}
          </kbd>
        ) : (
          <span key={i} className="text-[11px] text-muted-foreground">
            {k.txt}
          </span>
        ),
      )}
    </span>
  );
}

/**
 * Изометрическая схема двустороннего ряда: две линии секций через проход,
 * ближняя сторона — нечёт, дальняя — чёт (складская классика). Цвета — из
 * токенов темы, поэтому схема одинаково читается в светлой и тёмной теме.
 */
function RowScheme({ t }: { t: TFunc }) {
  // Плоский вид сверху — тот же язык, что и у 2D-плана в редакторе: секции
  // прямоугольниками, между сторонами ряда — полоса прохода. Никакой
  // проекции: схема должна читаться так же, как сам план.
  // Ряды на плане стоят вертикально: секции — узкие столбики, стороны ряда
  // разделены вертикальным проходом.
  const cell = (n: number, near: boolean) => (
    <div
      key={n}
      className={cn(
        "flex h-8 w-9 items-center justify-center rounded-[4px] text-xs font-bold tabular-nums",
        near
          ? "bg-primary text-primary-foreground"
          : "bg-primary/40 text-primary-foreground",
      )}
    >
      {n}
    </div>
  );
  return (
    <div className="flex items-stretch justify-center gap-1.5">
      <div className="flex flex-col gap-1.5">
        {[1, 3, 5].map((n) => cell(n, true))}
      </div>
      <div className="flex w-6 items-center justify-center rounded-[4px] border border-dashed border-border bg-[hsl(var(--floor))]">
        <span className="rotate-180 text-[9px] uppercase tracking-wide text-muted-foreground [writing-mode:vertical-rl]">
          {t("module.aisle.title")}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        {[2, 4, 6].map((n) => cell(n, false))}
      </div>
    </div>
  );
}

/** Схема адреса: цепочка «этаж-ряд-секция-полка-ячейка» с примером. */
function AddressScheme({ t }: { t: TFunc }) {
  const parts = [
    { label: t("faq.addr.floor"), n: "2" },
    { label: t("faq.addr.row"), n: "19" },
    { label: t("faq.addr.section"), n: "20" },
    { label: t("faq.addr.shelf"), n: "3" },
    { label: t("faq.addr.cell"), n: "4" },
  ];
  return (
    <div className="flex flex-wrap items-end justify-center gap-1">
      {parts.map((p, i) => (
        <div key={p.label} className="flex items-end gap-1">
          <div className="flex flex-col items-center gap-0.5">
            <span className="flex h-6 min-w-6 items-center justify-center rounded-md bg-primary/10 px-1.5 font-mono text-sm font-bold tabular-nums text-primary">
              {p.n}
            </span>
            <span className="text-[8px] leading-none text-muted-foreground">
              {p.label}
            </span>
          </div>
          {i < parts.length - 1 && (
            <span className="pb-3 font-mono text-sm text-muted-foreground/50">
              -
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  return (
    <div className="rounded-lg border border-border bg-card/60 p-2.5">
      <p className="text-xs font-semibold text-foreground">{q}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{a}</p>
    </div>
  );
}

export function HelpMenu() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"faq" | "keys">("faq");
  const [reset, setReset] = useState(false);
  const resetHints = useEditor((s) => s.resetHints);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);

  // Сбрасываем «галочку готово» при новом открытии панели.
  useEffect(() => {
    if (!open) setReset(false);
  }, [open]);

  const groups = buildGroups(t);
  const faq = [
    { q: t("faq.row.q"), a: t("faq.row.a") },
    { q: t("faq.floor.q"), a: t("faq.floor.a") },
    { q: t("faq.lod.q"), a: t("faq.lod.a") },
    { q: t("faq.continue.q"), a: t("faq.continue.a") },
    { q: t("faq.bulkShelves.q"), a: t("faq.bulkShelves.a") },
    { q: t("faq.dragDup.q"), a: t("faq.dragDup.a") },
    // Фулфилмент-контур: экраны появились в боковом меню, объясняем их здесь же.
    { q: t("faq.fulfillment.q"), a: t("faq.fulfillment.a") },
    { q: t("faq.roles.q"), a: t("faq.roles.a") },
    { q: t("faq.labels.q"), a: t("faq.labels.a") },
    { q: t("faq.crossDock.q"), a: t("faq.crossDock.a") },
    { q: t("faq.pickPriority.q"), a: t("faq.pickPriority.a") },
    { q: t("faq.nav3d.q"), a: t("faq.nav3d.a") },
  ];

  const TabBtn = ({
    id,
    icon,
    label,
  }: {
    id: "faq" | "keys";
    icon: React.ReactNode;
    label: string;
  }) => (
    <button
      onClick={() => setTab(id)}
      className={cn(
        "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors",
        tab === id
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div className="pointer-events-auto absolute bottom-4 left-4 z-20">
      {open && (
        <>
          <div className="fixed inset-0 z-0" onPointerDown={() => setOpen(false)} />
          <div className="absolute bottom-11 left-0 z-10 w-80 animate-pop rounded-xl border border-border bg-popover/95 p-3 shadow-lg backdrop-blur">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold">{t("help.centerTitle")}</p>
              <button
                onClick={() => setOpen(false)}
                className="flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            </div>

            <div className="mb-3 flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
              <TabBtn id="faq" icon={<BookOpen className="size-3.5" />} label={t("help.tab.faq")} />
              <TabBtn id="keys" icon={<Keyboard className="size-3.5" />} label={t("help.tab.keys")} />
            </div>

            <div className="flex max-h-[62vh] flex-col gap-3 overflow-y-auto pr-0.5">
              {tab === "faq" ? (
                <>
                  {/* Схема ряда — плоская, как сам 2D-план */}
                  <div className="rounded-lg border border-border bg-muted/30 p-2">
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {t("faq.rowScheme")}
                    </p>
                    <RowScheme t={t} />
                    <p className="mt-1 text-center text-[10px] text-muted-foreground">
                      {t("faq.rowSchemeNote")}
                    </p>
                  </div>

                  {/* Схема адреса */}
                  <div className="rounded-lg border border-border bg-muted/30 p-2">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {t("faq.addrScheme")}
                    </p>
                    <AddressScheme t={t} />
                  </div>

                  {faq.map((f) => (
                    <FaqItem key={f.q} q={f.q} a={f.a} />
                  ))}

                  {/* Пройти онбординг заново */}
                  <button
                    onClick={() => {
                      resetHints();
                      setReset(true);
                      useEditor.getState().showHint("welcome");
                    }}
                    className="flex items-center justify-center gap-1.5 rounded-lg border border-border py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-primary"
                  >
                    {reset ? (
                      <>
                        <Check className="size-3.5 text-emerald-500" />
                        {t("help.onboardingReset")}
                      </>
                    ) : (
                      <>
                        <RotateCcw className="size-3.5" />
                        {t("help.replayOnboarding")}
                      </>
                    )}
                  </button>
                </>
              ) : (
                groups.map((g) => (
                  <div key={g.title}>
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {g.title}
                    </p>
                    <div className="flex flex-col">
                      {g.rows.map((r) => (
                        <div
                          key={r.label}
                          className="flex items-center justify-between gap-3 py-1"
                        >
                          <span className="text-xs text-foreground">{r.label}</span>
                          <Keys keys={r.keys} />
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        title={t("help.centerTitle")}
        aria-label={t("help.centerTitle")}
        className={cn(
          "flex items-center gap-1.5 rounded-lg border border-border bg-card/90 px-2.5 py-1.5 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur transition-colors hover:text-foreground",
          open && "text-foreground ring-1 ring-primary/40",
        )}
      >
        <HelpCircle className="size-4" />
        {t("help.title")}
      </button>
    </div>
  );
}
