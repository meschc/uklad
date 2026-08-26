import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Copy,
  Link2,
  Pencil,
  Plus,
  Unlink,
  X,
} from "lucide-react";
import { MODULE_ORDER } from "@/lib/types";
import { FLOOR_MAX, useEditor } from "@/lib/store";
import { floorsWithoutVerticalLink } from "@/lib/planRules";
import { useT, type TFunc } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { ModuleGlyph } from "./ModuleGlyph";
import { TemplateLibrary } from "./TemplateLibrary";
import { AddressingButton } from "./AddressingDialog";
import { PanelSection } from "./PanelSection";
import { LayersTree } from "./LayersTree";

export function StructurePanel() {
  const floor = useEditor((s) => s.activeFloor());
  const modules = floor.modules;
  const t = useT();

  const counts = MODULE_ORDER.map((type) => ({
    type,
    n: modules.filter((m) => m.type === type).length,
  }));

  return (
    <aside className="pointer-events-none flex w-60 shrink-0 flex-col gap-2 overflow-hidden p-3 [&_>*]:pointer-events-auto">
      {/* Этажи + тиражирование */}
      <FloorsSection />

      {/* Список объектов (как Layers) — сворачивается, тянется по высоте */}
      <PanelSection
        storageKey="objects"
        title={t("struct.layers")}
        count={modules.length}
        grow
        bodyClassName="p-2"
      >
        {/* Сводка по модулям */}
        <div className="mb-2 grid grid-cols-4 gap-1">
          {counts.map((c) => (
            <div
              key={c.type}
              className="flex flex-col items-center gap-0.5 rounded-md py-1"
              title={t(`module.${c.type}.title`)}
            >
              <ModuleGlyph
                type={c.type}
                className="size-4 text-muted-foreground"
              />
              <span className="text-xs font-semibold tabular-nums">{c.n}</span>
            </div>
          ))}
        </div>

        <div className="mb-2 flex flex-col gap-1.5 px-1">
          <AddressingButton t={t} />
        </div>

        {/* Дерево слоёв: этаж → ряды → секции + конструкции */}
        <LayersTree floor={floor} t={t} />
      </PanelSection>

      {/* Библиотека шаблонов раскладок (как компоненты в Figma) */}
      <TemplateLibrary />
    </aside>
  );
}

/**
 * Этажи + тиражирование (ТЗ, разд. 3.5): строим один этаж, указываем нужное
 * количество — остальные создаются копиями активного и дальше правятся
 * независимо друг от друга.
 */
function FloorsSection() {
  const floors = useEditor((s) => s.warehouse.floors);
  const activeFloorId = useEditor((s) => s.activeFloorId);
  const setActiveFloor = useEditor((s) => s.setActiveFloor);
  const duplicateFloor = useEditor((s) => s.duplicateFloor);
  const deleteFloor = useEditor((s) => s.deleteFloor);
  const setFloorPosition = useEditor((s) => s.setFloorPosition);
  const toggleFloorLink = useEditor((s) => s.toggleFloorLink);
  const t = useT();
  // Перетаскивание строк: что тащим и над какой позицией сейчас курсор.
  const dragId = useRef<string | null>(null);
  const [dropIdx, setDropIdx] = useState<number | null>(null);
  // «id:left» | «id:right» — половина строки, над которой курсор.
  const [hoverSide, setHoverSide] = useState<string | null>(null);
  const setFloorNumber = useEditor((s) => s.setFloorNumber);
  // По одному ref на этаж: карандаш строки должен попасть именно в своё поле.
  const numberRefs = useRef<Record<string, React.RefObject<HTMLInputElement>>>({});
  const registerNumberRef = (id: string) => {
    const ref = { current: null } as React.RefObject<HTMLInputElement>;
    numberRefs.current[id] = ref;
    return ref;
  };

  return (
    <PanelSection
      storageKey="floors"
      title={t("struct.floors")}
      count={floors.length}
      bodyClassName="p-2 pt-0"
      right={
        <button
          title={t("struct.duplicateFloor")}
          disabled={floors.length >= FLOOR_MAX}
          onClick={() => duplicateFloor(activeFloorId)}
          className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus className="size-3.5" />
        </button>
      }
    >
      <div className="flex flex-col gap-0.5">
        {floors.map((f, i) => {
          const linked = !!f.aliasOf;
          // Алиас никогда не «активен» — активен всегда этаж-источник (п.7).
          const active = !linked && f.id === activeFloorId;
          const src = linked
            ? floors.find((x) => x.id === f.aliasOf)
            : null;
          const count = src ? src.modules.length : f.modules.length;
          return (
            <div
              key={f.id}
              // Порядок этажей — перетаскиванием строки (стрелки убраны).
              draggable
              onDragStart={(e) => {
                dragId.current = f.id;
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                if (dragId.current && dragId.current !== f.id) {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setDropIdx(i);
                }
              }}
              onDragLeave={() => setDropIdx((d) => (d === i ? null : d))}
              onDrop={(e) => {
                e.preventDefault();
                const id = dragId.current;
                dragId.current = null;
                setDropIdx(null);
                if (id && id !== f.id) setFloorPosition(id, i + 1);
              }}
              onDragEnd={() => {
                dragId.current = null;
                setDropIdx(null);
              }}
              // Какая половина строки под курсором: левая раскрывает связь,
              // правая — дублирование и удаление.
              onPointerMove={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                const side = e.clientX < r.left + r.width / 2 ? "left" : "right";
                setHoverSide(`${f.id}:${side}`);
              }}
              onPointerLeave={() =>
                setHoverSide((h) => (h?.startsWith(f.id) ? null : h))
              }
              className={cn(
                "group flex cursor-grab items-center gap-1 rounded-md pr-0.5 active:cursor-grabbing",
                active && "bg-accent",
                dropIdx === i && "ring-1 ring-inset ring-primary",
              )}
            >
              {/* Связь с источником живёт «под» строкой: слот схлопнут в ноль
                  и раскрывается при наведении на ЛЕВУЮ часть строки, плавно
                  отодвигая номер и название вправо. */}
              <div
                className={cn(
                  "shrink-0 overflow-hidden transition-[width] duration-200",
                  i > 0 && hoverSide === `${f.id}:left` ? "w-5" : "w-0",
                )}
              >
                {i > 0 && (
                  <button
                    title={
                      linked ? t("struct.unlinkFloor") : t("struct.linkFloor")
                    }
                    onClick={() => toggleFloorLink(f.id)}
                    className={cn(
                      "flex size-5 items-center justify-center rounded transition-colors",
                      linked
                        ? "text-primary hover:text-primary/70"
                        : "text-muted-foreground/60 hover:text-foreground",
                    )}
                  >
                    {linked ? (
                      <Unlink className="size-3" />
                    ) : (
                      <Link2 className="size-3" />
                    )}
                  </button>
                )}
              </div>
              {/* Иконка этажа — его номер в адресе; видна всегда. */}
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded text-[10px] font-semibold tabular-nums",
                  active
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {f.number ?? i + 1}
              </span>
              <button
                onClick={() => setActiveFloor(f.id)}
                className={cn(
                  "flex min-w-0 shrink-0 items-center gap-1 py-1.5 text-sm transition-colors",
                  active
                    ? "font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t("floor.word")}
              </button>
              {/* Номер этажа в адресе — любой, не привязан к позиции в списке
                  (порядок меняется перетаскиванием). */}
              <FloorNumberInput
                value={f.number ?? i + 1}
                active={active}
                onCommit={(n) => setFloorNumber(f.id, n)}
                inputRef={numberRefs.current[f.id] ?? registerNumberRef(f.id)}
              />
              {/* Карандаш при наведении: без него неочевидно, что цифра —
                  редактируемое поле, а не просто подпись (п.2). Нажатие ставит
                  фокус в это поле и выделяет номер (п.3). */}
              <button
                type="button"
                title={t("struct.floorNumber")}
                aria-label={t("struct.floorNumber")}
                onClick={() => {
                  const el = numberRefs.current[f.id]?.current;
                  el?.focus();
                  el?.select();
                }}
                className="flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground/50 opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
              >
                <Pencil className="size-3" />
              </button>
              <span className="flex-1" />
              <span className="shrink-0 font-mono text-[10px] text-muted-foreground/70">
                {count}
              </span>
              {/* Действия справа — выезжают при наведении на ПРАВУЮ часть. */}
              <div
                className={cn(
                  "flex shrink-0 overflow-hidden transition-[width] duration-200",
                  hoverSide !== `${f.id}:right`
                    ? "w-0"
                    : // Единственный этаж не удаляется — под кнопку удаления не
                      // держим пустое место, слот сужается до одной кнопки (п.6).
                      floors.length <= 1
                      ? "w-5"
                      : "w-11",
                )}
              >
              <button
                title={t("struct.duplicateFloorRow")}
                disabled={floors.length >= FLOOR_MAX}
                onClick={() => duplicateFloor(f.id)}
                className="flex h-6 w-5 shrink-0 items-center justify-center rounded text-muted-foreground/50 transition hover:text-foreground disabled:opacity-0"
              >
                <Copy className="size-3" />
              </button>
              {floors.length > 1 && (
                <button
                  title={t("struct.deleteFloor")}
                  onClick={() => deleteFloor(f.id)}
                  className="flex h-6 w-5 shrink-0 items-center justify-center rounded text-muted-foreground/50 transition hover:text-destructive"
                >
                  <X className="size-3" />
                </button>
              )}
              </div>
            </div>
          );
        })}
      </div>

      <VerticalLinkWarning t={t} />
    </PanelSection>
  );
}

/**
 * Редактируемый номер этажа = позиция (п.7). Ввод числа переставляет этаж на эту
 * позицию — так же, как правится номер в адресе.
 */
function FloorNumberInput({
  value,
  active,
  onCommit,
  inputRef,
}: {
  value: number;
  active: boolean;
  onCommit: (n: number) => void;
  /** Наружу — чтобы карандаш рядом ставил фокус в это поле (п.3). */
  inputRef?: React.RefObject<HTMLInputElement>;
}) {
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  const commit = () => {
    const n = Math.round(+v);
    // Верхней границы нет: номер этажа задаётся любой (мезонин может быть
    // «третьим», даже если он второй по порядку в списке).
    if (Number.isFinite(n) && n >= 1 && n !== value) onCommit(n);
    else setV(String(value));
  };
  return (
    <input
      ref={inputRef}
      type="number"
      min={1}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setV(String(value));
          (e.target as HTMLInputElement).blur();
        }
      }}
      // Часть названия: выглядит как текст «Этаж N», но цифра правится.
      className={cn(
        "h-5 w-6 shrink-0 rounded-sm bg-transparent text-left text-sm tabular-nums outline-none [appearance:textfield] hover:bg-muted focus:bg-muted focus:ring-1 focus:ring-primary [&::-webkit-inner-spin-button]:appearance-none",
        active ? "font-medium text-foreground" : "text-muted-foreground",
      )}
    />
  );
}

/**
 * Мягкое предупреждение (ТЗ, разд. 4): 2+ этажа без лестницы — это нарушение
 * логики плана, но не ошибка. Ничего не блокируем, решает пользователь.
 */
function VerticalLinkWarning({ t }: { t: TFunc }) {
  const warehouse = useEditor((s) => s.warehouse);
  const orphans = floorsWithoutVerticalLink(warehouse);
  if (!orphans.length) return null;

  // Номера этажей по позиции в складе (имя в данных — «Этаж N»).
  const names = orphans
    .map((f) => warehouse.floors.findIndex((x) => x.id === f.id) + 1)
    .join(", ");
  const key = orphans.length === 1 ? "struct.noLinkOne" : "struct.noLinkMany";
  return (
    <div className="hazard-stripes mt-2 flex gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-[10px] leading-relaxed text-amber-800 dark:text-amber-300">
      <AlertTriangle className="mt-px size-3 shrink-0" />
      <span>{t(key, { names })}</span>
    </div>
  );
}
