import { useMemo, useState } from "react";
import { ClipboardCheck, Trash2 } from "lucide-react";
import { useEditor } from "@/lib/store";
import { workstationRepository } from "@/lib/data";
import { useCommand } from "@/lib/useCommand";
import { addressKey, formatAddress, parseAddress } from "@/lib/address";
import { countCoverage, MAX_COUNT_QTY, staleBoxes, type CountLine } from "@/lib/inventory";
import type { Box } from "@/lib/types";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { eyebrow } from "@/components/ui/eyebrow";
import { QtyStepper } from "@/components/fulfillment/QtyStepper";
import { ScanField, type ScanStatus } from "@/components/fulfillment/ScanField";
import { useNow } from "./useNow";
import { FormError } from "@/components/ui/field";

/** Сколько давно не считанной тары показываем: куда идти дальше. */
const NEXT_LIMIT = 8;

/**
 * Инвентаризация у стола: слепой пересчёт тары на полке.
 *
 * Сотрудник сканирует тару, затем сканирует каждый товар из неё (одна штука —
 * один скан) или правит число руками. Что должно быть по учёту, экран не
 * показывает вовсе, ни до, ни после: иначе число подгоняют. Сошлось — тара
 * отмечена пересчитанной; не сошлось — старший получает спорное и решает сам,
 * сотруднику говорят только «расхождение передано».
 */
export function InventoryStation() {
  const t = useT();
  const now = useNow(60_000);
  const boxes = useEditor((s) => s.boxes);
  const products = useEditor((s) => s.products);
  const warehouse = useEditor((s) => s.warehouse);
  const count = useCommand(workstationRepository.countBox);

  const [boxId, setBoxId] = useState<string | null>(null);
  const [lines, setLines] = useState<CountLine[]>([]);
  const [status, setStatus] = useState<ScanStatus>("idle");
  const [done, setDone] = useState<"matched" | "diff" | null>(null);
  // Скан ячейки, где стоит несколько тар: какую из них считать.
  const [choice, setChoice] = useState<Box[] | null>(null);

  const box = boxes.find((b) => b.id === boxId);
  const nameOf = (id: string) => products.find((p) => p.id === id)?.name ?? id;
  const coverage = useMemo(() => countCoverage(boxes, now), [boxes, now]);
  const next = useMemo(() => staleBoxes(boxes, now).slice(0, NEXT_LIMIT), [boxes, now]);
  const where = (b: Box) => (b.address && formatAddress(warehouse, b.address)) || "—";

  const reset = () => {
    setBoxId(null);
    setLines([]);
    setStatus("idle");
    setChoice(null);
    count.reset();
  };

  const open = (b: Box) => {
    setStatus("ok");
    setDone(null);
    setChoice(null);
    setBoxId(b.id);
    setLines([]);
  };

  const scanBox = (raw: string) => {
    const code = raw.trim().toUpperCase();
    // Ярлык ячейки: считаем тару, которая в ней стоит; если её несколько —
    // сотрудник выбирает, какую открыл.
    const addr = code.startsWith("UK-") ? null : parseAddress(warehouse, raw);
    if (addr) {
      const key = addressKey(addr);
      const here = boxes.filter((b) => b.address && !b.sealed && addressKey(b.address) === key);
      if (here.length === 1) return open(here[0]);
      setStatus(here.length ? "ok" : "error");
      setChoice(here);
      return;
    }
    const found = boxes.find((b) => b.barcode.toUpperCase() === code);
    // Считают то, что стоит на полке: у тары без места и невскрытого места
    // учёта нет, пересчитывать нечего.
    if (!found || !found.address || found.sealed) {
      setStatus("error");
      return;
    }
    open(found);
  };

  const scanProduct = (raw: string) => {
    const code = raw.trim().toLowerCase();
    const p = products.find(
      (x) => x.barcode.toLowerCase() === code || x.sku.toLowerCase() === code,
    );
    if (!p) {
      setStatus("error");
      return;
    }
    setStatus("ok");
    setLines((cur) =>
      cur.some((l) => l.productId === p.id)
        ? cur.map((l) => (l.productId === p.id ? { ...l, qty: l.qty + 1 } : l))
        : [...cur, { productId: p.id, qty: 1 }],
    );
  };

  const finish = async () => {
    if (!box) return;
    const res = await count.run(box.id, lines);
    if (!res.ok) return;
    const matched = res.data.matched;
    reset();
    setDone(matched ? "matched" : "diff");
  };

  return (
    <div className="flex flex-col gap-8">
      {!box ? (
        <>
          <ScanField
            label={t("ws.count.scanBox")}
            hint={t("ws.count.scanBoxHint")}
            status={status}
            onSubmit={scanBox}
          />
          {status === "error" && (
            <FormError>{t(choice ? "ws.count.cellEmpty" : "ws.count.boxUnknown")}</FormError>
          )}
          {choice && choice.length > 1 && (
            <section className="flex flex-col gap-2">
              <h2 className={eyebrow({ tone: "muted" })}>
                {t("ws.count.cellMany", { n: choice.length })}
              </h2>
              <div className="flex flex-wrap gap-2">
                {choice.map((b) => (
                  <Button key={b.id} variant="outline" onClick={() => open(b)}>
                    <span className="font-mono">{b.barcode}</span>
                  </Button>
                ))}
              </div>
            </section>
          )}
          {done && (
            <p role="status" className="text-sm font-medium text-success">
              {t(done === "matched" ? "ws.count.matched" : "ws.count.diff")}
            </p>
          )}
          <section className="flex flex-col gap-3">
            <h2 className={eyebrow({ tone: "muted" })}>
              {t("ws.count.coverage", { n: coverage.counted, total: coverage.total })}
            </h2>
            {next.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("ws.count.allDone")}</p>
            ) : (
              <ul className="flex flex-col text-sm">
                {next.map((b) => (
                  <li key={b.id} className="flex justify-between gap-4 py-1.5">
                    <span className="font-mono">{b.barcode}</span>
                    <span className="text-muted-foreground">
                      {where(b)} ·{" "}
                      {b.countedAt
                        ? new Date(b.countedAt).toLocaleDateString(
                            t.lang === "en" ? "en-GB" : "ru-RU",
                          )
                        : t("ws.count.never")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <p className="flex items-baseline gap-3">
              <span className="font-mono text-2xl font-semibold">{box.barcode}</span>
              <span className="text-muted-foreground">{where(box)}</span>
            </p>
            <Button variant="ghost" size="sm" onClick={reset}>
              {t("ws.count.cancel")}
            </Button>
          </div>
          <ScanField
            label={t("ws.count.scanProduct")}
            hint={t("ws.count.scanProductHint")}
            status={status}
            onSubmit={scanProduct}
          />
          {lines.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("ws.count.empty")}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {lines.map((l) => (
                <li key={l.productId} className="flex items-center justify-between gap-4">
                  <span className="min-w-0 truncate text-base font-medium">
                    {nameOf(l.productId)}
                  </span>
                  <span className="flex items-center gap-2">
                    <QtyStepper
                      value={l.qty}
                      max={MAX_COUNT_QTY}
                      onChange={(qty) =>
                        setLines((cur) =>
                          cur.map((x) => (x.productId === l.productId ? { ...x, qty } : x)),
                        )
                      }
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={t("ws.count.remove")}
                      onClick={() =>
                        setLines((cur) => cur.filter((x) => x.productId !== l.productId))
                      }
                    >
                      <Trash2 />
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {count.error && <FormError>{t(count.error)}</FormError>}
          <div>
            <Button disabled={count.pending} onClick={() => void finish()} size="lg">
              <ClipboardCheck />
              {t(lines.length === 0 ? "ws.count.finishEmpty" : "ws.count.finish")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
