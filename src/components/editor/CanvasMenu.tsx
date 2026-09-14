import { useEffect } from "react";
import { createPortal } from "react-dom";
import {
  ClipboardPaste,
  Copy,
  CopyPlus,
  RotateCw,
  SquareDashedMousePointer,
  Trash2,
} from "lucide-react";
import { useEditor } from "@/lib/store";
import type { XY } from "@/lib/types";
import { combo, DEL_KEY } from "@/lib/platform";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { eyebrow } from "@/components/ui/eyebrow";

/**
 * Контекстное меню по правому клику на плане. Правый клик и так подавлялся
 * (чтобы не вылезало системное меню поверх канваса) — логично отдать вместо
 * него привычные офисному пользователю действия, а не пустоту.
 */

export interface CanvasMenuState {
  x: number;
  y: number;
  /** Клик пришёлся на модуль (иначе — по пустому месту). */
  onModule: boolean;
  /** Клетка плана под курсором — сюда вставляем из буфера (#37). */
  cell: XY;
}

const MENU_W = 208;

interface MenuItem {
  icon: React.ReactNode;
  label: string;
  hint: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}

export function CanvasMenu({ state, onClose }: { state: CanvasMenuState; onClose: () => void }) {
  const t = useT();
  const clipboard = useEditor((s) => s.clipboard);
  const selection = useEditor((s) => s.selection);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  // Первое открытие меню — подсказка, что оно работает и на пустом месте (8.2.2).
  useEffect(() => {
    useEditor.getState().showHint("ctx");
  }, []);

  const run = (fn: () => void) => () => {
    fn();
    onClose();
  };

  const st = useEditor.getState();
  const items: MenuItem[] = state.onModule
    ? [
        {
          icon: <Copy className="size-3.5" />,
          label: t("help.copy"),
          hint: combo("C"),
          onClick: run(st.copySelection),
        },
        {
          icon: <CopyPlus className="size-3.5" />,
          label: t("insp.duplicate"),
          hint: combo("D"),
          onClick: run(st.duplicateSelection),
        },
        {
          icon: <RotateCw className="size-3.5" />,
          label: t("insp.rotate"),
          hint: "R",
          onClick: run(st.rotateSelection),
        },
        {
          icon: <Trash2 className="size-3.5" />,
          label: t("common.delete"),
          hint: DEL_KEY,
          danger: true,
          onClick: run(st.deleteSelection),
        },
      ]
    : [
        {
          icon: <ClipboardPaste className="size-3.5" />,
          label: t("help.paste"),
          hint: combo("V"),
          disabled: clipboard.length === 0,
          // Вставляем именно в точку правого клика, а не каскадом (#37).
          onClick: run(() => st.pasteClipboard(state.cell)),
        },
        {
          icon: <SquareDashedMousePointer className="size-3.5" />,
          label: t("help.selectAll"),
          hint: combo("A"),
          disabled: st.activeFloor().modules.length === 0,
          onClick: run(() => st.select(st.activeFloor().modules.map((m) => m.id))),
        },
      ];

  // Не вылезаем за край окна.
  const left = Math.min(state.x, window.innerWidth - MENU_W - 8);
  const top = Math.min(state.y, window.innerHeight - items.length * 32 - 24);

  // Портал в body обязателен: меню живёт внутри холста (слой z-0), а панели
  // редактора лежат в слое z-10 выше по стеку — без портала любой z-index
  // внутри холста всё равно оставлял бы меню ПОД панелью «Свойства», и клики
  // по его пунктам доставались панели, а не меню.
  return createPortal(
    <>
      <div className="fixed inset-0 z-40" onPointerDown={onClose} />
      <div
        // Портал сохраняет React-иерархию: без stopPropagation pointerdown из
        // меню всплывал к холсту, тот принимал его за клик по плану, закрывал
        // меню — и pointerup с click доставались уже холсту, а не пункту.
        onPointerDown={(e) => e.stopPropagation()}
        className="fixed z-50 animate-pop overflow-hidden rounded-lg border border-border bg-popover/95 py-1 shadow-lg backdrop-blur"
        style={{ left, top, width: MENU_W }}
      >
        {state.onModule && selection.length > 1 && (
          <p className={eyebrow({ size: "xs", weight: "normal", className: "px-3 py-1" })}>
            {t("insp.selected", { n: selection.length })}
          </p>
        )}
        {items.map((it) => (
          <button
            key={it.label}
            disabled={it.disabled}
            onClick={it.onClick}
            className={cn(
              "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors",
              it.disabled
                ? "cursor-not-allowed text-muted-foreground/40"
                : it.danger
                  ? "text-destructive hover:bg-destructive/10"
                  : "text-foreground hover:bg-accent",
            )}
          >
            {it.icon}
            <span className="flex-1">{it.label}</span>
            <kbd className="text-[10px] text-muted-foreground/70">{it.hint}</kbd>
          </button>
        ))}
      </div>
    </>,
    document.body,
  );
}
