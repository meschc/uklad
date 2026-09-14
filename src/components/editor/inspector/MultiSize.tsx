import { useEditor } from "@/lib/store";
import { MODULE_SPECS, type PlacedModule } from "@/lib/types";
import type { TFunc } from "@/lib/i18n";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Row, Stepper } from "./fields";

/**
 * Размер сразу для всего выделения (п.8): растянуть двадцать секций по одной —
 * не работа, а мучение. Общее значение показываем числом, разнобой — прочерком;
 * применяется введённое число ко ВСЕМ выделенным модулям.
 */
export function MultiSize({ selected, t }: { selected: PlacedModule[]; t: TFunc }) {
  const setModuleRect = useEditor((s) => s.setModuleRect);
  const updateModule = useEditor((s) => s.updateModule);

  // Границы — пересечение допусков по типам выделения: нельзя растянуть лифт
  // шире его максимума только потому, что рядом выделена секция.
  const specs = [...new Set(selected.map((m) => m.type))].map((type) => MODULE_SPECS[type]);
  const min = Math.max(...specs.map((sp) => sp.min));
  const max = Math.min(...specs.map((sp) => sp.max));
  const fixed = specs.some((sp) => sp.fixed);

  const common = (pick: (m: PlacedModule) => number | undefined) => {
    const first = pick(selected[0]);
    return selected.every((m) => pick(m) === first) ? first : undefined;
  };
  const applyRect = (patch: { w?: number; h?: number }) => {
    for (const m of selected) {
      setModuleRect(m.id, { x: m.x, y: m.y, w: patch.w ?? m.w, h: patch.h ?? m.h });
    }
  };
  const applyReal = (patch: Partial<PlacedModule>) => {
    for (const m of selected) updateModule(m.id, patch);
  };

  const w = common((m) => m.w);
  const h = common((m) => m.h);
  const hasSections = selected.some((m) => m.type === "section");

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <Label>{t("insp.multiSize")}</Label>
        <span className="text-[10px] text-muted-foreground/70">
          {t("insp.multiSizeHint", { n: selected.length })}
        </span>
      </div>
      <Row label={t("insp.width")}>
        <Stepper
          value={w ?? min}
          min={min}
          max={max}
          disabled={fixed}
          onChange={(v) => applyRect({ w: v })}
        />
      </Row>
      <Row label={t("insp.height")}>
        <Stepper
          value={h ?? min}
          min={min}
          max={max}
          disabled={fixed}
          onChange={(v) => applyRect({ h: v })}
        />
      </Row>
      <Row label={t("insp.realWidth")}>
        <Input
          type="number"
          className="h-7 w-20 text-right"
          placeholder={common((m) => m.realWidthCm) == null ? "—" : undefined}
          value={common((m) => m.realWidthCm) ?? ""}
          onChange={(e) => applyReal({ realWidthCm: +e.target.value || 0 })}
        />
      </Row>
      <Row label={t("insp.depth")}>
        <Input
          type="number"
          className="h-7 w-20 text-right"
          placeholder={common((m) => m.realDepthCm) == null ? "—" : undefined}
          value={common((m) => m.realDepthCm) ?? ""}
          onChange={(e) => applyReal({ realDepthCm: +e.target.value || 0 })}
        />
      </Row>
      {hasSections && (
        <Row label={t("insp.height")}>
          <Input
            type="number"
            className="h-7 w-20 text-right"
            placeholder={common((m) => m.realHeightCm) == null ? "—" : undefined}
            value={common((m) => m.realHeightCm) ?? ""}
            onChange={(e) => applyReal({ realHeightCm: +e.target.value || 0 })}
          />
        </Row>
      )}
    </div>
  );
}
