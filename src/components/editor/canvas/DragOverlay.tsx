import { useEditor } from "@/lib/store";
import type { XY } from "@/lib/types";
import { cn } from "@/lib/utils";
import { MODULE_STYLES } from "../constants";
import type { ToScreen } from "./screen";
import type { CanvasPreview } from "./useCanvasPointer";

/**
 * Обещания холста: что появится, если отпустить кнопку или нажать вставку.
 *
 * Всё здесь живёт ровно один жест и ничего не меняет в плане — это подсказки,
 * а не объекты. Потому они и собраны отдельно от постоянных слоёв: их можно
 * снять целиком, и план останется прежним.
 */

interface DragOverlayProps {
  preview: CanvasPreview;
  /** Клетка под курсором в режиме штампа шаблона (#38). */
  stampCell: XY | null;
  toScreen: ToScreen;
}

export function DragOverlay({ preview, stampCell, toScreen }: DragOverlayProps) {
  const stampTemplate = useEditor((s) =>
    s.stampTemplateId
      ? (s.layoutTemplates.find((tp) => tp.id === s.stampTemplateId) ?? null)
      : null,
  );
  const pasteAnchor = useEditor((s) => s.pasteAnchor);
  // Метку места вставки показываем только когда есть что вставлять — иначе она
  // была бы просто следом от любого клика по пустому холсту.
  const hasClipboard = useEditor((s) => s.clipboard.length > 0);

  const previewBox = preview ? toScreen(preview.rect) : null;
  const anchorBox = pasteAnchor && hasClipboard ? toScreen({ ...pasteAnchor, w: 1, h: 1 }) : null;

  return (
    <>
      {/* Призрак шаблона раскладки под курсором (#38) */}
      {stampTemplate &&
        stampCell &&
        stampTemplate.modules.map((lm, i) => {
          const s = toScreen({ x: stampCell.x + lm.dx, y: stampCell.y + lm.dy, w: lm.w, h: lm.h });
          return (
            <div
              key={`stamp-${i}`}
              className={cn(
                // Призрак — та же геометрия, что у модуля (4px).
                "absolute rounded-[4px] opacity-70 ring-1 ring-inset",
                MODULE_STYLES[lm.type].fill,
                MODULE_STYLES[lm.type].ring,
              )}
              style={{ left: s.left, top: s.top, width: s.width, height: s.height }}
            />
          );
        })}

      {/* Место вставки: куда ляжет копия по Cmd+V (#37) */}
      {anchorBox && (
        <div
          className="absolute rounded-[3px] border-2 border-dashed border-primary/70 bg-primary/10"
          style={{
            left: anchorBox.left,
            top: anchorBox.top,
            width: anchorBox.width,
            height: anchorBox.height,
          }}
        />
      )}

      {/* Контур будущего модуля с его размером в клетках */}
      {preview?.kind === "place" && previewBox && (
        <div
          className="absolute rounded-[4px] border-2 border-dashed border-primary bg-primary/10"
          style={{
            left: previewBox.left,
            top: previewBox.top,
            width: previewBox.width,
            height: previewBox.height,
          }}
        >
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[10px] font-semibold text-primary">
            {preview.rect.w}×{preview.rect.h}
          </span>
        </div>
      )}

      {/* Рамка выделения */}
      {preview?.kind === "marquee" && previewBox && (
        <div
          className="absolute rounded-[2px] border border-primary bg-primary/10"
          style={{
            left: previewBox.left,
            top: previewBox.top,
            width: previewBox.width,
            height: previewBox.height,
          }}
        />
      )}
    </>
  );
}
