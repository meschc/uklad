import type { Dispatch, SetStateAction } from "react";
import { ClipboardCheck, Trash2 } from "lucide-react";
import { MAX_COUNT_QTY, type CountLine } from "@/lib/inventory";
import { useT, type MsgKey } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/field";
import { QtyStepper } from "@/components/fulfillment/QtyStepper";
import { ScanField, type ScanStatus } from "@/components/fulfillment/ScanField";
import { CodeTail } from "@/components/fulfillment/CodeTail";

/**
 * Что насчитали при инвентаризации: строка на товар с числом, которое можно
 * поправить руками. Общая для пересчёта тары и пересчёта пустой ячейки.
 */
export function CountLines({
  lines,
  setLines,
  nameOf,
  emptyKey,
}: {
  lines: CountLine[];
  setLines: Dispatch<SetStateAction<CountLine[]>>;
  nameOf: (id: string) => string;
  emptyKey: MsgKey;
}) {
  const t = useT();
  if (lines.length === 0) return <p className="text-sm text-muted-foreground">{t(emptyKey)}</p>;
  return (
    <ul className="flex flex-col gap-3">
      {lines.map((l) => (
        <li key={l.productId} className="flex items-center justify-between gap-4">
          <span className="min-w-0 truncate text-base font-medium">{nameOf(l.productId)}</span>
          <span className="flex items-center gap-2">
            <QtyStepper
              value={l.qty}
              max={MAX_COUNT_QTY}
              onChange={(qty) =>
                setLines((cur) => cur.map((x) => (x.productId === l.productId ? { ...x, qty } : x)))
              }
            />
            <Button
              variant="ghost"
              size="sm"
              aria-label={t("ws.count.remove")}
              onClick={() => setLines((cur) => cur.filter((x) => x.productId !== l.productId))}
            >
              <Trash2 />
            </Button>
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Пересчёт ячейки, где по учёту тары нет (Кирилл 15.11). Пусто — так и
 * завершают. Нашли товар — кладут его в свободную тару и сканируют её: товар
 * без тары учётом не становится, а старшему нужно, куда оприходовать излишек.
 */
export function CellCount(props: {
  where: string;
  lines: CountLine[];
  setLines: Dispatch<SetStateAction<CountLine[]>>;
  nameOf: (id: string) => string;
  status: ScanStatus;
  onProduct: (raw: string) => void;
  tote: string | null;
  onTote: (raw: string) => void;
  error: MsgKey | null;
  pending: boolean;
  onCancel: () => void;
  onFinish: () => void;
}) {
  const t = useT();
  const found = props.lines.some((l) => l.qty > 0);
  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="flex flex-col gap-1">
          <span className="font-mono text-2xl font-semibold">{props.where}</span>
          <span className="text-sm text-muted-foreground">{t("ws.count.cellNoBox")}</span>
        </p>
        <Button variant="ghost" size="sm" onClick={props.onCancel}>
          {t("ws.count.cancel")}
        </Button>
      </div>
      <ScanField
        label={t("ws.count.scanCellProduct")}
        hint={t("ws.count.scanProductHint")}
        status={props.status}
        onSubmit={props.onProduct}
      />
      <CountLines
        lines={props.lines}
        setLines={props.setLines}
        nameOf={props.nameOf}
        emptyKey="ws.count.cellNothing"
      />
      {found &&
        (props.tote ? (
          <p className="text-sm">
            {t("ws.count.toteChosen")} <CodeTail code={props.tote} className="font-semibold" />
          </p>
        ) : (
          <ScanField
            label={t("ws.count.scanTote")}
            hint={t("ws.count.scanToteHint")}
            status={props.status}
            onSubmit={props.onTote}
          />
        ))}
      {props.error && <FormError>{t(props.error)}</FormError>}
      <div>
        <Button
          disabled={props.pending || (found && !props.tote)}
          onClick={props.onFinish}
          size="lg"
        >
          <ClipboardCheck />
          {t(found ? "ws.count.finishCell" : "ws.count.finishCellEmpty")}
        </Button>
      </div>
    </>
  );
}
