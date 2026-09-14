import { AlertTriangle, CopyPlus, RotateCw, Trash2 } from "lucide-react";
import { useEditor } from "@/lib/store";
import { combo } from "@/lib/platform";
import { isOverlapConflict } from "@/lib/overlap";
import { MODULE_SPECS, type PlacedModule } from "@/lib/types";
import type { TFunc } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ModuleGlyph } from "../ModuleGlyph";
import { MODULE_STYLES } from "../constants";
import { AssignRow } from "./AssignRow";
import { Row, Stepper } from "./fields";
import { SectionNumber } from "./SectionNumber";
import { ShelfEditor } from "./ShelfEditor";

/** Панель одного выделенного модуля: тип, размер, адрес, полки, позиция. */
export function SingleInspector({ module: m, t }: { module: PlacedModule; t: TFunc }) {
  const spec = MODULE_SPECS[m.type];
  const style = MODULE_STYLES[m.type];
  const siblings = useEditor((s) => s.activeFloor().modules);
  // Позицию можно ввести числом — предупреждаем, если модуль лёг на соседа.
  const overlapping = siblings.some((o) => o.id !== m.id && isOverlapConflict(m, o));
  const setModuleRect = useEditor((s) => s.setModuleRect);
  const updateModule = useEditor((s) => s.updateModule);
  const rotateModule = useEditor((s) => s.rotateModule);
  const duplicateSelection = useEditor((s) => s.duplicateSelection);
  const deleteSelection = useEditor((s) => s.deleteSelection);
  const isFixed = !!spec.fixed;

  return (
    <div className="flex flex-col gap-4 p-3">
      {/* Заголовок типа */}
      <div className="flex items-center gap-2.5">
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-md border ${style.fill} ${style.text} ${style.border}`}
        >
          <ModuleGlyph type={m.type} className="size-5" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold">{t(`module.${m.type}.title`)}</div>
          <div className="truncate text-[11px] text-muted-foreground">
            {isFixed
              ? t("insp.fixed", { w: spec.fixed!.w, h: spec.fixed!.h })
              : t("insp.sizeRange", { min: spec.min, max: spec.max })}
          </div>
        </div>
      </div>

      <Separator />

      {/* Размер */}
      <div className="flex flex-col gap-2.5">
        <Row label={t("insp.width")}>
          <Stepper
            value={m.w}
            min={spec.min}
            max={spec.max}
            disabled={isFixed}
            onChange={(w) => setModuleRect(m.id, { x: m.x, y: m.y, w, h: m.h })}
          />
        </Row>
        <Row label={t("insp.height")}>
          <Stepper
            value={m.h}
            min={spec.min}
            max={spec.max}
            disabled={isFixed}
            onChange={(h) => setModuleRect(m.id, { x: m.x, y: m.y, w: m.w, h })}
          />
        </Row>
      </div>

      {m.type === "section" && (
        <>
          <Separator />
          {/* Секция без закреплённого ряда — сразу предлагаем назначить ряд (п.5). */}
          {m.row == null && <AssignRow count={1} t={t} />}
          <SectionNumber module={m} siblings={siblings} t={t} />
          <Separator />
          <ShelfEditor module={m} t={t} />
        </>
      )}

      <Separator />

      {/* Позиция */}
      <div className="flex flex-col gap-2.5">
        <Row label={t("insp.xCell")}>
          <Input
            type="number"
            className="h-7 w-16 text-right"
            value={m.x}
            onChange={(e) => updateModule(m.id, { x: Math.round(+e.target.value || 0) })}
          />
        </Row>
        <Row label={t("insp.yCell")}>
          <Input
            type="number"
            className="h-7 w-16 text-right"
            value={m.y}
            onChange={(e) => updateModule(m.id, { y: Math.round(+e.target.value || 0) })}
          />
        </Row>
        {overlapping && (
          <div className="flex gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-[11px] leading-relaxed text-amber-800 dark:text-amber-300">
            <AlertTriangle className="mt-px size-3.5 shrink-0" />
            <span>{t("insp.overlap")}</span>
          </div>
        )}
      </div>

      <Separator />

      {/* Реальные габариты (только данные) */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <Label>{t("insp.dims")}</Label>
          <span className="text-[10px] text-muted-foreground/70">{t("insp.noScale")}</span>
        </div>
        <Row label={t("insp.width")}>
          <Input
            type="number"
            className="h-7 w-20 text-right"
            value={m.realWidthCm ?? ""}
            onChange={(e) => updateModule(m.id, { realWidthCm: +e.target.value || 0 })}
          />
        </Row>
        <Row label={t("insp.depth")}>
          <Input
            type="number"
            className="h-7 w-20 text-right"
            value={m.realDepthCm ?? ""}
            onChange={(e) => updateModule(m.id, { realDepthCm: +e.target.value || 0 })}
          />
        </Row>
        {m.type === "section" && (
          <Row label={t("insp.height")}>
            <Input
              type="number"
              className="h-7 w-20 text-right"
              value={m.realHeightCm ?? ""}
              onChange={(e) => updateModule(m.id, { realHeightCm: +e.target.value || 0 })}
            />
          </Row>
        )}
      </div>

      <Separator />

      {/* Действия */}
      <div className="flex flex-col gap-2">
        <Button variant="outline" size="sm" className="w-full" onClick={duplicateSelection}>
          <CopyPlus className="size-3.5" />
          {t("insp.duplicate")}
          <kbd className="ml-auto rounded bg-muted px-1 text-[10px] text-muted-foreground">
            {combo("D")}
          </kbd>
        </Button>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            disabled={isFixed}
            onClick={() => rotateModule(m.id)}
          >
            <RotateCw className="size-3.5" />
            {t("insp.rotate")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={deleteSelection}
          >
            <Trash2 className="size-3.5" />
            {t("common.delete")}
          </Button>
        </div>
      </div>
    </div>
  );
}
