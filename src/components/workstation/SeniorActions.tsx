import { useState } from "react";
import { ArrowDown } from "lucide-react";
import { useEditor } from "@/lib/store";
import { workstationRepository } from "@/lib/data";
import { useCommand } from "@/lib/useCommand";
import { findByCode } from "@/lib/barcode";
import type { Box } from "@/lib/types";
import { useT, type MsgKey } from "@/lib/i18n";
import { ScanField, type ScanStatus } from "@/components/fulfillment/ScanField";
import { CodeText } from "@/components/fulfillment/CodeTail";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { EmbeddedShell } from "@/components/fulfillment/embeddedShell";
import { DisputesScreen } from "./DisputesScreen";

/**
 * Действия старшего за столом (Кирилл 17.11): спорные и перенос тары в одной
 * панели. Дальше сюда же — забрать тару и отменить чужой скан.
 */
export function SeniorActions() {
  const t = useT();
  const [tab, setTab] = useState<"disputes" | "move">("disputes");
  return (
    <div className="flex flex-col gap-4">
      <Segmented
        value={tab}
        onChange={setTab}
        grow
        ariaLabel={t("ws.senior.title")}
        options={[
          { value: "disputes", label: t("disputes.title") },
          { value: "move", label: t("ws.move.title") },
        ]}
      />
      {tab === "disputes" ? (
        <EmbeddedShell.Provider value={true}>
          <DisputesScreen />
        </EmbeddedShell.Provider>
      ) : (
        <ToteMove />
      )}
    </div>
  );
}

/**
 * Действие старшего (Кирилл 17.11): переложить тару целиком в другую — тара
 * переполнена, порвалась, недособранную нужно освободить. Заявки тары едут
 * вместе с товаром, поэтому упаковка найдёт их в новой таре. Право — решать
 * по товару; сервер принимает перенос только от старшего, который сейчас за
 * столом (`pack_move`, `deskMerge.js`).
 *
 * Два скана: откуда, потом куда. Между ними видно, что лежит в таре, — чтобы
 * старший перекладывал ту, что держит в руках.
 */
function ToteMove() {
  const t = useT();
  const boxes = useEditor((s) => s.boxes);
  const products = useEditor((s) => s.products);
  const requests = useEditor((s) => s.requests);
  const move = useCommand(workstationRepository.seniorMove, { exclusive: true });
  const [fromId, setFromId] = useState<string | null>(null);
  const [note, setNote] = useState<{ status: ScanStatus; key: MsgKey; box?: string } | null>(null);
  const from = fromId ? boxes.find((b) => b.id === fromId) : undefined;

  const pickFrom = (code: string) => {
    const box = findByCode(boxes, code);
    if (!box || box.address || box.sealed) return setNote({ status: "error", key: "ws.move.bad" });
    if (!box.lines.some((l) => l.qty > 0))
      return setNote({ status: "error", key: "ws.move.empty", box: box.barcode });
    setNote(null);
    setFromId(box.id);
  };

  const pickTo = async (code: string) => {
    if (!from) return;
    const res = await move.run(from.barcode, code);
    if (!res.ok) return setNote({ status: "error", key: res.error, box: from.barcode });
    setNote({ status: "ok", key: "ws.move.done", box: `${from.barcode} → ${code.trim()}` });
    setFromId(null);
  };

  const name = (id: string) => products.find((p) => p.id === id)?.name ?? id;
  const orders = (box: Box) =>
    requests.filter((r) => r.toteId === box.id && !r.packedAt && r.status !== "cancelled").length;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{t("ws.move.body")}</p>
      {from ? (
        <>
          <div className="rounded-lg border border-border p-3">
            <p className="text-sm font-medium">
              <CodeText text={from.barcode} />
              <span className="ml-2 text-muted-foreground">
                {t("ws.move.orders", { n: orders(from) })}
              </span>
            </p>
            <ul className="mt-2 flex flex-col gap-1 text-sm">
              {from.lines
                .filter((l) => l.qty > 0)
                .map((l) => (
                  <li key={l.productId} className="flex justify-between gap-3">
                    <span className="truncate">{name(l.productId)}</span>
                    <span className="tabular-nums">× {l.qty}</span>
                  </li>
                ))}
            </ul>
          </div>
          <ArrowDown className="size-5 self-center text-muted-foreground" />
          <ScanField
            key="to"
            label={t("ws.move.to")}
            status={note?.status ?? "idle"}
            disabled={move.pending}
            onSubmit={(code) => void pickTo(code)}
          />
          <Button
            variant="outline"
            className="self-start"
            onClick={() => {
              setFromId(null);
              setNote(null);
            }}
          >
            {t("ws.move.other")}
          </Button>
        </>
      ) : (
        <ScanField
          key="from"
          label={t("ws.move.from")}
          status={note?.status ?? "idle"}
          onSubmit={pickFrom}
        />
      )}
      {note?.status === "ok" && (
        <p role="status" className="text-sm text-success">
          <CodeText text={t(note.key, { box: note.box ?? "" })} />
        </p>
      )}
      {note && note.status !== "ok" && (
        <FormError>
          <CodeText text={t(note.key, { box: note.box ?? "" })} />
        </FormError>
      )}
    </div>
  );
}
