import type { DocKind, DocModel } from "@/lib/documents";
import type { Warehouse } from "@/lib/types";
import { useT, type MsgKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Печатная форма документа (п.12). Один компонент на предпросмотр и на печать:
 * вторая копия вёрстки разъехалась бы с первой на ближайшей правке.
 *
 * Всегда чёрным по белому: документ уходит на бумагу, и «тёмная тема» на нём
 * означала бы залитый тонером лист.
 */

const TITLE_KEY: Record<DocKind, MsgKey> = {
  pick: "doc.kind.pick",
  shipment: "doc.kind.shipment",
  receiving: "doc.kind.receiving",
};

/** Кто вторая сторона: у сборки — куда, у отгрузки — кому, у приёмки — от кого. */
const PARTY_KEY: Record<DocKind, MsgKey> = {
  pick: "doc.counterparty",
  shipment: "doc.recipient",
  receiving: "doc.supplier",
};

export function DocumentSheet({
  doc,
  warehouse,
  className,
}: {
  doc: DocModel;
  warehouse: Warehouse;
  className?: string;
}) {
  const t = useT();
  const showFact = doc.kind !== "pick" || (doc.totalFact ?? 0) > 0;
  const showDiff = doc.kind === "receiving";
  const totalDiff = doc.totalFact != null ? doc.totalFact - doc.totalQty : null;

  return (
    <div
      className={cn("print-sheet flex flex-col gap-4 bg-white p-[10mm] text-black", className)}
      style={{ width: "210mm", minHeight: "297mm" }}
    >
      <header className="flex items-start justify-between gap-6 border-b-2 border-black pb-2">
        <div className="min-w-0">
          <p className="text-[15px] font-bold uppercase leading-tight">{t(TITLE_KEY[doc.kind])}</p>
          <p className="mt-0.5 font-mono text-[11px]">
            {t("doc.number")} {doc.number} {t("doc.from")} {new Date(doc.date).toLocaleDateString()}
          </p>
        </div>
        <div className="shrink-0 text-right text-[10px] leading-snug">
          <p className="font-semibold">{warehouse.name}</p>
          {warehouse.address && <p>{warehouse.address}</p>}
          {warehouse.phone && <p>{warehouse.phone}</p>}
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-[11px]">
        <Field label={t(PARTY_KEY[doc.kind])} value={doc.counterparty} />
        <Field label={t("doc.vehicle")} value={doc.vehicle} />
        <Field
          label={t("doc.responsible")}
          value={warehouse.contactPerson ?? warehouse.manager?.name}
        />
        <Field label={t("doc.positions")} value={String(doc.lines.length)} />
      </dl>

      <table className="w-full border-collapse text-[10px]">
        <thead>
          <tr className="bg-neutral-100">
            <Th className="w-8">№</Th>
            <Th className="w-24">{t("doc.col.sku")}</Th>
            <Th>{t("doc.col.name")}</Th>
            <Th className="w-28">{t("doc.col.address")}</Th>
            <Th className="w-16 text-right">{t("doc.col.qty")}</Th>
            {showFact && <Th className="w-16 text-right">{t("doc.col.fact")}</Th>}
            {showDiff && <Th className="w-16 text-right">{t("doc.col.diff")}</Th>}
          </tr>
        </thead>
        <tbody>
          {doc.lines.map((l) => {
            // Расхождение считается только там, где факт вообще есть: пустая
            // клетка «принято» означает «ещё не считали», а не «привезли ноль».
            const diff = l.fact != null ? l.fact - l.qty : null;
            return (
              <tr key={l.no} className="align-top">
                <Td className="tabular-nums">{l.no}</Td>
                <Td className="font-mono">{l.sku}</Td>
                <Td>
                  {l.name}
                  {l.note && <span className="text-neutral-600"> · {l.note}</span>}
                </Td>
                <Td className="font-mono text-[9px]">{l.address ?? "—"}</Td>
                <Td className="text-right tabular-nums">{l.qty}</Td>
                {showFact && (
                  // Пустая клетка вместо нуля: если факта ещё нет, его вписывают
                  // ручкой на месте — лист для того и печатают.
                  <Td className="text-right tabular-nums">{l.fact != null ? l.fact : ""}</Td>
                )}
                {showDiff && (
                  <Td
                    className={cn(
                      "text-right tabular-nums",
                      diff != null && diff !== 0 && "font-bold",
                    )}
                  >
                    {diff == null || diff === 0 ? "—" : diff > 0 ? `+${diff}` : diff}
                  </Td>
                )}
              </tr>
            );
          })}
          <tr className="bg-neutral-100 font-semibold">
            <Td colSpan={4}>{t("doc.total")}</Td>
            <Td className="text-right tabular-nums">{doc.totalQty}</Td>
            {showFact && <Td className="text-right tabular-nums">{doc.totalFact ?? ""}</Td>}
            {showDiff && <Td className="text-right tabular-nums">{totalDiff ? totalDiff : "—"}</Td>}
          </tr>
        </tbody>
      </table>

      <SignatureRow kind={doc.kind} />

      <p className="mt-auto pt-4 text-[8px] text-neutral-500">{t("doc.disclaimer")}</p>
    </div>
  );
}

/**
 * Подписи. Пары зависят от документа: лист сборки закрывает сам склад, а
 * накладную и приёмку подписывают две стороны — в этом весь их смысл.
 */
function SignatureRow({ kind }: { kind: DocKind }) {
  const t = useT();
  const pairs: MsgKey[] =
    kind === "pick"
      ? ["doc.sign.picker", "doc.sign.checked"]
      : kind === "shipment"
        ? ["doc.sign.released", "doc.sign.received"]
        : ["doc.sign.accepted", "doc.sign.supplier"];

  return (
    <div className="grid grid-cols-2 gap-8 pt-6 text-[10px]">
      {pairs.map((key) => (
        <div key={key} className="flex flex-col gap-6">
          <span className="font-semibold">{t(key)}</span>
          <div className="flex items-end gap-2">
            <span className="h-4 flex-1 border-b border-black" />
            <span className="w-28 shrink-0 border-b border-black text-center text-[8px] text-neutral-500">
              {t("doc.sign.name")}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex gap-1.5">
      <dt className="shrink-0 text-neutral-600">{label}:</dt>
      <dd className="min-w-0 flex-1 border-b border-dotted border-neutral-400 font-medium">
        {value || "—"}
      </dd>
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={cn("border border-neutral-400 px-1.5 py-1 text-left font-semibold", className)}>
      {children}
    </th>
  );
}

function Td({
  children,
  className,
  colSpan,
}: {
  children: React.ReactNode;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td colSpan={colSpan} className={cn("border border-neutral-400 px-1.5 py-1", className)}>
      {children}
    </td>
  );
}
