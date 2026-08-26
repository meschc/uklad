import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useEditor } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  productId: string;
  qty: string;
}

export function SupplyDialog({ onClose }: { onClose: () => void }) {
  const products = useEditor((s) => s.products);
  const createExpectedShipment = useEditor((s) => s.createExpectedShipment);
  const t = useT();

  const [title, setTitle] = useState("");
  const [lines, setLines] = useState<Line[]>([
    { productId: products[0]?.id ?? "", qty: "1" },
  ]);

  const setLine = (i: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const valid = lines.some((l) => l.productId && Number(l.qty) > 0);

  const submit = () => {
    const payload = lines
      .filter((l) => l.productId && Number(l.qty) > 0)
      .map((l) => ({
        productId: l.productId,
        expectedQty: Math.round(Number(l.qty)),
      }));
    if (!payload.length) return;
    // Источник «вручную»: поставку завёл человек, а не интеграция.
    createExpectedShipment("manual", payload, title.trim() || undefined);
    onClose();
  };

  return (
    <Modal
      title={t("supply.title")}
      onClose={onClose}
      onSubmit={submit}
      submitLabel={t("supply.confirm")}
      disabled={!valid}
    >
      <p className="text-xs text-muted-foreground">{t("supply.subtitle")}</p>

      <Field label={t("supply.name")}>
        <Input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("supply.namePlaceholder")}
        />
      </Field>

      <div className="flex flex-col gap-2">
        {lines.map((l, i) => (
          <div key={i} className="flex items-end gap-2">
            <label className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t("supply.product")}
              </span>
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
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t("supply.qty")}
              </span>
              <Input
                value={l.qty}
                inputMode="numeric"
                onChange={(e) =>
                  setLine(i, { qty: e.target.value.replace(/\D/g, "") })
                }
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
          onClick={() =>
            setLines((ls) => [
              ...ls,
              { productId: products[0]?.id ?? "", qty: "1" },
            ])
          }
        >
          <Plus className="size-3.5" />
          {t("supply.addLine")}
        </Button>
      </div>
    </Modal>
  );
}
