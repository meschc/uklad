import { useEffect } from "react";
import { MODULE_ORDER, type Tool } from "./types";
import { selectRole, useEditor } from "./store";

function inField(t: EventTarget | null) {
  return (
    t instanceof HTMLElement &&
    (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)
  );
}

/** Глобальные горячие клавиши редактора. */
export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (inField(e.target)) return;
      const st = useEditor.getState();
      // У продавца правок нет вообще — значит, нет и горячих клавиш правки.
      // Иначе Delete и {mod}Z из его роли меняли бы чужой склад (п.1).
      if (selectRole(st) === "seller") return;

      // Отмена/повтор работают на любом экране: правки есть и в таблице.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) st.redo();
        else st.undo();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        st.redo();
        return;
      }

      // Остальные горячие клавиши редактора — только на экране 2D-плана.
      if (st.mode !== "2d") return;
      // Пока висит алерт «на полке товар» — ответ за пользователем, не за клавишей.
      if (st.pendingConflict || st.conflictResult) return;
      const key = e.key.toLowerCase();

      // Инструменты. Проход больше не размещается (проход = пол между секциями),
      // поэтому клавиши идут по оставшимся модулям в том же порядке, что тулбар.
      const placeable = MODULE_ORDER.filter((type) => type !== "aisle");
      const toolMap: Record<string, Tool> = {
        v: "select",
        h: "pan",
      };
      placeable.forEach((type, i) => {
        toolMap[String(i + 1)] = type;
      });
      if (toolMap[key] && !e.metaKey && !e.ctrlKey) {
        st.setTool(toolMap[key]);
        return;
      }

      // Буфер обмена модулей: копировать / вырезать / вставить / дублировать
      if (e.metaKey || e.ctrlKey) {
        if (key === "c" && st.selection.length) {
          st.copySelection();
          return;
        }
        if (key === "x" && st.selection.length) {
          e.preventDefault();
          st.cutSelection();
          return;
        }
        if (key === "v" && st.clipboard.length) {
          e.preventDefault();
          // Место вставки, по убыванию явности (#37):
          // 1) выделен ровно один модуль — кладём на него;
          // 2) кликнули по пустому месту — кладём туда;
          // 3) ничего не указано — привычный каскад со сдвигом.
          const one =
            st.selection.length === 1
              ? st.activeFloor().modules.find((m) => m.id === st.selection[0])
              : undefined;
          const at = one ? { x: one.x, y: one.y } : (st.pasteAnchor ?? undefined);
          st.pasteClipboard(at);
          return;
        }
        if (key === "d" && st.selection.length) {
          e.preventDefault();
          st.duplicateSelection();
          return;
        }
      }

      // Действия
      if (key === "r" && st.selection.length) {
        st.rotateSelection();
      } else if ((e.key === "Delete" || e.key === "Backspace") && st.selection.length) {
        e.preventDefault();
        st.deleteSelection();
      } else if (e.key === "Escape") {
        if (st.stampTemplateId) st.setStampTemplate(null);
        else if (st.pasteAnchor) st.setPasteAnchor(null);
        else if (st.tool !== "select") st.setTool("select");
        else st.clearSelection();
      } else if (key === "a" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        st.select(st.activeFloor().modules.map((m) => m.id));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
