import { useState } from "react";
import {
  ArrowRight,
  Building2,
  Info,
  MapPin,
  Moon,
  Pencil,
  Plus,
  Settings,
  Sun,
  User,
} from "lucide-react";
import { selectRole, useEditor } from "@/lib/store";
import { allCells } from "@/lib/placement";
import { addressKey } from "@/lib/address";
import { planBounds } from "@/lib/planGeometry";
import type { Box, CellAddress, ModuleType, Warehouse } from "@/lib/types";
import { useT, type TFunc } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { card } from "@/components/ui/card";
import { RoleSwitch } from "@/components/nav/RoleSwitch";
import { WarehouseDialog } from "./WarehouseDialog";

/** Что открыто в диалоге: создание или правка конкретного склада. */
type DialogState = { mode: "new" } | { mode: "edit"; warehouse: Warehouse } | null;

/**
 * Заполненность одного склада: этажи, ячейки, занято, процент.
 *
 * Считаем ОБА пути попадания товара на место — прямое размещение и коробку
 * приёмки, стоящую на полке. Иначе карточка склада показывала бы одно, а
 * тепловая карта и дашборд — другое (см. п. 2.1 плана фулфилмента).
 */
function warehouseStats(w: Warehouse, placements: Record<string, CellAddress>, boxes: Box[]) {
  const floorIds = new Set(w.floors.map((f) => f.id));
  const cells = allCells(w).length;
  const keys = new Set<string>();
  for (const a of Object.values(placements)) {
    if (floorIds.has(a.floorId)) keys.add(addressKey(a));
  }
  for (const b of boxes) {
    if (b.address && b.lines.length && floorIds.has(b.address.floorId)) {
      keys.add(addressKey(b.address));
    }
  }
  const occupied = keys.size;
  const fill = cells ? Math.round((occupied / cells) * 100) : 0;
  return { floors: w.floors.length, cells, occupied, fill };
}

/**
 * Личный кабинет (ТЗ, разд. 3.2): данные пользователя/компании, статистика
 * заполненности, список складов «в стиле проектов Figma», ссылка на профиль.
 */
export function Dashboard() {
  const account = useEditor((s) => s.account);
  const theme = useEditor((s) => s.profile.theme);
  const updateProfile = useEditor((s) => s.updateProfile);
  const goToProfile = useEditor((s) => s.goToProfile);
  const openWarehouse = useEditor((s) => s.openWarehouse);
  const goToView = useEditor((s) => s.goToView);
  const allWarehouses = useEditor((s) => s.allWarehouses);
  const activeId = useEditor((s) => s.warehouse.id);
  const placements = useEditor((s) => s.placements);
  const boxes = useEditor((s) => s.boxes);
  // Склады заводит и правит владелец склада, не продавец: ему сюда — за
  // списком складов и переключателем роли (п.1, п.5).
  const readOnly = useEditor((s) => selectRole(s) === "seller");
  const t = useT();
  const dark = theme === "dark";
  const [dialog, setDialog] = useState<DialogState>(null);

  const warehouses = allWarehouses();

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-8">
        {/* Шапка: пользователь / компания */}
        <header className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-foreground text-background">
              {account.type === "company" ? (
                <Building2 className="size-5" />
              ) : (
                <User className="size-5" />
              )}
            </div>
            <div>
              <p className="text-lg font-semibold tracking-tight">
                {t("dash.greeting", { name: account.name })}
              </p>
              <p className="text-xs text-muted-foreground">
                {account.type === "company"
                  ? `${t("dash.account.company")} · ${account.org}`
                  : t("dash.account.personal")}
                {account.title ? ` · ${account.title}` : ""}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Роль — здесь, а не в рельсе склада: это выбор «с чьей стороны я
                смотрю», и он должен быть виден до входа на склад (п.5). */}
            <RoleSwitch />
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => updateProfile({ theme: dark ? "light" : "dark" })}
              aria-label={t("nav.theme")}
            >
              {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>
            <Button variant="outline" size="sm" onClick={goToProfile}>
              <Settings className="size-3.5" />
              {t("dash.openProfile")}
            </Button>
          </div>
        </header>

        {/* Список складов — карточки в стиле проектов Figma */}
        <section>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold">{t("dash.warehouses.title")}</h2>
            <p className="text-xs text-muted-foreground">{t("dash.warehouses.subtitle")}</p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {warehouses.map((w) => (
              <WarehouseCard
                key={w.id}
                warehouse={w}
                active={w.id === activeId}
                stats={warehouseStats(w, placements, boxes)}
                onOpen={() => openWarehouse(w.id)}
                onEdit={readOnly ? undefined : () => setDialog({ mode: "edit", warehouse: w })}
                onInfo={() => {
                  // «О складе» — это контакты, ответственное лицо, партнёры и
                  // сотрудники: всё уже собрано на экране склада (п.5).
                  openWarehouse(w.id);
                  goToView("staff");
                }}
                t={t}
              />
            ))}

            {/* Создать склад */}
            {!readOnly && (
              <button
                onClick={() => setDialog({ mode: "new" })}
                className="flex min-h-[13rem] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-primary"
              >
                <span className="flex size-10 items-center justify-center rounded-full bg-muted">
                  <Plus className="size-5" />
                </span>
                <span className="text-sm font-medium">{t("dash.newWarehouse")}</span>
              </button>
            )}
          </div>
        </section>
      </div>

      {dialog && (
        <WarehouseDialog
          warehouse={dialog.mode === "edit" ? dialog.warehouse : undefined}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

function WarehouseCard({
  warehouse: w,
  active,
  stats,
  onOpen,
  onEdit,
  onInfo,
  t,
}: {
  warehouse: Warehouse;
  active: boolean;
  stats: { floors: number; cells: number; occupied: number; fill: number };
  onOpen: () => void;
  /** Не передан — карандаша на карточке нет (роль без прав на правку). */
  onEdit?: () => void;
  onInfo: () => void;
  t: TFunc;
}) {
  const floorWord = t.plural(stats.floors, ["этаж", "этажа", "этажей"], ["floor", "floors"]);

  return (
    <div
      className={card({
        pad: "none",
        className:
          "group relative overflow-hidden shadow-sm transition-[transform,box-shadow,border-color] hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md",
      })}
    >
      <button onClick={onOpen} className="flex w-full flex-col text-left">
        {/* Мини-превью плана первого этажа */}
        <div className="relative aspect-[16/9] w-full border-b border-border bg-[hsl(var(--canvas-bg))]">
          <WarehouseThumb warehouse={w} />
          {/* Углы в углу карточки: rounded-xl (12) − отступ 8 = 4 → DEFAULT. */}
          {active && (
            <span className="absolute left-2 top-2 rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground shadow-sm">
              {t("dash.card.active")}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-2.5 p-3.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{w.name}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {stats.floors} {floorWord}
              </p>
              <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground/80">
                <MapPin className="size-3 shrink-0" />
                <span className="truncate">{w.address || t("wh.noAddress")}</span>
              </p>
            </div>
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
              <ArrowRight className="size-3.5" />
            </span>
          </div>

          {/* Кто отвечает за склад — самое частое, что ищут в карточке (п.5) */}
          {(w.manager?.name || w.phone) && (
            <p className="truncate text-[11px] text-muted-foreground/80">
              {[w.manager?.name, w.phone].filter(Boolean).join(" · ")}
            </p>
          )}

          {/* Заполненность */}
          <div>
            <div className="mb-1 flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">
                {t("dash.card.fill", { p: stats.fill })}
              </span>
              <span className="font-medium tabular-nums">
                {stats.occupied}/{stats.cells}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-500"
                style={{ width: `${stats.fill}%` }}
              />
            </div>
          </div>
        </div>
      </button>

      {/* Правка и «О складе» — поверх карточки, вне кнопки открытия */}
      <div className="absolute right-2 top-2 z-10 flex gap-1 opacity-0 transition group-hover:opacity-100">
        <button
          onClick={onInfo}
          title={t("dash.aboutWarehouse")}
          className="flex size-7 items-center justify-center rounded border border-border bg-background/85 text-muted-foreground shadow-sm backdrop-blur transition hover:text-foreground"
        >
          <Info className="size-3.5" />
        </button>
        {onEdit && (
          <button
            onClick={onEdit}
            title={t("dash.editWarehouse")}
            className="flex size-7 items-center justify-center rounded border border-border bg-background/85 text-muted-foreground shadow-sm backdrop-blur transition hover:text-foreground"
          >
            <Pencil className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

const THUMB_FILL: Record<ModuleType, string> = {
  section: "hsl(var(--m-section))",
  aisle: "hsl(var(--m-aisle))",
  stairs: "hsl(var(--m-stairs))",
  elevator: "hsl(var(--m-elevator))",
};
const THUMB_STROKE: Record<ModuleType, string> = {
  section: "hsl(var(--m-section-fg) / 0.4)",
  aisle: "hsl(var(--m-aisle-fg) / 0.35)",
  stairs: "hsl(var(--m-stairs-fg) / 0.4)",
  elevator: "hsl(var(--m-elevator-fg) / 0.4)",
};

/** Клетка запаса по краю миниатюры, чтобы план не упирался в рамку карточки. */
const THUMB_PAD_CELLS = 1;

/** Схематичное превью плана первого этажа (как обложка проекта в Figma). */
function WarehouseThumb({ warehouse: w }: { warehouse: Warehouse }) {
  const mods = w.floors[0]?.modules ?? [];
  const box = planBounds(mods, THUMB_PAD_CELLS);
  if (!box) return null;

  return (
    <svg
      viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
      preserveAspectRatio="xMidYMid meet"
      className="absolute inset-0 h-full w-full p-2"
    >
      {mods.map((m) => (
        <rect
          key={m.id}
          x={m.x}
          y={m.y}
          width={m.w}
          height={m.h}
          rx={0.18}
          fill={THUMB_FILL[m.type]}
          stroke={THUMB_STROKE[m.type]}
          strokeWidth={0.08}
        />
      ))}
    </svg>
  );
}
