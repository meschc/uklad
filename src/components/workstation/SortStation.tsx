import { useEffect, useRef, useState } from "react";
import { Layers } from "lucide-react";
import { useEditor } from "@/lib/store";
import { workstationRepository } from "@/lib/data";
import { classifySortScan, sortPallets, unsorted } from "@/lib/sorting";
import { beepNotes } from "@/lib/beep";
import { holdSignal, signal } from "@/lib/scanSignal";
import { destinationMark } from "@/lib/destinationMark";
import { parseBadge } from "@/lib/workstation";
import { isDecider } from "@/lib/docFlow";
import { useDeskDeciders } from "@/lib/useDeskDeciders";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { eyebrow } from "@/components/ui/eyebrow";
import { EmptyState } from "@/components/fulfillment/ScreenShell";
import { ScanField } from "@/components/fulfillment/ScanField";
import { ScanBanner, type BannerTone } from "./ScanBanner";
import { useDemoHints } from "./useDemoHints";
import { DestinationChip } from "./DestinationChip";

/**
 * Станция сортировки (Кирилл 12.11, «отдельная станция»): упакованные посылки
 * раскладывают по паллетам складов площадки. Скан посылки — экран крупно
 * показывает назначение своим цветом и звуком; скан паллеты — посылка легла.
 * Паллета берёт назначение первой посылки. Чужая паллета — красный, повтор
 * посылки — стоп до бейджа старшего, как на погрузке. Правила —
 * `lib/sorting.ts`, запись — операция `sort_place`.
 */
export function SortStation() {
  const t = useT();
  const demoHints = useDemoHints();
  const outbound = useEditor((s) => s.outboundBoxes) ?? [];
  const requests = useEditor((s) => s.requests);
  const staff = useEditor((s) => s.warehouse.staff);
  const deciders = useDeskDeciders();
  const onServer = useEditor((s) => s.session.source === "server");
  const [pending, setPending] = useState<{ code: string; destination: string } | null>(null);
  const [locked, setLocked] = useState<string | null>(null);
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
        return show("error", t("ws.sort.locked", { code: res.code, pallet: res.pallet }));
      case "pallet_first":
        return show("warn", t("ws.sort.palletFirst"));
      case "parcel_pending":
        return show("warn", t("ws.sort.parcelPending", { code: pending?.code ?? "" }));
      case "wrong_pallet":
        return show(
          "error",
          t("ws.sort.wrongPallet", { pallet: res.pallet, target: res.palletDestination }),
        );
      case "parcel":
        setPending({ code: res.box.code, destination: res.destination });
        // Назначение показано — ждём паллету: рамка жёлтая, пока посылка в руках.
        holdSignal("warn");
        beepNotes(destinationMark(res.destination).notes);
        return show("ok", t("ws.sort.parcelOk", { code: res.box.code }), true);
      case "placed": {
        const done = await workstationRepository.sort(res.box.code, res.pallet);
        if (!done.ok || !done.data) return show("error", t("ws.sort.failed"));
        drop();
        return show("ok", t("ws.sort.placed", { code: res.box.code, pallet: res.pallet }));
      }
    }
  };

  const left = unsorted(outbound, requests);
  const pallets = sortPallets(outbound, requests);

  if (left.length === 0 && pallets.length === 0) {
    return (
      <EmptyState
        icon={<Layers className="size-5" />}
        title={t("ws.sort.emptyTitle")}
        body={t("ws.sort.empty")}
      />
    );
  }

  // Подсказки демо: ровно то, что стол ждёт сейчас.
  const demo = pending
    ? [
        ...pallets.filter((p) => p.destination === pending.destination).map((p) => p.pallet),
        `UK-PLT-S${pallets.length + 1}`,
      ]
    : left.slice(0, 6).map((x) => x.box.code);

  return (
    <section className="flex flex-col gap-5">
      <ScanField
        label={t(pending ? "ws.sort.scanPallet" : "ws.sort.scanParcel")}
        status={banner.tone}
        actionLabel={t("ws.act.accept")}
        onSubmit={(raw) => void onScan(raw)}
      />
      <ScanBanner tone={banner.tone}>
        {banner.tone === "idle"
          ? t(pending ? "ws.sort.idlePallet" : "ws.sort.idleParcel")
          : banner.text}
      </ScanBanner>

      {pending && (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <span className={eyebrow({ tone: "muted" })}>{pending.code}</span>
          <DestinationChip destination={pending.destination} className="px-6 py-3 text-3xl" />
          <Button variant="ghost" size="sm" onClick={drop}>
            {t("ws.sort.drop")}
          </Button>
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

      {pallets.length > 0 && (
        <div className="flex flex-col gap-2">
          <h4 className={eyebrow({ tone: "muted", size: "xs" })}>{t("ws.sort.pallets")}</h4>
          <ul className="flex flex-col gap-2 text-sm">
            {pallets.map((p) => (
              <li key={p.pallet} className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-3">
                  <span className="font-mono">{p.pallet}</span>
                  {p.destination && <DestinationChip destination={p.destination} />}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {t("ws.sort.count", { n: p.count })}
                </span>
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
    </section>
  );
}
