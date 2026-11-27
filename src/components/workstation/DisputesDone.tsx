import { useState } from "react";
import { X } from "lucide-react";
import { useEditor } from "@/lib/store";
import type { Dispute } from "@/lib/types";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { DialogHeader, DialogShell } from "@/components/ui/dialog-shell";
import { eyebrow } from "@/components/ui/eyebrow";
import { CodeTail } from "@/components/fulfillment/CodeTail";
import { kindKey, fmtAt, resKey } from "./disputeLabels";
import { Table, TableHeader, Th, Tr, Td } from "@/components/ui/table";

/**
 * Решённое спорное — таблицей, новое сверху (Кирилл 22.11 и 24.11: «в
 * решённое нельзя провалиться», «вкладки и таблицей»). Строка открывает
 * панель справа: что нашли, кто и когда, чем закончилось и почему.
 */
export function DisputesDone({
  items,
  nameOf,
  who,
}: {
  items: Dispute[];
  nameOf: (id?: string) => string;
  who: (id: string) => string;
}) {
  const t = useT();
  const [openId, setOpenId] = useState<string | null>(null);
  const rows = [...items].sort((a, b) => (b.resolvedAt ?? 0) - (a.resolvedAt ?? 0));
  const opened = rows.find((d) => d.id === openId) ?? null;

  if (rows.length === 0)
    return <p className="text-sm text-muted-foreground">{t("disputes.doneEmpty")}</p>;

  return (
    <>
      <Table>
        <TableHeader>
          <Th>{t("disputes.col.product")}</Th>
          <Th>{t("disputes.col.kind")}</Th>
          <Th className="text-right">{t("disputes.col.qty")}</Th>
          <Th>{t("disputes.col.result")}</Th>
          <Th>{t("disputes.col.by")}</Th>
          <Th>{t("disputes.col.at")}</Th>
        </TableHeader>
        <tbody>
          {rows.map((d) => (
            <Tr key={d.id} onOpen={() => setOpenId(d.id)}>
              <Td>
                <button
                  type="button"
                  className="text-left font-medium"
                  onClick={() => setOpenId(d.id)}
                >
                  {nameOf(d.productId)}
                </button>
              </Td>
              <Td data-label={t("disputes.col.kind")}>{t(kindKey(d))}</Td>
              <Td className="text-right tabular-nums" data-label={t("disputes.col.qty")}>
                {d.qty}
              </Td>
              <Td data-label={t("disputes.col.result")}>{t(resKey(d))}</Td>
              <Td className="text-muted-foreground" data-label={t("disputes.col.by")}>
                {who(d.resolvedBy!)}
                {d.restored ? ` · ${t("restore.fromBackup")}` : ""}
              </Td>
              <Td className="tabular-nums text-muted-foreground" data-label={t("disputes.col.at")}>
                {fmtAt(d.resolvedAt!)}
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>
      {opened && (
        <DoneDetails
          d={opened}
          name={nameOf(opened.productId)}
          who={who}
          onClose={() => setOpenId(null)}
        />
      )}
    </>
  );
}

function DoneDetails({
  d,
  name,
  who,
  onClose,
}: {
  d: Dispute;
  name: string;
  who: (id: string) => string;
  onClose: () => void;
}) {
  const t = useT();
  const boxes = useEditor((s) => s.boxes);
  const movedTo = d.movedTo ? (boxes.find((b) => b.id === d.movedTo)?.barcode ?? "—") : null;
  const fact = (label: string, value: React.ReactNode) => (
    <section className="flex flex-col gap-1">
      <h3 className={eyebrow()}>{label}</h3>
      <div className="text-sm">{value}</div>
    </section>
  );
  return (
    <DialogShell size="md" scroll onClose={onClose}>
      <DialogHeader>
        <p className="min-w-0 truncate text-sm font-semibold">
          {name} × {d.qty}
        </p>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label={t("support.close")}>
          <X className="size-4" />
        </Button>
      </DialogHeader>
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-4">
        {fact(t("disputes.col.kind"), t(kindKey(d)))}
        {fact(
          t("disputes.found"),
          <>
            {d.toteCode && (
              <span>
                <CodeTail code={d.toteCode} /> ·{" "}
              </span>
            )}
            {who(d.raisedBy)} · {fmtAt(d.raisedAt)}
          </>,
        )}
        {d.writeOffRequest &&
          fact(t("disputes.askedBy"), `${who(d.writeOffRequest.by)} · ${d.writeOffRequest.note}`)}
        {fact(
          t("disputes.col.result"),
          <>
            {t(resKey(d))}
            {movedTo ? ` → ${movedTo}` : ""} · {who(d.resolvedBy!)}
            {d.restored ? ` · ${t("restore.fromBackup")}` : ""} · {fmtAt(d.resolvedAt!)}
          </>,
        )}
        {d.note && fact(t("disputes.why"), d.note)}
      </div>
    </DialogShell>
  );
}
