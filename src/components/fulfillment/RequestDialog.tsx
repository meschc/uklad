import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { useEditor } from "@/lib/store";
import { requestsRepository } from "@/lib/data";
import { useCommand } from "@/lib/useCommand";
import { canReserve, stockByProduct } from "@/lib/fulfillment";
import { useT } from "@/lib/i18n";
import { matchesQuery, normalizeQuery } from "@/lib/productSearch";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Modal, Field } from "./Modal";

/** Сколько подсказок показываем: список под полем, а не второй каталог. */
const MAX_MATCHES = 8;

/**
 * Заявка на отгрузку (п.26, п.9). Реальная заявка — это НЕ одна позиция:
 * продавец набирает список «300 таких, 300 таких, 18 000 вот этих» на одну
 * машину. Поэтому диалог устроен как корзина: ищем товар, добавляем строку,
 * ставим количество, и весь набор уезжает одной датой отгрузки.
 *
 * Живёт отдельным файлом: заявка набирается и с экрана продавца, и прямо из
 * таблицы номенклатуры — списком отмеченных строк.
 */
export function RequestDialog({
  productIds,
  onClose,
}: {
  /** Товары, отмеченные до открытия диалога — сразу становятся строками. */
  productIds?: string[];
  onClose: () => void;
}) {
  const t = useT();
  const products = useEditor((s) => s.products);
  const placements = useEditor((s) => s.placements);
  const boxes = useEditor((s) => s.boxes);
  const shipments = useEditor((s) => s.expectedShipments);
  const requests = useEditor((s) => s.requests);
  const [reserve, setReserve] = useState(true);
  const [lines, setLines] = useState<{ productId: string; qty: string }[]>(
    (productIds ?? []).map((id) => ({ productId: id, qty: "1" })),
  );
  const [query, setQuery] = useState("");
  const [note, setNote] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [truck, setTruck] = useState("");

  const chosen = new Set(lines.map((l) => l.productId));
  // Ищем тем же предикатом, что таблица номенклатуры: «нашёлся ли товар» —
  // один вопрос, и отвечать на него по-разному в двух местах незачем.
  const q = normalizeQuery(query);
  const matches = q
    ? products.filter((p) => !chosen.has(p.id) && matchesQuery(p, q)).slice(0, MAX_MATCHES)
    : [];

  const qtyOf = (raw: string) => Math.max(1, parseInt(raw, 10) || 1);
  const total = lines.reduce((sum, l) => sum + qtyOf(l.qty), 0);

  // Чего не хватает на складе и можно ли это забронировать под ожидаемую
  // поставку — вопрос, который решается до создания заявки, а не после.
  const stock = useMemo(() => stockByProduct(placements, boxes), [placements, boxes]);
  const short = lines.filter((l) => (stock.get(l.productId)?.qty ?? 0) < qtyOf(l.qty));
  const reservable = short.some((l) => canReserve(l.productId, qtyOf(l.qty), shipments, requests));

  // Создание идёт через репозиторий, а не через действие стора напрямую: это и
  // есть шов, за которым появится сервер (п.3.2.1). Хук держит «идёт» и
  // «не вышло», окно рисует их само.
  const create = useCommand(async () => {
    const created = await requestsRepository.create(
      lines.map((l) => ({
        productId: l.productId,
        qty: qtyOf(l.qty),
        note: note.trim() || undefined,
        vehicle: vehicle.trim() || undefined,
      })),
      truck ? new Date(truck).getTime() : undefined,
    );
    if (!created.ok) return created;

    // Дропшиппинг (п.10.1): бронируем те строки, под которые есть ожидаемая
    // поставка. Провал брони не проваливает создание — заявки уже созданы, и
    // сообщить «не получилось» значило бы позвать нажать кнопку ещё раз и
    // завести их второй раз. Не забронированная заявка просто ждёт обычным
    // порядком, ровно как та, которой не хватило количества.
    if (reserve) {
      for (const id of created.data) await requestsRepository.reserve(id);
    }
    return created;
  });

  const submit = async () => {
    if (!lines.length) return;
    const res = await create.run();
    if (res.ok) onClose();
  };

  return (
    <Modal
      title={t("seller.newRequest")}
      onClose={onClose}
      onSubmit={submit}
      pending={create.pending}
      error={create.error}
    >
      <Field label={t("seller.pickProduct")}>
        <Input
          // eslint-disable-next-line jsx-a11y/no-autofocus -- диалог открыт по действию пользователя: фокус обязан уйти в первое поле
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("seller.pickPlaceholder")}
          className="h-9"
        />
      </Field>

      {matches.length > 0 && (
        <div className="flex flex-col gap-1 rounded-lg border border-border p-1">
          {matches.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                setLines((prev) => [...prev, { productId: p.id, qty: "1" }]);
                setQuery("");
              }}
              className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent"
            >
              <span className="truncate">{p.name}</span>
              <span className="shrink-0 font-mono text-muted-foreground">{p.sku}</span>
            </button>
          ))}
        </div>
      )}

      {lines.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {lines.map((l, i) => {
            const p = products.find((x) => x.id === l.productId);
            return (
              <div key={l.productId} className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{p?.name}</p>
                  <p className="truncate font-mono text-[11px] text-muted-foreground">{p?.sku}</p>
                </div>
                <Input
                  value={l.qty}
                  inputMode="numeric"
                  onChange={(e) =>
                    setLines((prev) =>
                      prev.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)),
                    )
                  }
                  className="h-8 w-24 text-right tabular-nums"
                />
                <button
                  onClick={() => setLines((prev) => prev.filter((_, j) => j !== i))}
                  title={t("common.delete")}
                  className="flex size-7 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:text-destructive"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            );
          })}
          <p className="text-[11px] text-muted-foreground">
            {t("seller.linesTotal", { lines: lines.length, n: total })}
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label={t("seller.col.shipDate")}>
          <Input
            type="date"
            value={truck}
            onChange={(e) => setTruck(e.target.value)}
            className="h-9"
          />
        </Field>
        <Field label={t("seller.target")}>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("seller.targetPlaceholder")}
            className="h-9"
          />
        </Field>
      </div>

      {/* Дропшиппинг (п.10.1): товара ещё нет на складе, но он уже заказан у
          поставщика — продавать можно, если под это есть ожидаемая поставка. */}
      {short.length > 0 && (
        <div
          className={cn(
            "flex flex-col gap-1.5 rounded-lg border p-2.5 text-xs",
            reservable ? "border-amber-500/40 bg-amber-500/10" : "border-border bg-muted/30",
          )}
        >
          <p className="font-semibold">{t("seller.shortTitle", { n: short.length })}</p>
          {reservable ? (
            <label className="flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                checked={reserve}
                onChange={(e) => setReserve(e.target.checked)}
                className="mt-0.5 size-3.5 accent-[hsl(var(--primary))]"
              />
              <span className="text-muted-foreground">{t("seller.reserveHint")}</span>
            </label>
          ) : (
            <p className="text-muted-foreground">{t("seller.noReserveHint")}</p>
          )}
        </div>
      )}

      {/* Машину часто организует сам продавец — тогда складу не нужно
          выяснять номер по телефону в момент погрузки. */}
      <Field label={t("seller.vehicle")}>
        <Input
          value={vehicle}
          onChange={(e) => setVehicle(e.target.value)}
          placeholder={t("ship.vehiclePlaceholder")}
          className="h-9"
        />
      </Field>
    </Modal>
  );
}
