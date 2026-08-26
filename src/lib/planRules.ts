import type { Floor, Warehouse } from "./types";

/**
 * Мягкие проверки логики плана (ТЗ, разд. 4). Нарушение ничего не блокирует:
 * предупреждаем, но работать и сохранять всё равно разрешено — выбор за
 * пользователем.
 */

/**
 * Этажи без вертикальной связи. Когда этажей 2+, на каждый нужно как-то
 * попасть: лестницей или лифтом. Один этаж — вопрос не стоит.
 */
export function floorsWithoutVerticalLink(warehouse: Warehouse): Floor[] {
  if (warehouse.floors.length < 2) return [];
  // У связанного этажа собственный список модулей пуст — он показывает
  // раскладку источника. Проверять надо именно её, иначе дубли этажа с
  // лестницей попадали в предупреждение как «этажи без лестницы».
  const modulesOf = (f: Floor): Floor["modules"] => {
    if (!f.aliasOf) return f.modules;
    const src = warehouse.floors.find((x) => x.id === f.aliasOf);
    return src ? src.modules : f.modules;
  };
  return warehouse.floors.filter(
    (f) =>
      !modulesOf(f).some((m) => m.type === "stairs" || m.type === "elevator"),
  );
}
