import { useState } from "react";
import {
  AlertTriangle,
  ClipboardList,
  Loader2,
  MapPin,
  MapPinOff,
  Tag,
  Trash2,
  Truck,
  Users,
  X,
} from "lucide-react";
import { useEditor } from "@/lib/store";
import { catalogRepository, placementRepository, type Result } from "@/lib/data";
import { useCommand } from "@/lib/useCommand";
import { cm } from "@/lib/address";
import { catLabel, useT, type TFunc } from "@/lib/i18n";
import { cn, EMPTY_ARRAY } from "@/lib/utils";
import { DialogFooter, DialogShell } from "@/components/ui/dialog-shell";
import { Button } from "@/components/ui/button";

/**
 * Нижние панели таблицы номенклатуры: что можно сделать с отмеченными строками
 * и разбор неудачного размещения. Отдельным файлом — сама таблица и без них
 * упирается в потолок размера файла.
 */

/** Кнопка-вариант в раскрытом ряду панели: выбор категории или партнёра. */
const chip =
  "rounded-md bg-muted px-2 py-1 text-xs transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50";

/**
 * Панель групповых действий — всплывает снизу, пока есть отмеченные строки
 * (#32). Удаление подтверждаем: товары уходят вместе с размещениями.
 */
export function BulkBar({
  ids,
  onDone,
  onPlaceFailed,
  onPickList,
}: {
  ids: string[];
  onDone: () => void;
  onPlaceFailed: (failed: string[]) => void;
  /** Открыть лист сборки по отмеченным строкам. */
  onPickList: () => void;
}) {
  const t = useT();
  const placements = useEditor((s) => s.placements);
  const showToast = useEditor((s) => s.showToast);
  const categories = useEditor((s) => s.categories);
  const partners = useEditor((s) => s.warehouse.partners ?? EMPTY_ARRAY);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [catOpen, setCatOpen] = useState(false);
  const [partnerOpen, setPartnerOpen] = useState(false);

  const placedCount = ids.filter((id) => placements[id]).length;

  /**
   * Групповые действия идут через репозитории (п.3.2.1). Формы здесь нет и
   * терять при отказе нечего, поэтому по общему правилу п.3.2.2: отказ —
   * тостом, кнопки на время команды заняты. Занять их важнее, чем в форме:
   * второе нажатие «Удалить» по сети ушло бы вслед за первым.
   *
   * Команда одна на всю панель, а не по одной на кнопку: нажать можно только
   * что-то одно, и пять отдельных `pending` всё равно пришлось бы складывать
   * в один флаг. Автораскладка — исключение, у неё свой ответ (см. ниже).
   */
  const command = useCommand((run: () => Promise<Result<unknown>>) => run());
  const place = useCommand((productIds: string[]) => placementRepository.relocate(productIds));
  const busy = command.pending || place.pending;

  /** Выполнить и снять выделение; при отказе выделение остаётся — повторить. */
  const act = (run: () => Promise<Result<unknown>>) => async () => {
    const res = await command.run(run);
    if (res.ok) onDone();
    else showToast(res.error);
  };

  const autoPlace = async () => {
    // Раскладываем сразу всё выделение: свободные ячейки подбираются по
    // габаритам, а порядок обхода группирует товар по категориям (п.12).
    // Неудачу не проглатываем: успех — тост, а вот «не поместилось» — разбор
    // со списком товаров (п.7). Это не сбой связи, и тост тут не годится.
    const res = await place.run(ids);
    if (!res.ok) {
      showToast(res.error);
      return;
    }
    if (res.data.length) onPlaceFailed(res.data);
    else showToast("table.bulk.placedAll", { n: ids.length });
    onDone();
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-30 flex justify-center">
      <div className="pointer-events-auto flex animate-pop items-center gap-1.5 rounded-lg border border-border bg-popover/95 py-1.5 pl-3 pr-1.5 shadow-lg backdrop-blur">
        <span className="text-xs font-medium">{t("table.bulk.count", { n: ids.length })}</span>
        <div className="mx-0.5 h-5 w-px bg-border" />

        {partnerOpen ? (
          <div className="flex items-center gap-1">
            <button
              onClick={act(() => catalogRepository.setPartner(ids, undefined))}
              disabled={busy}
              className={chip}
            >
              {t("product.partnerNone")}
            </button>
            {partners.map((p) => (
              <button
                key={p.id}
                onClick={act(() => catalogRepository.setPartner(ids, p.id))}
                disabled={busy}
                className={chip}
              >
                {p.name}
              </button>
            ))}
            <button
              onClick={() => setPartnerOpen(false)}
              aria-label={t("common.cancel")}
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ) : catOpen ? (
          <div className="flex items-center gap-1">
            {categories.map((c) => (
              <button
                key={c}
                onClick={act(() => catalogRepository.setCategory(ids, c))}
                disabled={busy}
                className={chip}
              >
                {catLabel(t, c)}
              </button>
            ))}
            <button
              onClick={() => setCatOpen(false)}
              aria-label={t("common.cancel")}
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ) : confirmDelete ? (
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">{t("table.bulk.confirmDelete")}</span>
            <Button
              size="sm"
              variant="destructive"
              disabled={busy}
              onClick={act(() => catalogRepository.remove(ids))}
            >
              {command.pending && <Loader2 className="animate-spin" />}
              {command.pending ? t("data.busy") : t("common.delete")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
              {t("common.cancel")}
            </Button>
          </div>
        ) : (
          <>
            {/* Лист сборки идёт первым и не меняет данные: остальные кнопки
                панели что-то делают с товаром, эта — только печатает (п.5). */}
            <BulkBtn
              icon={<ClipboardList className="size-3.5" />}
              label={t("table.bulk.pickList")}
              onClick={onPickList}
            />
            <BulkBtn
              icon={<MapPinOff className="size-3.5" />}
              label={t("table.bulk.unplace")}
              disabled={placedCount === 0 || busy}
              onClick={act(() => placementRepository.clear(ids))}
            />
            <BulkBtn
              icon={
                place.pending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <MapPin className="size-3.5" />
                )
              }
              label={t("table.bulk.autoPlace")}
              disabled={busy}
              onClick={autoPlace}
            />
            <BulkBtn
              icon={<Users className="size-3.5" />}
              label={t("table.bulk.partner")}
              disabled={partners.length === 0 || busy}
              onClick={() => setPartnerOpen(true)}
            />
            <BulkBtn
              icon={<Tag className="size-3.5" />}
              label={t("table.bulk.category")}
              disabled={busy}
              onClick={() => setCatOpen(true)}
            />
            <BulkBtn
              icon={<Trash2 className="size-3.5" />}
              label={t("common.delete")}
              danger
              disabled={busy}
              onClick={() => setConfirmDelete(true)}
            />
          </>
        )}

        <div className="mx-0.5 h-5 w-px bg-border" />
        <button
          onClick={onDone}
          aria-label={t("table.bulk.clear")}
          title={t("table.bulk.clear")}
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

/**
 * Панель отмеченных строк в роли продавца. Складских групповых действий у него
 * нет — есть одно: собрать из отмеченного заявку на отгрузку (п.3, п.9).
 */
export function SellerBar({
  ids,
  onRequest,
  onDone,
}: {
  ids: string[];
  onRequest: () => void;
  onDone: () => void;
}) {
  const t = useT();
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-30 flex justify-center">
      <div className="pointer-events-auto flex animate-pop items-center gap-1.5 rounded-lg border border-border bg-popover/95 py-1.5 pl-3 pr-1.5 shadow-lg backdrop-blur">
        <span className="text-xs font-medium">{t("table.bulk.count", { n: ids.length })}</span>
        <div className="mx-0.5 h-5 w-px bg-border" />
        <Button size="sm" onClick={onRequest}>
          <Truck className="size-3.5" />
          {t("seller.requestPicked", { n: ids.length })}
        </Button>
        <button
          onClick={onDone}
          aria-label={t("table.bulk.clear")}
          title={t("table.bulk.clear")}
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

function BulkBtn({
  icon,
  label,
  onClick,
  disabled,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors",
        disabled
          ? "cursor-not-allowed text-muted-foreground/40"
          : danger
            ? "text-destructive hover:bg-destructive/10"
            : "text-foreground hover:bg-accent",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

/**
 * «Разместить не удалось» — по единому alert-паттерну (штриховка + янтарь):
 * товар остался без места, и это нужно увидеть, а не выловить из тоста.
 * Причина всегда одна из двух: свободных ячеек нет или товар в них не влезает.
 */
export function PlaceFailedAlert({
  ids,
  onClose,
  t,
}: {
  ids: string[];
  onClose: () => void;
  t: TFunc;
}) {
  const products = useEditor((s) => s.products);
  const failed = products.filter((p) => ids.includes(p.id));

  return (
    <DialogShell onClose={onClose}>
      <div className="hazard-stripes flex gap-3 bg-amber-500/10 px-5 py-4">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="min-w-0">
          <p className="text-sm font-semibold">{t("table.place.failedTitle")}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {t("table.place.failedBody", {
              n: failed.length,
              // «Для 1 товаров» — так не говорят: слово склоняем по числу.
              unit: t.plural(failed.length, ["товара", "товаров", "товаров"], ["item", "items"]),
            })}
          </p>
        </div>
      </div>
      <ul className="no-scrollbar max-h-52 overflow-y-auto px-5 py-3 text-xs">
        {failed.map((p) => (
          <li key={p.id} className="flex justify-between gap-3 py-1">
            <span className="truncate">{p.name}</span>
            <span className="shrink-0 font-mono text-muted-foreground">
              {cm(p.widthCm)}×{cm(p.heightCm)}×{cm(p.depthCm)}
            </span>
          </li>
        ))}
      </ul>
      <DialogFooter>
        <Button size="sm" onClick={onClose}>
          {t("common.ok")}
        </Button>
      </DialogFooter>
    </DialogShell>
  );
}
