import { useRef, useState, useEffect } from "react";
import { Printer, Truck } from "lucide-react";
import { useEditor } from "@/lib/store";
import { workstationRepository } from "@/lib/data";
import { groupRequestsByTarget } from "@/lib/fulfillment";
import { parseVehicle, vehicleCode } from "@/lib/barcode";
import {
  classifyLoadScan,
  expectedOutbound,
  missingOutbound,
  openOutbound,
  outboundUnits,
  planLoad,
} from "@/lib/outbound";
import { beepNotes } from "@/lib/beep";
import { levelFor, signal } from "@/lib/scanSignal";
import { destinationMark } from "@/lib/destinationMark";
import { parseBadge } from "@/lib/workstation";
import { isDecider } from "@/lib/docFlow";
import { useDeskDeciders } from "@/lib/useDeskDeciders";
import type { FulfillmentRequest } from "@/lib/types";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { eyebrow } from "@/components/ui/eyebrow";
import { QrSvg } from "@/components/table/QrSvg";
import { EmptyState } from "@/components/fulfillment/ScreenShell";
import { ScanField } from "@/components/fulfillment/ScanField";
import { ScanBanner, type BannerTone } from "./ScanBanner";
import { useDemoHints } from "./useDemoHints";
import { DestinationChip } from "./DestinationChip";

/**
 * Отгрузка за столом: собранные заявки одного назначения уезжают одной
 * машиной (`shipRequests`). Порядок как на складе: скан машины (QR в кабине
 * или номер руками), затем скан каждой паллеты и короба, которые грузят,
 * «Завершить». Отгрузил тот, кто вошёл по бейджу. Машину, если её назвал
 * продавец, подставляем сами.
 *
 * Короба, упакованные на столе, известны по составу (`outboundBoxes`): чужой
 * короб в эту машину не примем, а короб назначения, оставшийся у стола,
 * покажем списком до «Завершить».
 */
export function ShipStation({ staffId }: { staffId: string }) {
  const t = useT();
  const requests = useEditor((s) => s.requests);
  const ready = groupRequestsByTarget(requests.filter((r) => r.status === "done"));

  if (ready.length === 0) {
    return (
      <EmptyState
        icon={<Truck className="size-5" />}
        title={t("ws.ship.emptyTitle")}
        body={t("ws.ship.empty")}
      />
    );
  }
  return <ShipList groups={ready} staffId={staffId} />;
}

/**
 * Грузят одну машину за раз: сканер «слышит» только открытую группу, иначе один
 * скан короба ушёл бы сразу во все назначения. Остальные ждут свёрнутыми.
 */
function ShipList({
  groups,
  staffId,
}: {
  groups: ReturnType<typeof groupRequestsByTarget>;
  staffId: string;
}) {
  const t = useT();
  const [open, setOpen] = useState<string | null>(null);
  const keyOf = (g: { target: string | null }) => g.target ?? "—";
  // Открытая группа могла уехать — тогда берём первую из оставшихся.
  const active = groups.some((g) => keyOf(g) === open) ? open : keyOf(groups[0]);
  return (
    <div className="flex flex-col gap-8">
      {groups.map((g) =>
        keyOf(g) === active ? (
          <ShipGroup
            key={keyOf(g)}
            target={g.target ?? t("ws.ship.noTarget")}
            items={g.items}
            staffId={staffId}
          />
        ) : (
          <section
            key={keyOf(g)}
            className="flex flex-wrap items-baseline justify-between gap-3 border-t border-border pt-6"
          >
            <h3 className="text-lg">
              <DestinationChip destination={g.target ?? t("ws.ship.noTarget")} />
            </h3>
            <div className="flex items-center gap-4">
              <span className={eyebrow({ tone: "muted" })}>
                {t("ws.ship.count", { n: g.items.length })}
              </span>
              <Button variant="outline" size="sm" onClick={() => setOpen(keyOf(g))}>
                {t("ws.ship.load")}
              </Button>
            </div>
          </section>
        ),
      )}
    </div>
  );
}

function ShipGroup({
  target,
  items,
  staffId,
}: {
  target: string;
  items: FulfillmentRequest[];
  staffId: string;
}) {
  const demoHints = useDemoHints();
  const t = useT();
  const products = useEditor((s) => s.products);
  const allRequests = useEditor((s) => s.requests);
  const staff = useEditor((s) => s.warehouse.staff);
  // Снять остановку вправе тот, кто решает по товару: на сервере — по роли.
  const deciders = useDeskDeciders();
  const onServer = useEditor((s) => s.session.source === "server");
  const outbound = useEditor((s) => s.outboundBoxes);
  const boxes = useEditor((s) => s.boxes);
  const pallets = useEditor((s) => s.pallets);
  // Разные машины в одной группе не склеиваем — тогда машину сканируют.
  const named = [...new Set(items.map((r) => r.vehicle).filter(Boolean))];
  const [vehicle, setVehicle] = useState(named.length === 1 ? (named[0] as string) : "");
  const [units, setUnits] = useState<string[]>([]);
  const [banner, setBanner] = useState<{ tone: BannerTone; text: string }>({
    tone: "idle",
    text: "",
  });
  // Повторный скан останавливает погрузку до бейджа старшего: короб, который
  // «пикнули» дважды, обычно значит, что второй, похожий, уехал не туда.
  const [locked, setLocked] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const flash = (tone: "ok" | "error", text: string, key?: string) => {
    const level = tone === "ok" || !key ? tone : levelFor(key);
    signal(level);
    show(level, text);
  };
  // Без общего писка: у принятого короба свой звук назначения.
  const show = (tone: "ok" | "warn" | "error", text: string) => {
    window.clearTimeout(timer.current);
    setBanner({ tone, text });
    // Ошибка висит до следующего скана, «принято» гаснет само.
    if (tone === "ok") {
      timer.current = window.setTimeout(() => setBanner({ tone: "idle", text: "" }), 2200);
    }
  };

  // Недостача — собрано меньше, чем заказано: такую машину не отправляют молча.
  const short = items.reduce((n, r) => n + Math.max(0, r.qty - (r.pickedQty ?? r.qty)), 0);
  const ids = items.map((r) => r.id);
  const expected = expectedOutbound(outbound ?? [], ids);
  // Короб назначения, который не погрузили, — это заказы, которые не уедут.
  const missing = missingOutbound(expected, units);
  // Уезжает заявка, только если все её короба в машине; короб, где есть и
  // остающаяся заявка, рейс не пропустит — его несут старшему.
  const plan = planLoad(outbound ?? [], ids, units);
  const staying = items.length - plan.going.length;

  const onScan = (raw: string) => {
    if (locked) {
      const id = parseBadge(raw);
      const senior = id ? staff?.find((m) => m.id === id) : undefined;
      if (!senior || !isDecider(senior, deciders, onServer))
        return flash("error", t("ws.ship.locked", { code: locked }));
      setLocked(null);
      return flash("ok", t("ws.ship.unlocked", { name: senior.name }));
    }
    if (!vehicle) {
      const plate = parseVehicle(raw);
      if (!plate)
        return flash("error", t("ws.ship.notVehicle", { code: raw }), "ws.ship.notVehicle");
      setVehicle(plate);
      return flash("ok", t("ws.ship.vehicleOk", { v: plate }));
    }
    // Тара на хранении (на полке или невскрытое место приёмки) в машину не
    // едет: по документам уехало бы то, что стоит на складе.
    const code = raw.trim().toUpperCase();
    const stored = [...boxes, ...pallets].find(
      (x) => x.barcode.toUpperCase() === code && (x.address || x.sealed),
    );
    if (stored) return flash("error", t("ws.ship.stored", { code }));
    const res = classifyLoadScan(outbound ?? [], ids, units, raw);
    switch (res.kind) {
      case "not_unit":
        return flash("error", t("ws.ship.notUnit", { code: raw }), "ws.ship.notUnit");
      case "dup":
        setLocked(res.code);
        return flash("error", t("ws.ship.locked", { code: res.code }));
      case "shipped":
        return flash("error", t("ws.ship.unitShipped", { code: res.code }));
      case "foreign": {
        const dest = allRequests.find((r) => res.box.requestIds.includes(r.id))?.note?.trim();
        return flash(
          "error",
          t("ws.ship.foreign", { code: res.code, target: dest || t("ws.ship.noTarget") }),
        );
      }
      case "mixed":
        return flash("error", t("ws.ship.mixed", { code: res.code }));
      case "ok":
        setUnits((u) => [...u, res.code]);
        beepNotes(destinationMark(target).notes);
        signal("ok", { quiet: true });
        return show(
          "ok",
          res.box
            ? t("ws.ship.boxOk", { code: res.code, n: outboundUnits(res.box) })
            : t("ws.ship.unitOk", { code: res.code }),
        );
    }
  };

  const finish = () =>
    void workstationRepository.ship(
      items.map((r) => r.id),
      { vehicle, staffId, units },
    );

  const idle = vehicle ? t("ws.ship.idleUnit") : t("ws.ship.idleVehicle");
  // Что можно «отсканировать» кликом, пока нет сканера под рукой: ровно то,
  // что стол ждёт сейчас — машину или тару для погрузки.
  const demo = vehicle
    ? [
        ...new Set([
          ...missing.map((b) => b.code),
          ...boxes.filter((b) => !b.address && !b.sealed).map((b) => b.barcode),
          ...pallets.filter((p) => !p.address && !p.sealed).map((p) => p.barcode),
        ]),
      ]
        .filter((c) => !units.includes(c))
        .slice(0, 6)
        .map((c) => ({ code: c, hint: t("ws.ship.demoUnit") }))
    : [{ code: vehicleCode("А123ВС77"), hint: t("ws.ship.demoVehicle") }];

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-lg">
          <DestinationChip destination={target} />
        </h3>
        <span className={eyebrow({ tone: "muted" })}>
          {t("ws.ship.count", { n: items.length })}
        </span>
      </div>

      <ScanField
        label={t(vehicle ? "ws.ship.scanUnit" : "ws.ship.scanVehicle")}
        status={banner.tone}
        actionLabel={t("ws.act.accept")}
        onSubmit={onScan}
      />
      <ScanBanner tone={banner.tone}>{banner.tone === "idle" ? idle : banner.text}</ScanBanner>

      {demoHints && demo.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{t("ws.demo.title")}</span> ·{" "}
            {t("ws.demo.hint")}
          </p>
          <ul className="flex flex-wrap gap-2">
            {demo.map(({ code, hint }) => (
              <li key={code}>
                <Button variant="outline" size="sm" onClick={() => onScan(code)} title={hint}>
                  <span className="font-mono">{code}</span>
                  <span className="text-muted-foreground">{hint}</span>
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!vehicle && <VehicleLabel />}

      {vehicle && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-muted-foreground">{t("ship.vehicle")}</span>
          <span className="font-mono text-base font-semibold">{vehicle}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setVehicle("");
              setUnits([]);
            }}
          >
            {t("ws.ship.change")}
          </Button>
        </div>
      )}

      {/* Проверка перед погрузкой: сколько заказано и сколько реально собрано. */}
      <ul className="flex flex-col gap-1 text-sm">
        {items.map((r) => {
          const got = r.pickedQty ?? r.qty;
          return (
            <li key={r.id} className="flex justify-between gap-3">
              <span className="min-w-0 truncate">
                {products.find((p) => p.id === r.productId)?.name ?? "—"}
              </span>
              <span className={cn("tabular-nums", got < r.qty && "font-medium text-destructive")}>
                {got} / {r.qty}
              </span>
            </li>
          );
        })}
      </ul>
      {short > 0 && <p className="text-xs text-destructive">{t("ws.ship.short", { n: short })}</p>}

      {missing.length > 0 && (
        <div className="flex flex-col gap-1">
          <h4 className={eyebrow({ tone: "muted", size: "xs" })}>
            {t("ws.ship.waiting", { n: missing.length })}
          </h4>
          <ul className="flex flex-col gap-1 text-sm">
            {missing.map((b) => (
              <li key={b.id} className="flex justify-between gap-3">
                <span className="font-mono">{b.code}</span>
                <span className="tabular-nums text-muted-foreground">
                  {t("ws.ship.boxUnits", { n: outboundUnits(b) })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {plan.split && <p className="text-sm text-destructive">{t("ws.ship.split")}</p>}
      {expected.length > 0 && missing.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("ws.ship.allLoaded")}</p>
      )}

      {units.length > 0 && (
        <div className="flex flex-col gap-1">
          <h4 className={eyebrow({ tone: "muted", size: "xs" })}>
            {t("ws.ship.loaded", { n: units.length })}
          </h4>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-sm">
            {units.map((u) => {
              const box = openOutbound(outbound ?? [], u);
              return (
                <li key={u}>
                  {u}
                  {box && (
                    <span className="ml-2 font-sans text-muted-foreground">
                      {t("ws.ship.boxUnits", { n: outboundUnits(box) })}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div>
        <Button
          size="lg"
          disabled={!vehicle || units.length === 0 || plan.split || plan.going.length === 0}
          className={cn(
            (short > 0 || missing.length > 0) &&
              "border-0 bg-warning text-white hover:bg-warning/90",
          )}
          onClick={finish}
        >
          <Truck />
          {staying > 0
            ? t("ws.ship.confirmMissing", { n: staying })
            : t(short > 0 ? "ws.ship.confirmShort" : "ws.ship.finish")}
        </Button>
      </div>
    </section>
  );
}

/**
 * Этикетка машины: QR печатается один раз и висит в кабине, дальше машину
 * сканируют, а не вписывают. Принтер ещё не подключён — печать окном браузера.
 */
function VehicleLabel() {
  const t = useT();
  const [plate, setPlate] = useState("");
  const code = plate.trim() ? vehicleCode(plate) : "";
  return (
    <div className="flex flex-col gap-2">
      <h4 className={eyebrow({ tone: "muted", size: "xs" })}>{t("ws.ship.newVehicle")}</h4>
      <div className="flex flex-wrap items-center gap-3">
        <Input
          className="h-9 w-56"
          value={plate}
          placeholder={t("ship.vehiclePlaceholder")}
          onChange={(e) => setPlate(e.target.value)}
        />
        <Button variant="outline" disabled={!code} onClick={() => window.print()}>
          <Printer />
          {t("ws.ship.printVehicle")}
        </Button>
        {code && (
          <div className="flex items-center gap-3">
            <div className="rounded bg-white p-1.5 text-black">
              <QrSvg code={code} size={72} showCode={false} />
            </div>
            <span className="font-mono text-sm">{code}</span>
          </div>
        )}
      </div>
    </div>
  );
}
