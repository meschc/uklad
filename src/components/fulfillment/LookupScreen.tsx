import { useState } from "react";
import {
  Boxes,
  Grid3x3,
  Layers,
  MapPin,
  Package,
  ScanSearch,
  SearchX,
} from "lucide-react";
import { useEditor } from "@/lib/store";
import { cm, formatAddress } from "@/lib/address";
import { lookup, type LookupLine, type LookupResult } from "@/lib/lookup";
import { catLabel, useT, type TFunc } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { ScanField, type ScanStatus } from "./ScanField";
import { ScreenShell, EmptyState } from "./ScreenShell";

/**
 * «Что это?» — справка по любому коду склада (п.4).
 *
 * Кладовщик держит в руках коробку, паллету или товар и хочет знать про них
 * всё: что внутри, где стоит, сколько единиц. Отдельного экрана для каждого
 * вопроса не нужно — нужен один, который сам понимает, чем в него выстрелили:
 * товар → карточка и все места хранения, тара → содержимое, паллета → её тара,
 * ячейка → что в ней лежит.
 *
 * Разбор кода живёт в `lib/lookup.ts` — экран только показывает результат.
 */
export function LookupScreen() {
  const t = useT();
  const warehouse = useEditor((s) => s.warehouse);
  const products = useEditor((s) => s.products);
  const boxes = useEditor((s) => s.boxes);
  const pallets = useEditor((s) => s.pallets);
  const placements = useEditor((s) => s.placements);
  const [result, setResult] = useState<LookupResult | null>(null);

  const onScan = (code: string) => {
    setResult(
      lookup(code, {
        warehouse,
        products,
        boxes,
        pallets,
        placements,
        format: (addr) => formatAddress(warehouse, addr),
      }),
    );
  };

  const status: ScanStatus =
    result === null ? "idle" : result.kind === "none" ? "error" : "ok";

  return (
    <ScreenShell title={t("lookup.title")} subtitle={t("lookup.subtitle")} wide>
      <ScanField
        label={t("lookup.scan")}
        hint={t("lookup.hint")}
        placeholder={t("lookup.placeholder")}
        status={status}
        onSubmit={onScan}
      />

      {result === null ? (
        <EmptyState
          icon={<ScanSearch className="size-5" />}
          title={t("lookup.emptyTitle")}
          body={t("lookup.emptyBody")}
        />
      ) : (
        <ResultCard result={result} t={t} />
      )}
    </ScreenShell>
  );
}

function ResultCard({ result, t }: { result: LookupResult; t: TFunc }) {
  switch (result.kind) {
    case "product":
      return <ProductResult result={result} t={t} />;
    case "box":
      return <BoxResult result={result} t={t} />;
    case "pallet":
      return <PalletResult result={result} t={t} />;
    case "cell":
      return <CellResult result={result} t={t} />;
    case "none":
      return (
        <EmptyState
          icon={<SearchX className="size-5" />}
          title={t("lookup.noneTitle", { code: result.code })}
          body={t("lookup.noneBody")}
        />
      );
  }
}

// --- товар --------------------------------------------------------------------

function ProductResult({
  result,
  t,
}: {
  result: Extract<LookupResult, { kind: "product" }>;
  t: TFunc;
}) {
  const { product: p, places, total } = result;
  const partners = useEditor((s) => s.warehouse.partners);
  const setSearch = useEditor((s) => s.setSearch);
  const setMode = useEditor((s) => s.setMode);
  const goToView = useEditor((s) => s.goToView);
  const partner = partners?.find((x) => x.id === p.partnerId);

  return (
    <Card
      icon={<Package className="size-4" />}
      kind={t("lookup.kind.product")}
      title={p.name}
      code={p.barcode}
      action={
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            // Из справки — в номенклатуру с уже набранным артикулом: дальше
            // человеку обычно нужна именно карточка товара.
            setSearch(p.sku);
            setMode("table");
            goToView("editor");
          }}
        >
          {t("lookup.openInTable")}
        </Button>
      }
    >
      <Facts
        items={[
          { label: t("table.col.sku"), value: p.sku, mono: true },
          { label: t("table.col.category"), value: catLabel(t, p.category) },
          { label: t("table.col.partner"), value: partner?.name ?? "—" },
          {
            label: t("table.col.dims"),
            value: `${cm(p.widthCm)} × ${cm(p.heightCm)} × ${cm(p.depthCm)}`,
          },
          {
            label: t("table.col.weight"),
            value: p.weightKg != null ? `${cm(p.weightKg)} ${t("unit.kg")}` : "—",
          },
          { label: t("lookup.total"), value: String(total), strong: true },
        ]}
      />

      <SubTitle>{t("lookup.places", { n: places.length })}</SubTitle>
      {places.length === 0 ? (
        <Note>{t("lookup.noPlaces")}</Note>
      ) : (
        <Rows>
          {places.map((place, i) => (
            <Row
              key={`${place.label ?? "?"}-${place.boxBarcode ?? ""}-${i}`}
              left={<Addr label={place.label} placed t={t} />}
              middle={
                place.boxBarcode ? (
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {place.boxBarcode}
                  </span>
                ) : (
                  <span className="text-[11px] text-muted-foreground">
                    {t("lookup.direct")}
                  </span>
                )
              }
              right={place.qty}
            />
          ))}
        </Rows>
      )}
    </Card>
  );
}

// --- тара ---------------------------------------------------------------------

function BoxResult({
  result,
  t,
}: {
  result: Extract<LookupResult, { kind: "box" }>;
  t: TFunc;
}) {
  const { box, pallet, label, placed, lines, total } = result;
  return (
    <Card
      icon={<Boxes className="size-4" />}
      kind={t("lookup.kind.box")}
      title={t("lookup.boxTitle")}
      code={box.barcode}
    >
      <Facts
        items={[
          { label: t("lookup.where"), value: whereText(label, placed, t) },
          { label: t("lookup.onPallet"), value: pallet?.barcode ?? "—", mono: true },
          {
            label: t("lookup.created"),
            value: new Date(box.createdAt).toLocaleString(),
          },
          { label: t("lookup.total"), value: String(total), strong: true },
        ]}
      />
      <SubTitle>{t("lookup.contents", { n: lines.length })}</SubTitle>
      <LineRows lines={lines} empty={t("lookup.emptyBox")} t={t} />
    </Card>
  );
}

// --- паллета ------------------------------------------------------------------

function PalletResult({
  result,
  t,
}: {
  result: Extract<LookupResult, { kind: "pallet" }>;
  t: TFunc;
}) {
  const { pallet, label, placed, boxes, total } = result;
  return (
    <Card
      icon={<Layers className="size-4" />}
      kind={t("lookup.kind.pallet")}
      title={t("lookup.palletTitle")}
      code={pallet.barcode}
    >
      <Facts
        items={[
          { label: t("lookup.where"), value: whereText(label, placed, t) },
          { label: t("lookup.boxCount"), value: String(boxes.length) },
          { label: t("lookup.total"), value: String(total), strong: true },
        ]}
      />
      <SubTitle>{t("lookup.boxes")}</SubTitle>
      {boxes.length === 0 ? (
        <Note>{t("lookup.emptyPallet")}</Note>
      ) : (
        <Rows>
          {boxes.map(({ box, label: addr, placed: on, total: n }) => (
            <Row
              key={box.id}
              left={
                <span className="font-mono text-xs">{box.barcode}</span>
              }
              middle={<Addr label={addr} placed={on} t={t} />}
              right={n}
            />
          ))}
        </Rows>
      )}
    </Card>
  );
}

// --- ячейка -------------------------------------------------------------------

function CellResult({
  result,
  t,
}: {
  result: Extract<LookupResult, { kind: "cell" }>;
  t: TFunc;
}) {
  const { label, dims, lines, total } = result;
  return (
    <Card
      icon={<Grid3x3 className="size-4" />}
      kind={t("lookup.kind.cell")}
      title={t("lookup.cellTitle")}
      code={label ?? "—"}
    >
      <Facts
        items={[
          {
            label: t("lookup.cellDims"),
            value: dims
              ? `${cm(dims.widthCm)} × ${cm(dims.heightCm)} × ${cm(dims.depthCm)}`
              : "—",
          },
          { label: t("lookup.total"), value: String(total), strong: true },
        ]}
      />
      <SubTitle>{t("lookup.contents", { n: lines.length })}</SubTitle>
      <LineRows lines={lines} empty={t("lookup.emptyCell")} t={t} />
    </Card>
  );
}

// --- общие кусочки ------------------------------------------------------------

function Card({
  icon,
  kind,
  title,
  code,
  action,
  children,
}: {
  icon: React.ReactNode;
  kind: string;
  title: string;
  code: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex animate-pop flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <header className="flex flex-wrap items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {kind}
          </p>
          <p className="truncate text-sm font-semibold">{title}</p>
        </div>
        <span className="shrink-0 rounded bg-muted px-2 py-1 font-mono text-xs">
          {code}
        </span>
        {action}
      </header>
      {children}
    </section>
  );
}

function Facts({
  items,
}: {
  items: { label: string; value: string; mono?: boolean; strong?: boolean }[];
}) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
      {items.map((it) => (
        <div key={it.label}>
          <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {it.label}
          </dt>
          <dd
            className={[
              "text-sm",
              it.mono ? "font-mono text-xs" : "",
              it.strong ? "font-semibold tabular-nums" : "",
            ].join(" ")}
          >
            {it.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function SubTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </p>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted-foreground">{children}</p>;
}

function Rows({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      {children}
    </div>
  );
}

function Row({
  left,
  middle,
  right,
}: {
  left: React.ReactNode;
  middle?: React.ReactNode;
  right: number;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-border/60 px-3 py-2 last:border-0">
      <div className="min-w-0 flex-1 truncate text-sm">{left}</div>
      <div className="shrink-0">{middle}</div>
      <div className="w-12 shrink-0 text-right text-sm font-medium tabular-nums">
        {right}
      </div>
    </div>
  );
}

/** Список «товар — артикул — количество»: одинаков для тары и ячейки. */
function LineRows({
  lines,
  empty,
  t,
}: {
  lines: LookupLine[];
  empty: string;
  t: TFunc;
}) {
  if (!lines.length) return <Note>{empty}</Note>;
  return (
    <Rows>
      {lines.map((l, i) => (
        <Row
          key={`${l.product.id}-${l.boxBarcode ?? ""}-${i}`}
          left={l.product.name}
          middle={
            <span className="font-mono text-[11px] text-muted-foreground">
              {l.boxBarcode ? `${l.product.sku} · ${l.boxBarcode}` : l.product.sku}
            </span>
          }
          right={l.qty}
        />
      ))}
      <div className="flex items-center justify-between px-3 py-2 text-xs text-muted-foreground">
        <span>{t("lookup.total")}</span>
        <span className="font-semibold tabular-nums text-foreground">
          {lines.reduce((s, l) => s + l.qty, 0)}
        </span>
      </div>
    </Rows>
  );
}

/**
 * Строка «где стоит». Пустой адрес и УСТАРЕВШИЙ адрес — разные вещи: во втором
 * случае тару когда-то поставили в ячейку, которой на плане больше нет, и это
 * надо увидеть, а не принять за «ещё не размещали».
 */
function whereText(label: string | null, placed: boolean, t: TFunc): string {
  if (label) return label;
  return placed ? t("lookup.staleAddr") : t("lookup.notPlaced");
}

/** Адрес ячейки чипом — тем же, что в таблице и на ярлыках. */
function Addr({
  label,
  placed,
  t,
}: {
  label: string | null;
  placed: boolean;
  t: TFunc;
}) {
  if (!label) {
    return (
      <span
        className={
          placed
            ? "text-[11px] text-amber-600 dark:text-amber-400"
            : "text-[11px] text-muted-foreground"
        }
      >
        {placed ? t("lookup.staleAddr") : t("lookup.notPlaced")}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 font-mono text-xs font-medium text-primary">
      <MapPin className="size-3" />
      {label}
    </span>
  );
}
