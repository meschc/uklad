import { useMemo } from "react";
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
 * Документ здесь только показывают и печатают: сохранять его некуда — на складе
 * лист сборки существует на бумаге, а не в списке файлов.
 */

/** Масштаб предпросмотра: A4 шириной 210 мм в колонку диалога не влезает. */
const PREVIEW_SCALE = 0.52;

export function PickListDialog({
  ids,
  onClose,
}: {
  ids: string[];
  onClose: () => void;
}) {
  const t = useT();
  const warehouse = useEditor((s) => s.warehouse);
  const products = useEditor((s) => s.products);
  const placements = useEditor((s) => s.placements);
  const boxes = useEditor((s) => s.boxes);

  // Считаем один раз на набор: дату документа берёт сам сборщик документа, и
  // пересчёт на каждый рендер менял бы её под руками — предпросмотр и
  // распечатка разъехались бы номерами.
  const doc = useMemo(
    () => buildPickDocFromProducts(ids, products, warehouse, placements, boxes),
    [ids, products, warehouse, placements, boxes],
  );

  return (
    <>
      <Modal
        title={t("table.bulk.pickListTitle", {
          n: ids.length,
          unit: t.plural(
            ids.length,
            ["позиция", "позиции", "позиций"],
            ["item", "items"],
          ),
        })}
        onClose={onClose}
        onSubmit={() => window.print()}
        submitLabel={t("doc.print")}
      >
        <style>{`@page { size: A4 portrait; margin: 0; }`}</style>
        <div className="overflow-auto rounded-lg border border-border bg-muted/40 p-3 scrollbar-thin">
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
