import { useState } from "react";
import { useEditor } from "@/lib/store";
import { receivingAnswersRepository } from "@/lib/data";
import { useCommand } from "@/lib/useCommand";
import { useT } from "@/lib/i18n";
import { openObjections } from "@/lib/supplyAct";
import type { ExpectedShipment, ReceivingAnswer } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/field";
import { card } from "@/components/ui/card";

interface Sums {
  expected: number;
  received: number;
}

/** Заявлено и принято по строкам продавца в поставке. */
function sums(
  shipment: ExpectedShipment,
  partnerOf: Map<string, string | undefined>,
  partner: string,
): Sums {
  const out: Sums = { expected: 0, received: 0 };
  for (const l of shipment.lines) {
    if (partnerOf.get(l.productId) !== partner) continue;
    out.expected += l.expectedQty;
    out.received += l.receivedQty;
  }
  return out;
}

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

/**
 * Возражения продавцов на акт расхождений (Кирилл 17.11): комментарий
 * продавца, его итог по акту и, рядом, расхождения других продавцов той же
 * поставки — недостача у одного и излишек у другого чаще всего пересорт.
 * Старший отвечает «Учёт верный» или «Пересчитаем», ответ продавец видит
 * в своём акте. Решать — с `goods.decide`, иначе только смотреть.
 */
export function SellerObjections({ query, canDecide }: { query: string; canDecide: boolean }) {
  const t = useT();
  const answers = useEditor((s) => s.receivingAnswers);
  const shipments = useEditor((s) => s.expectedShipments);
  const products = useEditor((s) => s.products);
  const partners = useEditor((s) => s.warehouse.partners);

  const partnerOf = new Map(products.map((p) => [p.id, p.partnerId]));
  const nameOf = (id: string) => partners?.find((p) => p.id === id)?.name ?? id;
  const q = query.trim().toLowerCase();
  const shown = openObjections(answers).filter(
    (a) => !q || nameOf(a.partnerId).toLowerCase().includes(q),
  );
  if (shown.length === 0) return null;

  return (
    <ul className={card({ className: "flex flex-col divide-y divide-border" })}>
      {shown.map((a) => {
        const s = shipments.find((x) => x.id === a.shipmentId);
        const nearby = s
          ? [...new Set(s.lines.map((l) => partnerOf.get(l.productId)))]
              .filter((p): p is string => !!p && p !== a.partnerId)
              .map((p) => ({ p, ...sums(s, partnerOf, p) }))
              .filter((o) => o.received !== o.expected)
              .map((o) => `${nameOf(o.p)} ${signed(o.received - o.expected)}`)
          : [];
        return (
          <ObjectionLine
            key={a.shipmentId}
            a={a}
            who={nameOf(a.partnerId)}
            title={s?.title ?? t("supply.noName")}
            mine={s ? sums(s, partnerOf, a.partnerId) : undefined}
            nearby={nearby}
            canDecide={canDecide}
          />
        );
      })}
    </ul>
  );
}

function ObjectionLine({
  a,
  who,
  title,
  mine,
  nearby,
  canDecide,
}: {
  a: ReceivingAnswer;
  who: string;
  title: string;
  mine: Sums | undefined;
  nearby: string[];
  canDecide: boolean;
}) {
  const t = useT();
  const resolve = useCommand(receivingAnswersRepository.resolve);
  const [reply, setReply] = useState("");
  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
        {who}
        <span className="rounded bg-muted px-1.5 py-0.5 text-2xs font-semibold text-muted-foreground">
          {t("approvals.kind.seller")}
        </span>
        <span className="truncate text-xs font-normal text-muted-foreground">{title}</span>
      </p>
      {mine && (
        <p className="text-xs tabular-nums text-muted-foreground">
          {t("approvals.objection.act", { e: mine.expected, r: mine.received })}
          {nearby.length > 0 && ` · ${t("approvals.objection.nearby")}: ${nearby.join(", ")}`}
        </p>
      )}
      <p className="text-sm">{a.comment}</p>
      {canDecide && (
        <>
          <textarea
            value={reply}
            maxLength={1000}
            onChange={(e) => setReply(e.target.value)}
            placeholder={t("approvals.objection.reply")}
            aria-label={t("approvals.objection.reply")}
            className="h-16 w-full resize-none rounded-md border border-input bg-background p-2 text-sm"
          />
          {resolve.error && <FormError>{t(resolve.error)}</FormError>}
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={resolve.pending}
              onClick={() => void resolve.run(a.shipmentId, "recount", reply)}
            >
              {t("approvals.objection.recount")}
            </Button>
            <Button
              size="sm"
              disabled={resolve.pending}
              onClick={() => void resolve.run(a.shipmentId, "kept", reply)}
            >
              {t("approvals.objection.kept")}
            </Button>
          </div>
        </>
      )}
    </li>
  );
}
