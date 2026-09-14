import { nowMs, uid } from "../utils";
import type { LabelTemplate } from "../types";
import type { LabelsSlice, SliceCreator } from "./state";

/**
 * Шаблоны наклеек (п.6). Хранятся рядом с остальными настройками склада: это
 * не «оформление», а параметры печати — размер ленты и набор реквизитов, —
 * которые у конкретного склада меняются раз в год.
 */

/**
 * Стартовые шаблоны. Три случая, которые на складе встречаются каждый день:
 * обычный короб, короб с маркировкой и широкая транспортная лента, где код
 * удобнее слева от текста.
 */
function seedLabelTemplates(): LabelTemplate[] {
  const now = nowMs();
  return [
    {
      id: uid("lbl"),
      name: "Короб 58×40",
      widthMm: 58,
      heightMm: 40,
      layout: "vertical",
      codeType: "qr",
      elements: ["title", "seq", "code"],
      codeScale: 0.62,
      createdAt: now,
    },
    {
      id: uid("lbl"),
      name: "Короб с маркировкой 58×60",
      widthMm: 58,
      heightMm: 60,
      layout: "vertical",
      codeType: "qr",
      elements: ["title", "seq", "warehouse", "code", "mark"],
      codeScale: 0.5,
      createdAt: now,
    },
    {
      id: uid("lbl"),
      name: "Транспортная 100×70",
      widthMm: 100,
      heightMm: 70,
      layout: "horizontal",
      codeType: "barcode",
      elements: ["title", "seq", "warehouse", "code", "date", "fragile"],
      codeScale: 0.45,
      createdAt: now,
    },
  ];
}

export const createLabelsSlice: SliceCreator<LabelsSlice> = (set) => ({
  labelTemplates: seedLabelTemplates(),

  saveLabelTemplate: (tpl) => {
    const id = tpl.id ?? uid("lbl");
    set((s) => {
      const next: LabelTemplate = {
        ...tpl,
        id,
        createdAt: s.labelTemplates.find((t) => t.id === id)?.createdAt ?? nowMs(),
      };
      const exists = s.labelTemplates.some((t) => t.id === id);
      return {
        labelTemplates: exists
          ? s.labelTemplates.map((t) => (t.id === id ? next : t))
          : [...s.labelTemplates, next],
      };
    });
    return id;
  },

  removeLabelTemplate: (id) =>
    set((s) => ({
      labelTemplates: s.labelTemplates.filter((t) => t.id !== id),
    })),
});
