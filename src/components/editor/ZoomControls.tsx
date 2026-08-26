import { Maximize, Minus, Plus, Redo2, Rows3, Undo2 } from "lucide-react";
import { selectRole, useEditor } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { combo, shiftCombo } from "@/lib/platform";
import { cn } from "@/lib/utils";
import { ZOOM_STEP } from "./constants";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

function fire(name: string, detail?: unknown) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

export function ZoomControls() {
  const zoom = useEditor((s) => s.zoom);
  const shelvesVisible = useEditor((s) => s.profile.showShelves !== false);
  const updateProfile = useEditor((s) => s.updateProfile);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  // Продавцу отменять нечего: правок из его роли не существует (п.1).
  const readOnly = useEditor((s) => selectRole(s) === "seller");
  const t = useT();

  return (
    <div className="pointer-events-auto absolute bottom-4 right-4 flex items-center gap-0.5 rounded-lg border border-border bg-card/90 p-0.5 shadow-md backdrop-blur">
      {/* Отмена/повтор — здесь, а не в топбаре: действие и его откат рядом (п.5) */}
      {!readOnly && (
        <>
          <IconBtn
            label={`${t("edit.undo")} · ${combo("Z")}`}
            disabled={!canUndo}
            onClick={undo}
          >
            <Undo2 className="size-4" />
          </IconBtn>
          <IconBtn
            label={`${t("edit.redo")} · ${shiftCombo("Z")}`}
            disabled={!canRedo}
            onClick={redo}
          >
            <Redo2 className="size-4" />
          </IconBtn>
          <div className="mx-0.5 h-5 w-px bg-border" />
        </>
      )}
      <IconBtn label={t("zoom.out")} onClick={() => fire("uklad:zoom", 1 / ZOOM_STEP)}>
        <Minus className="size-4" />
      </IconBtn>
      <button
        onClick={() => fire("uklad:reset")}
        className="min-w-[3.5rem] rounded-md px-2 py-1 text-xs font-medium tabular-nums text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        title={t("zoom.reset")}
      >
        {Math.round(zoom * 100)}%
      </button>
      <IconBtn label={t("zoom.in")} onClick={() => fire("uklad:zoom", ZOOM_STEP)}>
        <Plus className="size-4" />
      </IconBtn>
      <div className="mx-0.5 h-5 w-px bg-border" />
      <IconBtn label={t("zoom.fit")} onClick={() => fire("uklad:fit")}>
        <Maximize className="size-4" />
      </IconBtn>
      <IconBtn
        label={t(shelvesVisible ? "view.shelves.hide" : "view.shelves.show")}
        active={shelvesVisible}
        onClick={() => updateProfile({ showShelves: !shelvesVisible })}
      >
        <Rows3 className="size-4" />
      </IconBtn>
    </div>
  );
}

function IconBtn({
  label,
  onClick,
  active,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
          aria-pressed={active}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-md transition-colors",
            disabled
              ? "cursor-not-allowed text-muted-foreground/35"
              : cn(
                  "hover:bg-accent hover:text-foreground",
                  active ? "text-foreground" : "text-muted-foreground",
                ),
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}
