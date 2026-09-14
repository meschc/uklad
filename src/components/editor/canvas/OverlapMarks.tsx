import { useMemo } from "react";
import { overlappingIds } from "@/lib/overlap";
import type { PlacedModule } from "@/lib/types";
import { MODULE_GAP } from "../constants";
import type { ToScreen } from "./screen";

/**
 * Янтарный пунктир вокруг налезших друг на друга модулей.
 *
 * Мышью так поставить нельзя, а числом в инспекторе — можно, и тогда об ошибке
 * ничто, кроме этой обводки, не скажет. Считаем от списка модулей, а не по
 * следам перетаскивания: правка координат идёт мимо жеста.
 */

interface OverlapMarksProps {
  modules: PlacedModule[];
  toScreen: ToScreen;
}

export function OverlapMarks({ modules, toScreen }: OverlapMarksProps) {
  const overlaps = useMemo(() => overlappingIds(modules), [modules]);

  return (
    <>
      {modules
        .filter((m) => overlaps.has(m.id))
        .map((m) => {
          const s = toScreen(m, MODULE_GAP);
          return (
            <div
              key={`ov-${m.id}`}
              className="absolute rounded-[4px] border-2 border-dashed border-amber-500/80"
              style={{ left: s.left, top: s.top, width: s.width, height: s.height }}
            />
          );
        })}
    </>
  );
}
