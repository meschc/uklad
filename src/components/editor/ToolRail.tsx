import { Hand, MousePointer2 } from "lucide-react";
import { MODULE_ORDER, type Tool } from "@/lib/types";
import { useEditor } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ModuleGlyph } from "./ModuleGlyph";

interface RailButton {
  tool: Tool;
  title: string;
  shortcut: string;
  icon: React.ReactNode;
}

export function ToolRail() {
  const tool = useEditor((s) => s.tool);
  const setTool = useEditor((s) => s.setTool);
  const t = useT();

  // Проход больше не размещается объектом: проход = пол между секциями (модель
  // «пол как проход»). Инструмент убран, нумерация клавиш идёт по оставшимся.
  const moduleButtons: RailButton[] = MODULE_ORDER.filter((type) => type !== "aisle").map(
    (type, i) => ({
      tool: type,
      title: t(`module.${type}.title`),
      shortcut: String(i + 1),
      icon: <ModuleGlyph type={type} className="size-[18px]" />,
    }),
  );

  const renderBtn = (b: RailButton) => {
    const active = tool === b.tool;
    return (
      <Tooltip key={b.tool} delayDuration={300}>
        <TooltipTrigger asChild>
          <button
            onClick={() => setTool(b.tool)}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-md transition-colors",
              active
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
            aria-label={b.title}
            aria-pressed={active}
          >
            {b.icon}
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" className="flex items-center gap-2">
          <span>{b.title}</span>
          <kbd className="rounded bg-background/20 px-1 text-[10px]">{b.shortcut}</kbd>
        </TooltipContent>
      </Tooltip>
    );
  };

  return (
    <div className="pointer-events-auto absolute left-3 top-3 z-20 flex flex-col items-center gap-0.5 rounded-lg border border-border bg-card/90 p-0.5 shadow-md backdrop-blur">
      {renderBtn({
        tool: "select",
        title: t("tool.select"),
        shortcut: "V",
        icon: <MousePointer2 className="size-[18px]" />,
      })}
      {renderBtn({
        tool: "pan",
        title: t("tool.pan"),
        shortcut: "H",
        icon: <Hand className="size-[18px]" />,
      })}

      <div className="my-0.5 h-px w-5 bg-border" />

      {moduleButtons.map(renderBtn)}
    </div>
  );
}
