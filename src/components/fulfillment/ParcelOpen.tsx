import { useState } from "react";
import { useEditor } from "@/lib/store";
import { fulfillmentRepository } from "@/lib/data";
import { useCommand } from "@/lib/useCommand";
import { formatAddress } from "@/lib/address";
import { lookup } from "@/lib/lookup";
import type { ParcelCard } from "@/lib/parcelCard";
import type { Box } from "@/lib/types";
import type { MsgKey, TFunc } from "@/lib/i18n";
import { FormError } from "@/components/ui/field";
import { ScanField } from "./ScanField";

/**
 * Вскрыть отменённую посылку (решение Кирилла 23.11: в кабинете, «Что это?»).
 * Два скана: пустая тара — товар посылки уходит в неё, посылка пропадает из
 * отгрузки; потом ячейка — тара встаёт на место, товар снова в остатке и идёт
 * по кругу. Ячейку можно не сканировать: тара останется неразмещённой.
 */
export function ParcelOpen({ card, t }: { card: ParcelCard; t: TFunc }) {
  const warehouse = useEditor((s) => s.warehouse);
  const products = useEditor((s) => s.products);
  const boxes = useEditor((s) => s.boxes);
  const pallets = useEditor((s) => s.pallets);
  const placements = useEditor((s) => s.placements);
  const open = useCommand(fulfillmentRepository.openParcel, { exclusive: true });
  const place = useCommand(fulfillmentRepository.placeBox, { exclusive: true });
  const [tote, setTote] = useState<Box | null>(null);
  const [error, setError] = useState<{ key: MsgKey; code?: string } | null>(null);
  const [placed, setPlaced] = useState<string | null>(null);

  const onTote = async (code: string) => {
    const res = await open.run(card.box.code, code);
    if (!res.ok) return setError({ key: res.error });
    setError(null);
    setTote(res.data);
  };

  const onCell = async (code: string) => {
    if (!tote) return;
    const hit = lookup(code, {
      warehouse,
      products,
      boxes,
      pallets,
      placements,
      format: (a) => formatAddress(warehouse, a),
    });
    if (hit.kind !== "cell") return setError({ key: "parcel.open.notCell", code: code.trim() });
    const res = await place.run(tote.id, hit.addr);
    if (!res.ok) return setError({ key: res.error });
    setError(null);
    setPlaced(hit.label ?? code.trim());
  };

  if (placed && tote)
    return (
      <p className="text-sm font-medium">
        {t("parcel.open.placed", { code: tote.barcode, cell: placed })}
      </p>
    );

  return (
    <div className="flex flex-col gap-3">
      {tote ? (
        <>
          <p className="text-sm font-medium">{t("parcel.open.done", { code: tote.barcode })}</p>
          <ScanField
            key="cell"
            label={t("parcel.open.cell")}
            status={error ? "error" : "idle"}
            disabled={place.pending}
            onSubmit={(c) => void onCell(c)}
          />
        </>
      ) : (
        <ScanField
          key="tote"
          label={t("parcel.open.tote")}
          status={error ? "error" : "idle"}
          disabled={open.pending}
          onSubmit={(c) => void onTote(c)}
        />
      )}
      {error && <FormError>{t(error.key, { code: error.code ?? "" })}</FormError>}
    </div>
  );
}
