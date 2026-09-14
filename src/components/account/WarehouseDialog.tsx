import { Suspense, lazy, useRef, useState } from "react";
import {
  AlertTriangle,
  Loader2,
  MapPin,
  Trash2,
  Warehouse as WarehouseIcon,
  X,
} from "lucide-react";
import { useEditor } from "@/lib/store";
import type { Warehouse, WarehouseKind } from "@/lib/types";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { DialogFooter, DialogHeader, DialogShell } from "@/components/ui/dialog-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Карта — отдельным куском: её открывают по кнопке и далеко не всегда, а
 * Leaflet со стилями тяжелее всего остального в этом диалоге вместе взятого.
 */
const MapPicker = lazy(() => import("./MapPicker").then((m) => ({ default: m.MapPicker })));

/**
 * Создание / редактирование склада (ТЗ, разд. 3.4): название, тип, адрес.
 * В режиме редактирования — ещё и удаление (с подтверждением).
 */
export function WarehouseDialog({
  warehouse,
  onClose,
}: {
  warehouse?: Warehouse;
  onClose: () => void;
}) {
  const create = useEditor((s) => s.createWarehouse);
  const update = useEditor((s) => s.updateWarehouse);
  const remove = useEditor((s) => s.deleteWarehouse);
  const canDelete = useEditor((s) => s.otherWarehouses.length >= 1);
  const t = useT();

  const editing = !!warehouse;
  const [name, setName] = useState(warehouse?.name ?? "");
  // Тип склада пока не выбирается (нет инфраструктуры под «порт») — всегда мезонин.
  const [kind] = useState<WarehouseKind>(warehouse?.kind ?? "mezzanine");
  const [address, setAddress] = useState(warehouse?.address ?? "");
  // Координаты храним как текст (чтобы удобно набирать), число выводим для карты.
  const [latText, setLatText] = useState(warehouse?.lat != null ? String(warehouse.lat) : "");
  const [lngText, setLngText] = useState(warehouse?.lng != null ? String(warehouse.lng) : "");
  const [rateText, setRateText] = useState(
    warehouse?.storageRatePerCell != null ? String(warehouse.storageRatePerCell) : "",
  );
  const [geocoding, setGeocoding] = useState(false);
  const [geoErr, setGeoErr] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Карта — опциональный шаг: при создании свёрнута, чтобы не выглядеть
  // обязательной; при правке склада с координатами сразу раскрыта.
  const [showMap, setShowMap] = useState(warehouse?.lat != null);

  const lat = latText.trim() && !Number.isNaN(Number(latText)) ? Number(latText) : undefined;
  const lng = lngText.trim() && !Number.isNaN(Number(lngText)) ? Number(lngText) : undefined;

  const onPick = (la: number, ln: number) => {
    setLatText(String(la));
    setLngText(String(ln));
  };

  // Выбор точки на карте → координаты + обратный геокодинг адреса (Nominatim
  // /reverse). Счётчик отсекает устаревшие ответы при быстрых кликах.
  const reverseSeq = useRef(0);
  const onMapPick = async (la: number, ln: number) => {
    onPick(la, ln);
    const seq = ++reverseSeq.current;
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${la}&lon=${ln}`;
      const res = await fetch(url, { headers: { "Accept-Language": t.lang } });
      const data = (await res.json()) as { display_name?: string };
      if (seq === reverseSeq.current && data.display_name) {
        setAddress(data.display_name);
        setGeoErr(false);
      }
    } catch {
      // Адрес — необязательные метаданные: координаты уже применены, а ошибку
      // сети здесь не показываем, чтобы не путать с ошибкой прямого поиска.
    }
  };

  // Геокодинг по адресу (Nominatim/OpenStreetMap) → координаты.
  const geocode = async () => {
    const q = address.trim();
    if (!q) return;
    setGeocoding(true);
    setGeoErr(false);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
      const res = await fetch(url, { headers: { "Accept-Language": t.lang } });
      const data = (await res.json()) as { lat: string; lon: string }[];
      if (Array.isArray(data) && data.length) {
        onPick(
          Math.round(parseFloat(data[0].lat) * 1e5) / 1e5,
          Math.round(parseFloat(data[0].lon) * 1e5) / 1e5,
        );
      } else setGeoErr(true);
    } catch {
      setGeoErr(true);
    } finally {
      setGeocoding(false);
    }
  };

  // Тариф хранения: рублей за занятую ячейку в сутки (п.10.5). Пустое поле —
  // тарифа нет, и метрика в аналитике честно скажет «не задан», а не покажет 0.
  const rate =
    rateText.trim() && !Number.isNaN(Number(rateText)) ? Math.max(0, Number(rateText)) : undefined;

  const submit = () => {
    if (editing)
      update(warehouse!.id, {
        name,
        kind,
        address,
        lat,
        lng,
        storageRatePerCell: rate,
      });
    else create(name, kind, address, { lat, lng });
    onClose();
  };

  return (
    <DialogShell size="lg" scroll onClose={onClose}>
      <DialogHeader align="start">
        <div className="flex items-center gap-2">
          <WarehouseIcon className="size-4 text-muted-foreground" />
          <p className="text-sm font-semibold">
            {editing ? t("wh.edit.title") : t("wh.create.title")}
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </DialogHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
        {/* Название */}
        <label className="flex flex-col gap-1.5">
          <Label>{t("wh.name")}</Label>
          <Input
            value={name}
            // eslint-disable-next-line jsx-a11y/no-autofocus -- диалог открыт по действию пользователя: фокус обязан уйти в первое поле
            autoFocus
            onChange={(e) => setName(e.target.value)}
            placeholder={t("wh.namePlaceholder")}
            onKeyDown={(e) => {
              if (e.key === "Enter" && name.trim()) submit();
            }}
          />
        </label>

        {/* Тариф хранения — только у существующего склада: у нового ещё нет
              ни ячеек, ни занятости, считать нечего. */}
        {editing && (
          <label className="flex flex-col gap-1.5">
            <Label>
              {t("wh.storageRate")}
              <span className="ml-1.5 font-normal normal-case text-muted-foreground/70">
                · {t("common.optional")}
              </span>
            </Label>
            <Input
              value={rateText}
              inputMode="decimal"
              // Тариф — деньги, а не заметка: буквы в поле не блокируются
              // где-то в глубине при сохранении, а просто не набираются.
              // Разрешаем цифры и один разделитель дробной части.
              onChange={(e) => setRateText(sanitizeAmount(e.target.value))}
              placeholder={t("wh.storageRatePlaceholder")}
              className="max-w-40 text-right tabular-nums"
            />
            <span className="text-[11px] text-muted-foreground">{t("wh.storageRateHint")}</span>
          </label>
        )}

        {/* Адрес + поиск на карте. Адрес — метаданные, не блокирует создание. */}
        <label className="flex flex-col gap-1.5">
          <Label>
            {t("wh.address")}
            <span className="ml-1.5 font-normal normal-case text-muted-foreground/70">
              · {t("common.optional")}
            </span>
          </Label>
          <div className="flex gap-2">
            <Input
              value={address}
              onChange={(e) => {
                setAddress(e.target.value);
                setGeoErr(false);
              }}
              placeholder={t("wh.addressPlaceholder")}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  geocode();
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              disabled={!address.trim() || geocoding}
              onClick={geocode}
            >
              {geocoding ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <MapPin className="size-3.5" />
              )}
              {geocoding ? t("wh.geocoding") : t("wh.findOnMap")}
            </Button>
          </div>
          {geoErr && <span className="text-[11px] text-destructive">{t("wh.geocodeFail")}</span>}
        </label>

        {/* Карта — по кнопке, чтобы не занимать полдиалога при создании */}
        {!showMap && (
          <button
            type="button"
            onClick={() => setShowMap(true)}
            className="flex items-center justify-center gap-1.5 rounded-md border border-dashed border-border py-2 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-primary"
          >
            <MapPin className="size-3.5" />
            {t("wh.showMap")}
          </button>
        )}

        {showMap && (
          <>
            {/* Координаты */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <Label>{t("wh.coords")}</Label>
                {(lat != null || lng != null) && (
                  <button
                    type="button"
                    onClick={() => {
                      setLatText("");
                      setLngText("");
                    }}
                    className="text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    {t("wh.clearPoint")}
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  value={latText}
                  inputMode="decimal"
                  onChange={(e) => setLatText(e.target.value)}
                  placeholder={t("wh.lat")}
                  className={cn(
                    "font-mono text-sm tabular-nums",
                    latText.trim() && lat == null && "border-destructive",
                  )}
                />
                <Input
                  value={lngText}
                  inputMode="decimal"
                  onChange={(e) => setLngText(e.target.value)}
                  placeholder={t("wh.lng")}
                  className={cn(
                    "font-mono text-sm tabular-nums",
                    lngText.trim() && lng == null && "border-destructive",
                  )}
                />
              </div>
            </div>

            {/* Карта */}
            <div className="flex flex-col gap-1.5">
              <Suspense
                fallback={
                  <div className="grid h-56 w-full place-items-center rounded-md border border-border bg-muted/30">
                    <Loader2 className="size-5 animate-spin text-muted-foreground" />
                  </div>
                }
              >
                <MapPicker lat={lat} lng={lng} onPick={onMapPick} />
              </Suspense>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">{t("wh.mapHint")}</span>
                <button
                  type="button"
                  onClick={() => setShowMap(false)}
                  className="text-[11px] text-muted-foreground hover:text-foreground"
                >
                  {t("wh.hideMap")}
                </button>
              </div>
            </div>
          </>
        )}

        {/* Подтверждение удаления */}
        {confirmDelete && (
          <div className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <div className="min-w-0">
              <p className="font-semibold">
                {t("wh.delete.confirm", { name: warehouse?.name ?? "" })}
              </p>
              <p className="mt-0.5 opacity-90">{t("wh.delete.note")}</p>
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-7"
                  onClick={() => {
                    remove(warehouse!.id);
                    onClose();
                  }}
                >
                  {t("common.delete")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7"
                  onClick={() => setConfirmDelete(false)}
                >
                  {t("common.cancel")}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Действия */}
      <DialogFooter spread>
        {editing && canDelete && !confirmDelete ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-destructive"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="size-3.5" />
            {t("dash.deleteWarehouse")}
          </Button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button size="sm" disabled={!name.trim()} onClick={submit}>
            {editing ? t("common.save") : t("common.create")}
          </Button>
        </div>
      </DialogFooter>
    </DialogShell>
  );
}

/**
 * Оставить в строке только денежную сумму: цифры и одна дробная часть.
 * Запятую приводим к точке — на цифровой клавиатуре русской раскладки под
 * рукой именно она, а `Number("1,5")` даёт NaN.
 */
function sanitizeAmount(raw: string): string {
  const cleaned = raw.replace(/,/g, ".").replace(/[^\d.]/g, "");
  const [head, ...rest] = cleaned.split(".");
  return rest.length ? `${head}.${rest.join("")}` : head;
}
