import { RotateCw } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useEditor } from "@/lib/store";
import { MODULE_SPECS, type PlacedModule } from "@/lib/types";
import { MODULE_GAP } from "../constants";
import { HANDLES, type ToScreen } from "./screen";

/**
 * Что нарисовано вокруг выделенного: кольцо, ручки размера, бейдж габарита и
 * ручка поворота.
 *
 * Всё считается с зазором `MODULE_GAP` — тем же, с которым стоит заливка
 * модуля (п.4b). Без него контур обводил бы клетку, а не сам модуль, и разница
 * бросалась бы в глаза как раз на стыках, где модули стоят вплотную.
 */

interface SelectionOverlayProps {
  modules: PlacedModule[];
  selection: string[];
  /** Ряд выделен целиком — тогда кольца у его модулей не рисуем (п.8). */
  rowSelectionIds: Set<string> | null;
  toScreen: ToScreen;
  readOnly: boolean;
}

export function SelectionOverlay({
  modules,
  selection,
  rowSelectionIds,
  toScreen,
  readOnly,
}: SelectionOverlayProps) {
  const t = useT();
  // Ручки и бейдж — только у одиночного выделения: у группы «размер» ничего не
  // значит, а восемь ручек на каждом модуле превратили бы план в кашу.
  const single = selection.length === 1 ? modules.find((m) => m.id === selection[0]) : undefined;
  const resizable = single && !MODULE_SPECS[single.type].fixed;
  const box = single ? toScreen(single, MODULE_GAP) : null;

  return (
    <>
      {/* Контур выделенных (кроме случая, когда выделен целый ряд — п.8) */}
      {modules
        .filter((m) => selection.includes(m.id) && !rowSelectionIds?.has(m.id))
        .map((m) => {
          const s = toScreen(m, MODULE_GAP);
          return (
            <div
              key={m.id}
              className="absolute animate-fade-in rounded-[4px] ring-2 ring-primary"
              style={{ left: s.left, top: s.top, width: s.width, height: s.height }}
            />
          );
        })}

      {!readOnly && single && box && (
        <>
          {resizable &&
            HANDLES.map((h) => (
              <div
                key={h.h}
                data-handle={h.h}
                className="pointer-events-auto absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-[2px] border border-primary bg-background shadow-sm"
                style={{
                  left: box.left + h.cx * box.width,
                  top: box.top + h.cy * box.height,
                  cursor: h.cursor,
                }}
              />
            ))}

          {/* Бейдж размера под выделенным */}
          <div
            className="absolute -translate-x-1/2 rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground shadow-sm"
            style={{ left: box.left + box.width / 2, top: box.top + box.height + 6 }}
          >
            {single.w}×{single.h}
          </div>

          {/* Ручка поворота на «стебельке» над модулем */}
          {resizable && (
            <>
              <div
                className="absolute w-px -translate-x-1/2 bg-primary/50"
                style={{ left: box.left + box.width / 2, top: box.top - 15, height: 15 }}
              />
              <button
                className="pointer-events-auto absolute flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-primary bg-background text-primary shadow-sm transition-colors hover:bg-primary hover:text-primary-foreground"
                style={{ left: box.left + box.width / 2, top: box.top - 22 }}
                title={t("editor.rotate")}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => useEditor.getState().rotateModule(single.id)}
              >
                <RotateCw className="size-3.5" />
              </button>
            </>
          )}
        </>
      )}
    </>
  );
}
