import { memo } from "react";
import { ArrowUp } from "lucide-react";
import { type PlacedModule } from "@/lib/types";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { CELL, LOD_CELL_PX, LOD_SHELF_PX, MODULE_GAP, MODULE_STYLES } from "./constants";
import { ModuleGlyph } from "./ModuleGlyph";

interface ModuleNodeProps {
  module: PlacedModule;
  selected: boolean;
  zoom: number;
  /** Инструмент «Выбор» активен — модуль можно тащить (курсор move). */
  interactive?: boolean;
  /** Индекс раскрытой полки этой секции (подсветка на плане), если есть. */
  activeShelfIndex?: number;
  /** Действующий номер секции в адресе — подписываем прямо на плане. */
  sectionNo?: number;
  /** Глобальный тумблер «показывать полки» (профиль). */
  shelvesVisible?: boolean;
  dimmed?: boolean;
}

/**
 * Презентация одного размещённого модуля в мировом слое (масштабируется
 * общим transform канваса). Хит-тест — по data-module-id из Canvas.
 *
 * Для секции внутренняя структура (полки → ячейки) раскрывается ступенчато
 * по зуму: детали появляются, когда полка/ячейка становятся достаточно
 * крупными на экране (ТЗ, разд. 2.3).
 */
/**
 * Лестница на плане рисуется как настоящий марш: ступени поперёк направления
 * движения плюс стрелка подъёма — так модуль опознаётся с первого взгляда,
 * а не по одной иконке в центре.
 */
function StairsBody({
  module: m,
  label,
}: {
  module: PlacedModule;
  label?: string;
}) {
  // Ориентация — по длинной стороне (для поворота стрелки). Полоски-ступени
  // убраны: заливки со стрелкой и подписью достаточно, без визуального шума.
  const along = m.h >= m.w ? "col" : "row";

  return (
    <>
      {/* Стрелка направления подъёма */}
      <ArrowUp
        className={cn(
          "relative opacity-70",
          m.w >= 2 || m.h >= 2 ? "size-4" : "size-3",
          along === "row" && "-rotate-90",
        )}
      />
      {label && (
        <span className="relative mt-0.5 rounded-sm bg-module-stairs px-1 text-[10px] font-semibold uppercase tracking-wide opacity-90">
          {label}
        </span>
      )}
    </>
  );
}

/**
 * Кегль и отступ номера секции: длинные номера ужимаем и убираем поля, чтобы
 * цифры использовали всю ширину узкой (1-клеточной) секции и не обрезались
 * overflow-hidden'ом. Порог — «больше трёх цифр».
 */
function digitClass(n: number): string {
  const len = String(n).length;
  if (len >= 5) return "text-[7px] p-0 tracking-tighter";
  if (len === 4) return "text-[8px] p-px";
  return "text-[9px] p-0.5";
}

export const ModuleNode = memo(function ModuleNode({
  module: m,
  selected,
  zoom,
  interactive,
  activeShelfIndex,
  sectionNo,
  shelvesVisible = true,
  dimmed,
}: ModuleNodeProps) {
  const style = MODULE_STYLES[m.type];
  const minSide = Math.min(m.w, m.h);
  const t = useT();

  const shelves = m.type === "section" ? m.shelves ?? [] : [];
  const shelfCount = shelves.length;

  // Размеры полки/ячейки на экране (в пикселях) — основа для порогов LOD.
  const shelfPx = shelfCount > 0 ? (m.h * CELL * zoom) / shelfCount : 0;
  const maxCells = shelves.reduce((mx, s) => Math.max(mx, s.cells), 1);
  const cellPx = maxCells > 0 ? (m.w * CELL * zoom) / maxCells : 0;

  const showShelves = shelvesVisible && shelfCount > 0 && shelfPx >= LOD_SHELF_PX;
  // Полки скрыты тумблером (а не зумом): секция остаётся ровной заливкой с
  // номером. Глиф и подпись «СЕК» вернули бы шум, ради ухода от которого
  // полки и выключают.
  const shelvesHidden = !shelvesVisible && shelfCount > 0;
  const showCells = showShelves && cellPx >= LOD_CELL_PX && shelfPx >= LOD_SHELF_PX + 4;

  const showLabel = !showShelves && (m.w >= 2 || m.h >= 2);

  return (
    <div
      data-module-id={m.id}
      className={cn(
        "absolute flex animate-pop select-none flex-col items-center justify-center overflow-hidden",
        style.text,
        // Зазор между модулями (п.4b) развёл соседей — скругления вернулись.
        // Обводку убрали: насыщенная заливка сама держит форму, без грязи по краю.
        cn("rounded-[4px]", style.fill),
        interactive && "cursor-move",
        dimmed && "opacity-40",
      )}
      style={{
        // Зазор поджимает модуль внутрь клетки, разводя соседей.
        left: m.x * CELL + MODULE_GAP,
        top: m.y * CELL + MODULE_GAP,
        width: m.w * CELL - MODULE_GAP * 2,
        height: m.h * CELL - MODULE_GAP * 2,
        zIndex: selected ? 20 : 10,
      }}
    >
      {/* Номер секции — читается и когда полки раскрыты, поэтому поверх.
          Подложка нужна только поверх полос полок; на ровной заливке она
          лишняя и выглядит как артефакт (п.9). */}
      {sectionNo != null && (m.w >= 1 || m.h >= 1) && (
        <span
          className={cn(
            // Ровно в углу: одинаковый отступ 2px слева и сверху (leading-none,
            // чтобы line-height не добавлял лишнего сверху).
            "pointer-events-none absolute left-0 top-0 font-bold leading-none tabular-nums opacity-90",
            // Длинные номера (4+ цифры) в узкой секции обрезал overflow-hidden —
            // ужимаем кегль и поля по числу цифр, чтобы номер читался целиком.
            digitClass(sectionNo),
            showShelves && "rounded-br-[3px] bg-module-section",
          )}
        >
          {sectionNo}
        </span>
      )}
      {m.type === "stairs" ? (
        <StairsBody
          module={m}
          label={showLabel ? t("module.stairs.short") : undefined}
        />
      ) : showShelves ? (
        // Полки делят высоту пропорционально; ячейки делят ширину полки.
        <div className="absolute inset-0 flex flex-col">
          {shelves.map((sh, i) => (
            <div
              key={sh.id}
              className={cn(
                "relative flex min-h-0 flex-1 flex-row",
                i > 0 && "border-t border-black/15 dark:border-white/20",
                i === activeShelfIndex && "bg-primary/20",
              )}
            >
              {showCells &&
                Array.from({ length: sh.cells }).map((_, j) => (
                  <div
                    key={j}
                    className={cn(
                      "min-w-0 flex-1",
                      j > 0 && "border-l border-black/10 dark:border-white/10",
                    )}
                  />
                ))}
              {i === activeShelfIndex && (
                <span className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-primary/70" />
              )}
            </div>
          ))}
        </div>
      ) : shelvesHidden ? null : (
        <>
          <ModuleGlyph
            type={m.type}
            className={cn(minSide >= 2 ? "size-5" : "size-3.5", "opacity-90")}
          />
          {showLabel && (
            <span className="mt-1 text-[10px] font-semibold uppercase tracking-wide opacity-80">
              {t(`module.${m.type}.short`)}
            </span>
          )}
        </>
      )}
    </div>
  );
});
