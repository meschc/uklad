import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useEditor } from "@/lib/store";
import { fulfillmentRepository } from "@/lib/data";
import { useCommand } from "@/lib/useCommand";
import { useT } from "@/lib/i18n";
import { uid } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { eyebrow } from "@/components/ui/eyebrow";
import { Modal, Field } from "./Modal";

/**
 * «Везу товар» — заявка продавца на ПРИЁМКУ, зеркало заявки на отгрузку.
 *
 * Продавец предупреждает склад о том, что и в каком количестве приедет, склад
 * видит это в списке ожидаемых поставок и принимает по строкам со сверкой
 * план/факт. Без этого шага приёмка начиналась бы вслепую: кладовщик узнавал
 * бы состав партии только из коробки.
 */
interface Line {
  /**
   * Ключ строки в списке. Нужен потому, что строку можно удалить из середины:
   * по номеру позиции React считал бы, что удалили последнюю, а у оставшихся
   * поменялось содержимое, — и переносил бы фокус и каретку на соседнее поле.
   * К данным поставки идентификатор отношения не имеет и в стор не уезжает.
   */
  id: string;
  productId: string;
  qty: string;
}

export function SupplyDialog({ onClose }: { onClose: () => void }) {
  const products = useEditor((s) => s.products);
  const t = useT();

  const newLine = (): Line => ({ id: uid("line"), productId: products[0]?.id ?? "", qty: "1" });

  const [title, setTitle] = useState("");
  const [lines, setLines] = useState<Line[]>(() => [newLine()]);

  const setLine = (i: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const valid = lines.some((l) => l.productId && Number(l.qty) > 0);

  // Через репозиторий, а не действием стора: это шов, за которым появится
  // сервер (п.3.2.1). Ожидание и отказ рисует само окно.
  const create = useCommand(() => {
    const payload = lines
      .filter((l) => l.productId && Number(l.qty) > 0)
      .map((l) => ({
        productId: l.productId,
        expectedQty: Math.round(Number(l.qty)),
      }));
    // Источник «вручную»: поставку завёл человек, а не интеграция.
    return fulfillmentRepository.createShipment("manual", payload, title.trim() || undefined);
  });

  const submit = async () => {
    if (!valid) return;
    const res = await create.run();
    if (res.ok) onClose();
  };

  return (
    <Modal
      title={t("supply.title")}
      onClose={onClose}
      onSubmit={() => void submit()}
      submitLabel={t("supply.confirm")}
      disabled={!valid}
      pending={create.pending}
      error={create.error}
    >
      <p className="text-xs text-muted-foreground">{t("supply.subtitle")}</p>

      <Field label={t("supply.name")}>
        <Input
          // eslint-disable-next-line jsx-a11y/no-autofocus -- диалог открыт по действию пользователя: фокус обязан уйти в первое поле
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("supply.namePlaceholder")}
        />
      </Field>

      <div className="flex flex-col gap-2">
        {lines.map((l, i) => (
          <div key={l.id} className="flex items-end gap-2">
            <label className="flex min-w-0 flex-1 flex-col gap-1">
              <span className={eyebrow()}>{t("supply.product")}</span>
              <select
                value={l.productId}
                onChange={(e) => setLine(i, { productId: e.target.value })}
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex w-20 flex-col gap-1">
              <span className={eyebrow()}>{t("supply.qty")}</span>
              <Input
                value={l.qty}
                inputMode="numeric"
                onChange={(e) => setLine(i, { qty: e.target.value.replace(/\D/g, "") })}
                className="tabular-nums"
              />
            </label>
            <Button
              size="icon-sm"
              variant="ghost"
              disabled={lines.length === 1}
              title={t("supply.removeLine")}
              onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))}
        <Button
          size="sm"
          variant="outline"
          className="self-start"
          onClick={() => setLines((ls) => [...ls, newLine()])}
        >
          <Plus className="size-3.5" />
          {t("supply.addLine")}
        </Button>
      </div>
    </Modal>
  );
}
