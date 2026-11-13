import { useWarehouseProducts } from "@/lib/warehouseProducts";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEditor } from "@/lib/store";
import { buildPickDocFromProducts } from "@/lib/documents";
import { useT } from "@/lib/i18n";
import { DocumentSheet } from "@/components/fulfillment/DocumentSheet";
import { Modal } from "@/components/fulfillment/Modal";

/**
 * Лист сборки по отмеченным строкам таблицы: предпросмотр и печать.
 *
 * Диалог, а не переход на экран документов: отметка строк живёт в таблице и
 * переживёт переход только вместе с собой — то есть никак. Кладовщик отметил,
 * посмотрел, напечатал и вернулся к тем же отмеченным строкам.
 *
 * Документ здесь не сохраняется — на складе лист сборки существует на бумаге,
 * а не в списке файлов. Но шапку перед печатью заполнить можно (Кирилл 12 ноя:
 * «в листе сборки нет возможности редактирования полей назначения»):
 * назначение, ответственный и комментарий сразу видны в предпросмотре и уходят
 * на печать.
 */

/** Масштаб предпросмотра: A4 шириной 210 мм в колонку диалога не влезает. */
const PREVIEW_SCALE = 0.52;

export function PickListDialog({ ids, onClose }: { ids: string[]; onClose: () => void }) {
  const t = useT();
  const warehouse = useEditor((s) => s.warehouse);
  const products = useWarehouseProducts();
  const placements = useEditor((s) => s.placements);
  const boxes = useEditor((s) => s.boxes);

  // Считаем один раз на набор: дату документа берёт сам сборщик документа, и
  // пересчёт на каждый рендер менял бы её под руками — предпросмотр и
  // распечатка разъехались бы номерами.
  const base = useMemo(
    () => buildPickDocFromProducts(ids, products, warehouse, placements, boxes),
    [ids, products, warehouse, placements, boxes],
  );
  const [counterparty, setCounterparty] = useState("");
  const [responsible, setResponsible] = useState("");
  const [comment, setComment] = useState("");
  const doc = {
    ...base,
    counterparty: counterparty.trim() || undefined,
    responsible: responsible.trim() || undefined,
    comment: comment.trim() || undefined,
  };
  const field = (id: string, label: string, value: string, set: (v: string) => void) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} maxLength={120} onChange={(e) => set(e.target.value)} />
    </div>
  );

  return (
    <>
      <Modal
        title={t("table.bulk.pickListTitle", {
          n: ids.length,
          unit: t.plural(ids.length, ["позиция", "позиции", "позиций"], ["item", "items"]),
        })}
        onClose={onClose}
        onSubmit={() => window.print()}
        submitLabel={t("doc.print")}
      >
        <style>{`@page { size: A4 portrait; margin: 0; }`}</style>
        <div className="grid gap-3 sm:grid-cols-2">
          {field("pick-to", t("doc.counterparty"), counterparty, setCounterparty)}
          {field("pick-resp", t("doc.responsible"), responsible, setResponsible)}
          <div className="sm:col-span-2">
            {field("pick-comment", t("doc.comment"), comment, setComment)}
          </div>
        </div>
        <div className="overflow-auto rounded-lg bg-muted/40 p-3 scrollbar-thin">
          <div
            style={{
              width: `calc(210mm * ${PREVIEW_SCALE})`,
              height: `calc(297mm * ${PREVIEW_SCALE})`,
            }}
          >
            <div
              style={{
                transform: `scale(${PREVIEW_SCALE})`,
                transformOrigin: "top left",
              }}
            >
              <DocumentSheet doc={doc} warehouse={warehouse} className="shadow-lg" />
            </div>
          </div>
        </div>
      </Modal>

      {/* Печатная версия: только лист, без интерфейса. */}
      <div className="print-root hidden print:block">
        <DocumentSheet doc={doc} warehouse={warehouse} />
      </div>
    </>
  );
}
