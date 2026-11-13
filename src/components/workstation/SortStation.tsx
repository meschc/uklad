import { useEffect, useRef, useState } from "react";
import { Layers, PackageCheck, Printer } from "lucide-react";
import { useEditor } from "@/lib/store";
import { workstationRepository } from "@/lib/data";
import { classifySortScan, parseSortCode, sortPoints, unsorted } from "@/lib/sorting";
import { beepNotes } from "@/lib/beep";
import { holdSignal, signal } from "@/lib/scanSignal";
import { destinationMark } from "@/lib/destinationMark";
import { useLabelPrinter } from "@/lib/labelPrinter";
import { parseBadge } from "@/lib/workstation";
import { isDecider } from "@/lib/docFlow";
import { useCommand } from "@/lib/useCommand";
import { useDeskDeciders } from "@/lib/useDeskDeciders";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { eyebrow } from "@/components/ui/eyebrow";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/fulfillment/ScreenShell";
import { ScanField } from "@/components/fulfillment/ScanField";
import { Modal } from "@/components/fulfillment/Modal";
import { ScanBanner, type BannerTone } from "./ScanBanner";
import { useDemoHints } from "./useDemoHints";
import { DestinationChip } from "./DestinationChip";
import { PrintableLabel } from "./PrintableLabel";

type PrintItem = { code: string; lines: string[] };

/**
 * Станция сортировки (Кирилл 13.11): упакованные посылки и короба поставки
 * раскладывают по местам отгрузки (`UK-SORT-…`, одно место — одна отгрузка в
 * одно направление). Скан посылки — экран крупно показывает направление и
 * место; скан QR места — посылка легла. Отгрузку закрывают здесь же: сколько
 * паллет и коробок получилось, и на каждое место печатается ярлык `UK-OUT-…`.
 * Чужое место — красный, повтор посылки — стоп до бейджа старшего, как на
 * погрузке. Правила — `lib/sorting.ts`, запись — `sort_place` и `sort_close`.
 */
export function SortStation() {
  const t = useT();
  const demoHints = useDemoHints();
  const printer = useLabelPrinter();
  const outbound = useEditor((s) => s.outboundBoxes) ?? [];
  const requests = useEditor((s) => s.requests);
  const staff = useEditor((s) => s.warehouse.staff);
  const deciders = useDeskDeciders();
  const onServer = useEditor((s) => s.session.source === "server");
  const [pending, setPending] = useState<{
    code: string;
    destination: string;
    point: string;
  } | null>(null);
  const [locked, setLocked] = useState<string | null>(null);
  const [closing, setClosing] = useState<string | null>(null);
  const [print, setPrint] = useState<PrintItem[] | null>(null);
  const [banner, setBanner] = useState<{ tone: BannerTone; text: string }>({
    tone: "idle",
    text: "",
  });
  const timer = useRef<number | undefined>(undefined);
  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      holdSignal(null);
    },
    [],
  );
  // Печать — после того, как этикетки отрисовались в скрытом блоке.
  useEffect(() => {
    if (print) window.print();
  }, [print]);

  const show = (tone: "ok" | "warn" | "error", text: string, quiet = false) => {
    window.clearTimeout(timer.current);
    signal(tone, { quiet });
    setBanner({ tone, text });
    if (tone === "ok") {
      timer.current = window.setTimeout(() => setBanner({ tone: "idle", text: "" }), 2200);
    }
  };

  const drop = () => {
    setPending(null);
    holdSignal(null);
  };

  const pointLabel = (code: string, destination: string): PrintItem => ({
    code,
    lines: [destination, t("ws.sort.shipmentN", { n: parseSortCode(code)?.n ?? 1 })],
  });

  const onScan = async (raw: string) => {
    if (locked) {
      const id = parseBadge(raw);
      const senior = id ? staff?.find((m) => m.id === id) : undefined;
      if (!senior || !isDecider(senior, deciders, onServer))
        return show("error", t("ws.sort.locked", { code: locked }));
      setLocked(null);
      return show("ok", t("ws.sort.unlocked", { name: senior.name }));
    }
    const res = classifySortScan(outbound, requests, pending?.code ?? null, raw);
    switch (res.kind) {
      case "unknown":
        return show("error", t("ws.sort.unknown", { code: res.code }));
      case "no_destination":
        return show("error", t("ws.sort.noDestination", { code: res.code }));
      case "dup":
        setLocked(res.code);
        return show("error", t("ws.sort.locked", { code: res.code }));
      case "point_first":
        return show("warn", t("ws.sort.pointFirst"));
      case "parcel_pending":
        return show("warn", t("ws.sort.parcelPending", { code: pending?.code ?? "" }));
      case "wrong_point":
        return show(
          "error",
          res.pointDestination
            ? t("ws.sort.wrongPoint", { point: res.point, target: res.pointDestination })
            : t("ws.sort.wrongPointBlank", { point: res.point }),
        );
      case "point_closed":
        return show("error", t("ws.sort.pointClosed", { point: res.point, next: res.next }));
      case "parcel":
        setPending({ code: res.box.code, destination: res.destination, point: res.point });
        // Направление показано — ждём место: жёлтый держится, пока посылка в руках.
        holdSignal("warn");
        beepNotes(destinationMark(res.destination).notes);
        return show("ok", t("ws.sort.parcelOk", { code: res.box.code }), true);
      case "placed": {
        const done = await workstationRepository.sort(res.box.code, res.point);
        if (!done.ok || !done.data) return show("error", t("ws.sort.failed"));
        drop();
        return show("ok", t("ws.sort.placed", { code: res.box.code, point: res.point }));
      }
    }
  };

  const left = unsorted(outbound, requests);
  const points = sortPoints(outbound, requests).sort(
    (a, b) => (a.destination ?? "").localeCompare(b.destination ?? "") || a.n - b.n,
  );

  if (left.length === 0 && points.length === 0) {
    return (
      <EmptyState
        icon={<Layers className="size-5" />}
        title={t("ws.sort.emptyTitle")}
        body={t("ws.sort.empty")}
      />
    );
  }

  // Подсказки демо: ровно то, что стол ждёт сейчас.
  const demo = pending ? [pending.point] : left.slice(0, 6).map((x) => x.box.code);
  const closingPoint = closing ? points.find((p) => p.code === closing) : undefined;

  return (
    <section className="flex flex-col gap-5">
      {print && <PrintableLabel items={print} printer={printer} />}
      <ScanField
        label={t(pending ? "ws.sort.scanPoint" : "ws.sort.scanParcel")}
        status={banner.tone}
        actionLabel={t("ws.act.accept")}
        onSubmit={(raw) => void onScan(raw)}
      />
      <ScanBanner tone={banner.tone}>
        {banner.tone === "idle"
          ? t(pending ? "ws.sort.idlePoint" : "ws.sort.idleParcel")
          : banner.text}
      </ScanBanner>

      {pending && (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <span className={eyebrow({ tone: "muted" })}>{pending.code}</span>
          <DestinationChip destination={pending.destination} className="px-6 py-3 text-3xl" />
          <p className="font-mono text-lg">{pending.point}</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPrint([pointLabel(pending.point, pending.destination)])}
            >
              <Printer />
              {t("ws.sort.printPoint")}
            </Button>
            <Button variant="ghost" size="sm" onClick={drop}>
              {t("ws.sort.drop")}
            </Button>
          </div>
        </div>
      )}

      {demoHints && demo.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{t("ws.demo.title")}</span> ·{" "}
            {t("ws.demo.hint")}
          </p>
          <ul className="flex flex-wrap gap-2">
            {demo.map((code) => (
              <li key={code}>
                <Button variant="outline" size="sm" onClick={() => void onScan(code)}>
                  <span className="font-mono">{code}</span>
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {points.length > 0 && (
        <div className="flex flex-col gap-2">
          <h4 className={eyebrow({ tone: "muted", size: "xs" })}>{t("ws.sort.points")}</h4>
          <ul className="flex flex-col gap-3 text-sm">
            {points.map((p) => (
              <li key={p.code} className="flex flex-wrap items-center justify-between gap-3">
                <span className="flex min-w-0 flex-wrap items-center gap-3">
                  {p.destination && <DestinationChip destination={p.destination} />}
                  <span className="font-mono">{p.code}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {p.places.length > 0
                      ? t("ws.sort.closedCount", { n: p.parcels, places: p.places.length })
                      : t("ws.sort.count", { n: p.parcels })}
                  </span>
                </span>
                {p.places.length > 0 ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPrint(placeLabels(p.places, p.destination ?? "", t))}
                  >
                    <Printer />
                    {t("ws.sort.printPlaces")}
                  </Button>
                ) : (
                  <span className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setPrint([pointLabel(p.code, p.destination ?? "")])}
                    >
                      <Printer />
                      {t("ws.sort.printPoint")}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setClosing(p.code)}>
                      <PackageCheck />
                      {t("ws.sort.close")}
                    </Button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {left.length > 0 && (
        <div className="flex flex-col gap-2">
          <h4 className={eyebrow({ tone: "muted", size: "xs" })}>
            {t("ws.sort.left", { n: left.length })}
          </h4>
          <ul className="flex flex-col gap-1 text-sm">
            {left.map(({ box, destination }) => (
              <li key={box.id} className="flex items-center justify-between gap-3">
                <span className="font-mono">{box.code}</span>
                <span className="truncate text-muted-foreground">{destination}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {closingPoint && (
        <ClosePoint
          code={closingPoint.code}
          destination={closingPoint.destination ?? ""}
          parcels={closingPoint.parcels}
          onClose={() => setClosing(null)}
          onDone={(places) => {
            setClosing(null);
            setPrint(placeLabels(places, closingPoint.destination ?? "", t));
            show("ok", t("ws.sort.closed", { point: closingPoint.code, n: places.length }));
          }}
        />
      )}
    </section>
  );
}

/** Ярлыки грузовых мест: направление, вид места и «место i из n». */
function placeLabels(
  places: readonly { code: string; place?: "pallet" | "box" }[],
  destination: string,
  t: ReturnType<typeof useT>,
): PrintItem[] {
  return places.map((p, i) => ({
    code: p.code,
    lines: [
      destination,
      t(p.place === "pallet" ? "ws.sort.placePallet" : "ws.sort.placeBox", {
        i: i + 1,
        n: places.length,
      }),
    ],
  }));
}

/**
 * Закрыть отгрузку: сколько получилось паллет и коробок. Это меняет учёт
 * погрузки — подтверждение в панели справа (класс `confirm`).
 */
function ClosePoint({
  code,
  destination,
  parcels,
  onClose,
  onDone,
}: {
  code: string;
  destination: string;
  parcels: number;
  onClose: () => void;
  onDone: (places: { code: string; place?: "pallet" | "box" }[]) => void;
}) {
  const t = useT();
  const close = useCommand(workstationRepository.sortClose);
  const [pallets, setPallets] = useState("1");
  const [boxes, setBoxes] = useState("0");
  const p = Math.max(0, Math.floor(Number(pallets) || 0));
  const b = Math.max(0, Math.floor(Number(boxes) || 0));
  return (
    <Modal
      title={t("ws.sort.closeTitle", { point: code })}
      icon={<PackageCheck className="size-4 text-muted-foreground" />}
      submitLabel={t("ws.sort.closeSubmit", { n: p + b })}
      disabled={p + b === 0 || p + b > 200}
      pending={close.pending}
      error={close.error}
      onClose={onClose}
      onSubmit={async () => {
        const res = await close.run(code, p, b);
        if (res.ok) onDone(res.data);
      }}
    >
      <DestinationChip destination={destination} className="self-start" />
      <p className="text-sm">{t("ws.sort.closeBody", { n: parcels })}</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sort-pallets">{t("ws.sort.pallets")}</Label>
          <Input
            id="sort-pallets"
            inputMode="numeric"
            maxLength={3}
            value={pallets}
            onChange={(e) => setPallets(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sort-boxes">{t("ws.sort.boxes")}</Label>
          <Input
            id="sort-boxes"
            inputMode="numeric"
            maxLength={3}
            value={boxes}
            onChange={(e) => setBoxes(e.target.value)}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{t("ws.sort.closeHint")}</p>
    </Modal>
  );
}
