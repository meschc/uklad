import { useEffect, useMemo, useRef, useState } from "react";
import {
  Maximize,
  Minus,
  MousePointerClick,
  Plus,
  Search,
  X,
} from "lucide-react";
import { fieldValueKey, resolveFloor, useEditor } from "@/lib/store";
import { cellDimsCm, cm, formatAddress } from "@/lib/address";
import { CATEGORY_COLOR, buildScene } from "@/lib/scene3d";
import type { CategoryField, Floor } from "@/lib/types";
import { catLabel, useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Engine } from "./engine";

/**
 * Экран 3D-визуализации (ТЗ, разд. 3.7): фиксированная изометрия, зум колесом,
 * без свободного вращения. Клик по товару открывает сайдбар справа.
 */
export function View3D() {
  const warehouse = useEditor((s) => s.warehouse);
  const placements = useEditor((s) => s.placements);
  const products = useEditor((s) => s.products);

  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [density, setDensity] = useState({ shown: 0, total: 0 });
  // Какие этажи показываем в 3D: все сразу (стопкой) или один выбранный.
  const [floorFilter, setFloorFilter] = useState<string>("all");
  const dark = useIsDark();
  const t = useT();

  // Если выбранный этаж удалили — возвращаемся к «все».
  const filterValid =
    floorFilter === "all" ||
    warehouse.floors.some((f) => f.id === floorFilter);
  const effFilter = filterValid ? floorFilter : "all";

  // Сцену строим из отфильтрованного склада: один этаж рендерится у земли,
  // «все» — стопкой по высоте. Связанные этажи (алиасы) показывают раскладку
  // источника. Адреса в сайдбаре берутся из полного склада.
  const sceneWarehouse = useMemo(
    () => ({
      ...warehouse,
      floors: warehouse.floors
        .filter((f) => effFilter === "all" || f.id === effFilter)
        .map((f) => resolveFloor(warehouse, f)),
    }),
    [warehouse, effFilter],
  );

  const data = useMemo(
    () =>
      buildScene(sceneWarehouse, placements, products, {
        rowLabel: (n) => t("canvas.rowFrame", { n }),
      }),
    [sceneWarehouse, placements, products, t],
  );

  // Переключили набор этажей — заново вписываем сцену в кадр.
  useEffect(() => {
    engineRef.current?.fit();
  }, [effFilter]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const engine = new Engine(host, {
      onDensity: (shown, total) => setDensity({ shown, total }),
    });
    engineRef.current = engine;
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    engineRef.current?.build(data);
  }, [data]);

  useEffect(() => {
    engineRef.current?.setTheme(dark);
  }, [dark]);

  // После пересборки сцены подсветку надо навести заново — отсюда data в зависимостях.
  useEffect(() => {
    engineRef.current?.setSelected(pickedId);
  }, [pickedId, data]);

  // Колесо слушаем нативно: React вешает passive-обработчик, а нам нужен preventDefault.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      engineRef.current?.zoomAt(
        e.clientX,
        e.clientY,
        Math.pow(1.0015, -e.deltaY),
      );
    };
    host.addEventListener("wheel", onWheel, { passive: false });
    return () => host.removeEventListener("wheel", onWheel);
  }, []);

  // Тянем — панорама; отпустили почти без движения — считаем кликом.
  const drag = useRef<{
    x: number;
    y: number;
    moved: number;
    rotate: boolean;
  } | null>(null);

  const pickedProduct = pickedId
    ? products.find((p) => p.id === pickedId)
    : undefined;
  const pickedBox = pickedId
    ? data.cells.find((p) => p.productId === pickedId)
    : undefined;
  // Товар мог уехать с полки, пока сайдбар открыт.
  const showSidebar = !!pickedProduct && !!pickedBox;

  return (
    <div className="relative flex min-h-0 flex-1">
      <div className="relative min-w-0 flex-1 bg-gradient-to-b from-muted/40 to-background">
        <div
          ref={hostRef}
          className="absolute inset-0 cursor-grab active:cursor-grabbing"
          onContextMenu={(e) => e.preventDefault()}
          onPointerDown={(e) => {
            try {
              (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            } catch {
              /* указатель мог не поддерживать capture — перетаскивание важнее */
            }
            // Правая кнопка — поворот вокруг вертикали, левая — панорама.
            drag.current = {
              x: e.clientX,
              y: e.clientY,
              moved: 0,
              rotate: e.button === 2,
            };
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d) return;
            const dx = e.clientX - d.x;
            const dy = e.clientY - d.y;
            d.x = e.clientX;
            d.y = e.clientY;
            d.moved += Math.abs(dx) + Math.abs(dy);
            if (d.rotate) engineRef.current?.rotateBy(dx);
            else engineRef.current?.panBy(dx, dy);
          }}
          onPointerUp={(e) => {
            const d = drag.current;
            drag.current = null;
            if (!d || d.rotate || d.moved >= 4) return;
            const hit = engineRef.current?.pick(e.clientX, e.clientY) ?? null;
            setPickedId(hit?.productId ?? null);
          }}
          onPointerLeave={() => {
            drag.current = null;
          }}
        />

        <SearchFrom3D />

        <FloorSelect
          floors={warehouse.floors}
          value={effFilter}
          onChange={setFloorFilter}
        />

        <Hint density={density} />
        <Controls engineRef={engineRef} />
      </div>

      {showSidebar && (
        <Sidebar
          productId={pickedId!}
          onClose={() => setPickedId(null)}
        />
      )}
    </div>
  );
}

/** Поиск из 3D — результат всегда в таблице (ТЗ, разд. 3.6). */
function SearchFrom3D() {
  const searchInTable = useEditor((s) => s.searchInTable);
  const [q, setQ] = useState("");
  const t = useT();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        searchInTable(q);
      }}
      className="absolute left-3 top-3 flex items-center gap-1.5"
    >
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 z-10 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("view3d.searchPlaceholder")}
          className="h-8 w-56 bg-card/90 pl-8 backdrop-blur"
        />
      </div>
      <Button type="submit" size="sm" variant="secondary" disabled={!q.trim()}>
        {t("view3d.showInTable")}
      </Button>
    </form>
  );
}

/**
 * Выбор этажей в 3D (ТЗ, разд. 3.7): «Все» — стопкой по высоте, либо один
 * этаж отдельно. Показываем только когда этажей больше одного.
 */
function FloorSelect({
  floors,
  value,
  onChange,
}: {
  floors: Floor[];
  value: string;
  onChange: (v: string) => void;
}) {
  const t = useT();
  if (floors.length < 2) return null;

  const opt = (v: string, label: string) => (
    <button
      key={v}
      type="button"
      onClick={() => onChange(v)}
      className={cn(
        "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
        value === v
          ? "bg-accent text-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-0.5 rounded-lg border border-border bg-card/90 p-0.5 shadow-md backdrop-blur">
      {opt("all", t("view3d.allFloors"))}
      <div className="mx-0.5 h-4 w-px bg-border" />
      {floors.map((f, i) => opt(f.id, String(i + 1)))}
    </div>
  );
}

function Hint({ density }: { density: { shown: number; total: number } }) {
  const culled = density.total > density.shown;
  const t = useT();
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 mx-auto flex w-fit flex-col items-center gap-1">
      <div className="rounded-lg border border-border bg-card/90 px-3 py-1.5 text-[11px] text-muted-foreground backdrop-blur">
        <span className="inline-flex items-center gap-1.5">
          <MousePointerClick className="size-3" />
          {t("view3d.hint")}
        </span>
      </div>
      {culled && (
        <div className="hazard-stripes rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[10px] font-medium text-amber-800 dark:text-amber-300">
          {t("view3d.density", { shown: density.shown, total: density.total })}
        </div>
      )}
    </div>
  );
}

function Controls({
  engineRef,
}: {
  engineRef: React.MutableRefObject<Engine | null>;
}) {
  const t = useT();
  return (
    <div className="absolute right-3 bottom-3 flex items-center gap-0.5 rounded-lg border border-border bg-card/90 p-0.5 backdrop-blur">
      <Button
        variant="ghost"
        size="icon-sm"
        title={t("zoom.out")}
        onClick={() => engineRef.current?.zoomBy(1 / 1.2)}
      >
        <Minus className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        title={t("zoom.in")}
        onClick={() => engineRef.current?.zoomBy(1.2)}
      >
        <Plus className="size-4" />
      </Button>
      <div className="mx-0.5 h-4 w-px bg-border" />
      <Button
        variant="ghost"
        size="icon-sm"
        title={t("zoom.fit")}
        onClick={() => engineRef.current?.fit()}
      >
        <Maximize className="size-4" />
      </Button>
    </div>
  );
}

/** Карточка товара — сайдбар справа, в духе Figma (ТЗ, разд. 3.7). */
function Sidebar({
  productId,
  onClose,
}: {
  productId: string;
  onClose: () => void;
}) {
  const warehouse = useEditor((s) => s.warehouse);
  const products = useEditor((s) => s.products);
  const placements = useEditor((s) => s.placements);
  const categoryFields = useEditor((s) => s.categoryFields);
  const setMode = useEditor((s) => s.setMode);
  const t = useT();

  const product = products.find((p) => p.id === productId);
  const addr = placements[productId];
  if (!product || !addr) return null;

  const fields = categoryFields.filter((f) => f.category === product.category);

  const place = formatAddress(warehouse, addr);
  const floor = warehouse.floors.find((f) => f.id === addr.floorId);
  const mod = floor?.modules.find((m) => m.id === addr.moduleId);
  const dims = mod ? cellDimsCm(mod, addr.shelfIndex) : null;
  const color = `#${CATEGORY_COLOR[product.category].toString(16).padStart(6, "0")}`;

  return (
    <aside className="absolute inset-y-3 right-3 z-10 flex w-64 flex-col overflow-hidden rounded-xl border border-border bg-card/95 shadow-lg backdrop-blur">
      <div className="flex items-start justify-between gap-2 border-b border-border px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t("view3d.product")}
          </p>
          <p className="truncate text-sm font-semibold">{product.name}</p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-3">
        <div
          className="mb-3 h-20 w-full rounded-md border border-black/10"
          style={{ background: `linear-gradient(135deg, ${color}55, ${color})` }}
        />

        <Field label={t("view3d.place")}>
          {place ? (
            <span className="rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 font-mono text-xs font-medium text-primary">
              {place}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </Field>
        <Field label={t("view3d.sku")}>
          <span className="font-mono text-xs">{product.sku}</span>
        </Field>
        <Field label={t("view3d.barcode")}>
          <span className="font-mono text-xs">{product.barcode}</span>
        </Field>
        <Field label={t("view3d.category")}>
          <span className="inline-flex items-center gap-1.5 text-xs">
            <span
              className="size-2.5 rounded-sm"
              style={{ background: color }}
            />
            {catLabel(t, product.category)}
          </span>
        </Field>
        <Field label={t("view3d.dimsWHD")}>
          <span className="tabular-nums text-xs">
            {cm(product.widthCm)} × {cm(product.heightCm)} ×{" "}
            {cm(product.depthCm)} {t("unit.cm")}
          </span>
        </Field>
        <Field label={t("view3d.weight")}>
          <span className="tabular-nums text-xs">
            {product.weightKg != null
              ? `${cm(product.weightKg)} ${t("unit.kg")}`
              : "—"}
          </span>
        </Field>
        {dims && (
          <Field label={t("view3d.cell")}>
            <span className="tabular-nums text-xs text-muted-foreground">
              {cm(dims.widthCm)} × {cm(dims.heightCm)} × {cm(dims.depthCm)}{" "}
              {t("unit.cm")}
            </span>
          </Field>
        )}

        {/* Доп.поля категории (ТЗ, разд. 2.5, 3.8) — редактируемые */}
        {fields.length > 0 && (
          <div className="mt-3 border-t border-border pt-2">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t("view3d.categoryFields")}
            </p>
            {fields.map((f) => (
              <CustomFieldInput key={f.id} productId={productId} field={f} />
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-border p-3">
        <Button
          size="sm"
          variant="outline"
          className="w-full"
          onClick={() => setMode("table")}
        >
          {t("view3d.openInTable")}
        </Button>
      </div>
    </aside>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex items-baseline justify-between gap-2 py-1.5")}>
      <span className="shrink-0 text-[11px] text-muted-foreground">
        {label}
      </span>
      <span className="min-w-0 text-right">{children}</span>
    </div>
  );
}

/** Ввод значения доп.поля товара (текст / число / список). */
function CustomFieldInput({
  productId,
  field,
}: {
  productId: string;
  field: CategoryField;
}) {
  const value = useEditor(
    (s) => s.fieldValues[fieldValueKey(productId, field.id)] ?? "",
  );
  const setFieldValue = useEditor((s) => s.setFieldValue);
  const onChange = (v: string) => setFieldValue(productId, field.id, v);
  const ctrl =
    "h-7 w-full rounded-md border border-input bg-background px-2 text-xs";

  return (
    <label className="flex flex-col gap-1 py-1">
      <span className="text-[11px] text-muted-foreground">{field.name}</span>
      {field.type === "select" ? (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={ctrl}
        >
          <option value="">—</option>
          {field.options?.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={field.type === "number" ? "number" : "text"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="—"
          className={ctrl}
        />
      )}
    </label>
  );
}

/** Тема переключается классом на <html> — следим за ним. */
function useIsDark() {
  const [dark, setDark] = useState(() =>
    document.documentElement.classList.contains("dark"),
  );
  useEffect(() => {
    const el = document.documentElement;
    const obs = new MutationObserver(() =>
      setDark(el.classList.contains("dark")),
    );
    obs.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return dark;
}
