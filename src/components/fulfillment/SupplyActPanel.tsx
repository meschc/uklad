import { useState } from "react";
import { createPortal } from "react-dom";
import { FileDown, X } from "lucide-react";
import { useEditor } from "@/lib/store";
import { receivingAnswersRepository } from "@/lib/data";
import { useCommand } from "@/lib/useCommand";
import { useOwnPrint } from "@/lib/printOwner";
import { nowMs } from "@/lib/utils";
import { useT, type MsgKey, type TFunc } from "@/lib/i18n";
import { answerDeadline, answerState, type AnswerState, type SupplyActLine } from "@/lib/supplyAct";
import type { ExpectedShipment, Product, ReceivingAnswer } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { DialogHeader, DialogShell } from "@/components/ui/dialog-shell";
import { Field, FormError } from "@/components/ui/field";

export interface ActRow {
  shipment: ExpectedShipment;
  lines: SupplyActLine[];
}

const STATE_KEY: Record<Exclude<AnswerState, "waiting" | "open">, MsgKey> = {
  agreed: "supply.act.state.agreed",
  silent: "supply.act.state.silent",
  disputed: "supply.act.state.disputed",
  resolved: "supply.act.state.disputed",
};

/**
 * Акт расхождений по поставке продавца (Кирилл 17.11): заявлено, принято,
 * разница и что с излишком. По закрытой поставке продавец отвечает один раз
 * «Согласен» или «Не согласен» с комментарием, пока не вышли трое суток;
 * молчание — согласие. Возражение уходит старшему в «Подтверждения», его
 * ответ виден здесь же. «Скачать PDF» — печать браузера, лист с ответом.
 */
export function SupplyActPanel({
  row,
  products,
  onClose,
}: {
  row: ActRow;
  products: Product[];
  onClose: () => void;
}) {
  const t = useT();
  const { shipment: s, lines } = row;
  const answers = useEditor((st) => st.receivingAnswers);
  // Свой ответ: в поставке бывает товар нескольких продавцов, у каждого свой.
  const me = useEditor((st) => st.session.user.partnerId);
  const answer = answers.find((a) => a.shipmentId === s.id && a.partnerId === me);
  // Срок сверяем на момент открытия акта; окончательно решает сервер.
  const [now] = useState(() => nowMs());
  const state = answerState(s, answer, now);
  const closed = s.status === "closed";
  const shown = lines.filter((l) => l.diff > 0 || (closed && l.diff < 0));
  const locale = t.lang === "en" ? "en-GB" : "ru-RU";
  const date = (ms: number) => new Date(ms).toLocaleDateString(locale);

  return (
    <DialogShell size="lg" scroll onClose={onClose}>
      <DialogHeader align="start">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{t("supply.act.title")}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {s.title ?? t("supply.noName")}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button size="sm" variant="outline" onClick={() => window.print()}>
            <FileDown className="size-4" />
            {t("supply.act.pdf")}
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label={t("support.close")}>
            <X className="size-4" />
          </Button>
        </div>
      </DialogHeader>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">
        <p className="text-xs text-muted-foreground">
          {t(closed ? "supply.act.bodyClosed" : "supply.act.bodyOpen")}
        </p>
        <div className="overflow-hidden rounded-xl border border-border">
          <ActTable lines={shown} products={products} t={t} />
        </div>
        {state === "open" ? (
          <AnswerForm shipmentId={s.id} until={answerDeadline(s) ?? now} date={date} />
        ) : (
          <AnswerNote state={state} answer={answer} date={date} />
        )}
      </div>
      <ActSheet
        row={{ shipment: s, lines: shown }}
        products={products}
        state={state}
        answer={answer}
      />
    </DialogShell>
  );
}

function ActTable({
  lines,
  products,
  t,
  paper = false,
}: {
  lines: readonly SupplyActLine[];
  products: Product[];
  t: TFunc;
  paper?: boolean;
}) {
  const cell = paper ? "py-1.5 pr-2" : "px-3 py-2";
  return (
    <table className="w-full border-collapse text-sm">
      <thead className={paper ? "" : "bg-muted/50 text-xs"}>
        <tr className={paper ? "border-b border-black text-left" : "text-left"}>
          <th className={`${cell} font-medium`}>{t("table.col.name")}</th>
          <th className={`${cell} text-right font-medium`}>{t("supply.act.expected")}</th>
          <th className={`${cell} text-right font-medium`}>{t("supply.act.received")}</th>
          <th className={`${cell} text-right font-medium`}>{t("supply.act.diff")}</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((l) => {
          const p = products.find((x) => x.id === l.productId);
          return (
            <tr
              key={l.lineId}
              className={paper ? "border-b border-black/20" : "border-t border-border/60 align-top"}
            >
              <td className={cell}>
                <div className="font-medium">{p?.name ?? "—"}</div>
                <div className="font-mono text-2xs opacity-70">{p?.sku}</div>
                {l.diff > 0 && (
                  <div className="mt-0.5 text-2xs opacity-70">
                    {t(`supply.act.overage.${l.overage ?? "pending"}`)}
                  </div>
                )}
              </td>
              <td className={`${cell} text-right tabular-nums`}>{l.expected}</td>
              <td className={`${cell} text-right tabular-nums`}>{l.received}</td>
              <td className={`${cell} text-right font-medium tabular-nums`}>
                {l.diff > 0 ? `+${l.diff}` : l.diff}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function AnswerForm({
  shipmentId,
  until,
  date,
}: {
  shipmentId: string;
  until: number;
  date: (ms: number) => string;
}) {
  const t = useT();
  const send = useCommand(receivingAnswersRepository.answer);
  const [disputing, setDisputing] = useState(false);
  const [comment, setComment] = useState("");
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border p-3">
      <p className="text-xs text-muted-foreground">
        {t("supply.act.deadline", { date: date(until) })}
      </p>
      {disputing && (
        <Field label={t("supply.act.comment")}>
          <textarea
            value={comment}
            maxLength={1000}
            onChange={(e) => setComment(e.target.value)}
            placeholder={t("supply.act.commentHint")}
            className="h-24 w-full resize-none rounded-md border border-input bg-background p-2 text-sm"
          />
        </Field>
      )}
      {send.error && <FormError>{t(send.error)}</FormError>}
      <div className="flex flex-wrap justify-end gap-2">
        {disputing ? (
          <Button
            disabled={send.pending}
            onClick={() => void send.run(shipmentId, "dispute", comment)}
          >
            {t("supply.act.send")}
          </Button>
        ) : (
          <>
            <Button variant="outline" disabled={send.pending} onClick={() => setDisputing(true)}>
              {t("supply.act.dispute")}
            </Button>
            <Button disabled={send.pending} onClick={() => void send.run(shipmentId, "agree", "")}>
              {t("supply.act.agree")}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

/** Где акт по ответу: строка состояния, комментарий продавца и ответ склада. */
function AnswerNote({
  state,
  answer,
  date,
  paper = false,
}: {
  state: AnswerState;
  answer: ReceivingAnswer | undefined;
  date: (ms: number) => string;
  paper?: boolean;
}) {
  const t = useT();
  if (state === "waiting" || state === "open") return null;
  const muted = paper ? "" : "text-muted-foreground";
  return (
    <div className={paper ? "mt-6 flex flex-col gap-2" : "flex flex-col gap-2 text-sm"}>
      <p className="font-medium">
        {t(STATE_KEY[state], { date: answer ? date(answer.answeredAt) : "" })}
      </p>
      {answer?.comment && (
        <p className={muted}>
          {t("supply.act.yourComment")}: {answer.comment}
        </p>
      )}
      {answer?.resolution && (
        <p>
          <span className="font-medium">{t(`supply.act.state.${answer.resolution}`)}</span>
          {answer.reply && (
            <span className={muted}>
              {" "}
              · {t("supply.act.reply")}: {answer.reply}
            </span>
          )}
        </p>
      )}
    </div>
  );
}

/** Лист A4 для «Сохранить как PDF»: только акт, без интерфейса. */
function ActSheet({
  row,
  products,
  state,
  answer,
}: {
  row: ActRow;
  products: Product[];
  state: AnswerState;
  answer: ReceivingAnswer | undefined;
}) {
  useOwnPrint();
  const t = useT();
  const warehouse = useEditor((st) => st.warehouse.name);
  const [made] = useState(() => nowMs());
  const locale = t.lang === "en" ? "en-GB" : "ru-RU";
  const date = (ms: number) => new Date(ms).toLocaleDateString(locale);
  const { shipment: s, lines } = row;
  return createPortal(
    <div className="print-root print-flow hidden bg-white p-10 text-sm text-black print:block">
      <h1 className="text-xl font-semibold">{t("supply.act.title")}</h1>
      <p className="mt-1">{warehouse}</p>
      <p className="mt-4">
        {s.title ?? t("supply.noName")}
        {s.closedAt ? ` · ${date(s.closedAt)}` : ""}
      </p>
      <p className="mt-1 text-xs">
        {t(s.status === "closed" ? "supply.act.bodyClosed" : "supply.act.bodyOpen")}
      </p>
      <div className="mt-6">
        <ActTable lines={lines} products={products} t={t} paper />
      </div>
      <AnswerNote state={state} answer={answer} date={date} paper />
      <p className="mt-10 text-xs">
        {t("supply.act.made")} {new Date(made).toLocaleString(locale)}
      </p>
    </div>,
    document.body,
  );
}
