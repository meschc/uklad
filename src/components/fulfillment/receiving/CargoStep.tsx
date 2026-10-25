import { useState } from "react";
import { Truck } from "lucide-react";
import { useEditor } from "@/lib/store";
import { fulfillmentRepository } from "@/lib/data";
import { useCommand } from "@/lib/useCommand";
import { cargoDiff, hasCargoDiff, sealedUnits } from "@/lib/cargo";
import { type TFunc } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { card } from "@/components/ui/card";
import { eyebrow } from "@/components/ui/eyebrow";
import { EmptyState } from "../ScreenShell";

/**
 * Грузовая приёмка (первый этап из двух): места поставки при водителе.
 *
 * Здесь не пересчитывают штуки и не вскрывают тару — только «сколько паллет и
 * коробов по накладной и сколько приехало». Каждое принятое место получает
 * свой ярлык и ждёт товарной приёмки невскрытым. Расхождение по местам видно
 * сразу, пока водитель ещё здесь и акт можно подписать.
 */
export function CargoStep({ staffId, t }: { staffId: string; t: TFunc }) {
  const shipments = useEditor((s) => s.expectedShipments);
  const pallets = useEditor((s) => s.pallets);
  const boxes = useEditor((s) => s.boxes);
  const open = shipments.filter((s) => s.status !== "closed");
  const [shipmentId, setShipmentId] = useState("");
  const [declP, setDeclP] = useState("");
  const [declB, setDeclB] = useState("");
  const [factP, setFactP] = useState("");
  const [factB, setFactB] = useState("");
  const [last, setLast] = useState<string[] | null>(null);
  const { run, pending, error } = useCommand(fulfillmentRepository.acceptCargo);

  const current = open.find((s) => s.id === shipmentId) ?? open[0];
  if (!current) {
    return <EmptyState icon={<Truck className="size-5" />} title={t("cargo.empty")} />;
  }

  const num = (v: string) =>
    v.trim() === "" ? undefined : Math.max(0, Math.round(Number(v)) || 0);
  const canSubmit = (num(factP) ?? 0) + (num(factB) ?? 0) > 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await run({
      shipmentId: current.id,
      pallets: num(factP) ?? 0,
      boxes: num(factB) ?? 0,
      declaredPallets: num(declP),
      declaredBoxes: num(declB),
      staffId,
    });
    if (!res.ok) return;
    const ids = new Set([...res.data.palletIds, ...res.data.boxIds]);
    const s = useEditor.getState();
    setLast([
      ...s.pallets.filter((p) => ids.has(p.id)).map((p) => p.barcode),
      ...s.boxes.filter((b) => ids.has(b.id)).map((b) => b.barcode),
    ]);
    setFactP("");
    setFactB("");
  };

  const waiting = sealedUnits(current.id, pallets, boxes);
  const diff = current.cargo ? cargoDiff(current.cargo) : null;
  const signed = (n: number) => (n > 0 ? `+${n}` : `−${-n}`);

  return (
    <div className="flex flex-col gap-4">
      {}
      <label className="flex flex-col items-start gap-1.5">
        <span className={eyebrow()}>{t("cargo.shipment")}</span>
        <select
          value={current.id}
          onChange={(e) => {
            setShipmentId(e.target.value);
            setLast(null);
          }}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {open.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title ?? t("doc.src.shipment")}
            </option>
          ))}
        </select>
      </label>

      <form onSubmit={submit} className={cn(card({ pad: "lg" }), "grid gap-4 sm:grid-cols-2")}>
        <fieldset className="flex flex-col gap-2">
          <legend className={cn(eyebrow(), "mb-2")}>{t("cargo.declared")}</legend>
          <NumField label={t("cargo.pallets")} value={declP} onChange={setDeclP} />
          <NumField label={t("cargo.boxes")} value={declB} onChange={setDeclB} />
        </fieldset>
        <fieldset className="flex flex-col gap-2">
          <legend className={cn(eyebrow(), "mb-2")}>{t("cargo.fact")}</legend>
          <NumField label={t("cargo.pallets")} value={factP} onChange={setFactP} />
          <NumField label={t("cargo.boxesLoose")} value={factB} onChange={setFactB} />
        </fieldset>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <Button type="submit" disabled={!canSubmit || pending}>
            <Truck className="size-3.5" />
            {t("cargo.accept")}
          </Button>
          {error && <span className="text-xs text-destructive">{t(error)}</span>}
        </div>
      </form>

      {current.cargo && diff && (
        <div className={cn(card({ pad: "md" }), "flex flex-col gap-1 text-sm")}>
          <p>{t("cargo.total", { p: current.cargo.pallets, b: current.cargo.boxes })}</p>
          {hasCargoDiff(current.cargo) ? (
            <p className="text-destructive">
              {t("cargo.diff", {
                list: [
                  diff.pallets ? `${t("cargo.pallets").toLowerCase()} ${signed(diff.pallets)}` : "",
                  diff.boxes ? `${t("cargo.boxes").toLowerCase()} ${signed(diff.boxes)}` : "",
                ]
                  .filter(Boolean)
                  .join(", "),
              })}
            </p>
          ) : (
            current.cargo.declaredPallets != null && (
              <p className="text-muted-foreground">{t("cargo.match")}</p>
            )
          )}
          <p className="text-muted-foreground">
            {t("cargo.waiting", { p: waiting.pallets.length, b: waiting.boxes.length })}
          </p>
        </div>
      )}

      {last && last.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs text-muted-foreground">{t("cargo.labels")}</p>
          <p className="font-mono text-xs leading-relaxed">{last.join("  ")}</p>
        </div>
      )}
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span>{label}</span>
      <Input
        type="number"
        min={0}
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-24 text-right tabular-nums"
      />
    </label>
  );
}
