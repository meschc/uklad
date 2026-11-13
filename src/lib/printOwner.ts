import { useEffect, useSyncExternalStore } from "react";

/**
 * Кто сейчас печатает поверх плана.
 *
 * План склада держит свой печатный лист в дереве всегда (`PrintPlan`), чтобы
 * Cmd+P на плане печатал план. Но окно поверх (лист сборки из таблицы) тоже
 * кладёт свой лист — и в печать уходили оба, план первым: «Печать» в листе
 * сборки печатала план. Окно, у которого своя печать, занимает её здесь, и
 * план на это время убирает свой лист и свой размер страницы.
 */
let owners = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Окно с собственной печатью: пока оно открыто, план не печатается. */
export function useOwnPrint(): void {
  useEffect(() => {
    owners++;
    emit();
    return () => {
      owners--;
      emit();
    };
  }, []);
}

/** Занята ли печать окном поверх плана. */
export function usePrintTaken(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => owners > 0,
    () => false,
  );
}
