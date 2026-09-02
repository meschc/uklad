import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Warehouse } from "../../data/warehouses";

const RU_CENTER: [number, number] = [55.75, 44];

/**
 * Карта витрины. Не «красивая картинка рядом со списком»: география — это
 * половина выбора фулфилмента, потому что от склада до сортировочного центра
 * площадки товар везут машиной, и лишние двести километров стоят денег.
 *
 * Метки рисуются divIcon'ами в цвет склада — тем же, что и плитка в карточке,
 * чтобы точка на карте и строка в списке узнавались друг в друге.
 */
export function MarketMap({
  list,
  activeId,
  onHover,
  onOpen,
}: {
  list: Warehouse[];
  activeId?: string;
  onHover: (id?: string) => void;
  onOpen: (id: string) => void;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const marksRef = useRef<Map<string, L.Marker>>(new Map());

  // Колбэки живут в ref: пересоздавать метки из-за новой стрелочной функции в
  // родителе — верный способ уронить карту в мигание при каждом наведении.
  const cbRef = useRef({ onHover, onOpen });
  cbRef.current = { onHover, onOpen };

  useEffect(() => {
    if (!elRef.current || mapRef.current) return;
    // zoomSnap дробный: склады растянуты от Калининграда до Владивостока, и с
    // целым шагом fitBounds всегда округляет вниз — вместо страны в кадр
    // попадает половина глобуса.
    const map = L.map(elRef.current, {
      zoomControl: true,
      attributionControl: true,
      zoomSnap: 0.25,
      minZoom: 2,
      worldCopyJump: false,
    }).setView(RU_CENTER, 4);
    // Подложка — обычный OSM: CARTO Positron с некоторых пор печатает поверх
    // плиток «API KEY REQUIRED», а ключа у демо нет. Заодно OSM подписывает
    // города по-русски, чего англоязычные бесплатные подложки не умеют.
    // Пестроту снимаем фильтром в site.css — иначе метки тонут в карте.
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      // Без noWrap на мелком зуме мир повторяется по горизонтали, и рядом с
      // Владивостоком оказывается вторая Москва.
      noWrap: true,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    const id = window.setTimeout(() => map.invalidateSize(), 60);

    return () => {
      window.clearTimeout(id);
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
      marksRef.current.clear();
    };
  }, []);

  // Перестройка меток под текущий отбор. Подпись — по идентификаторам: если
  // фильтр не изменил состав, карту трогать незачем.
  const signature = list.map((w) => w.id).join(",");

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();
    marksRef.current.clear();

    for (const w of list) {
      // Точки различаются не «по складу», а по единственному признаку, который
      // на карте что-то решает: ведёт склад учёт в Укладе или нет. Свой цвет у
      // каждого склада давал бы два десятка разноцветных точек, по которым
      // всё равно нельзя ничего прочитать, — цвет здесь легенда, а не
      // украшение.
      const icon = L.divIcon({
        className: "uklad-dot",
        html: `<span class="market-dot${w.uklad ? " is-uklad" : ""}"></span>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      });
      const marker = L.marker([w.lat, w.lng], { icon, title: w.name })
        .addTo(layer)
        .bindTooltip(
          `<b>${w.name}</b><br>${w.city} · ${w.price.storage} ₽/место в сутки`,
          { direction: "top", offset: [0, -8] },
        );

      marker.on("click", () => cbRef.current.onOpen(w.id));
      marker.on("mouseover", () => cbRef.current.onHover(w.id));
      marker.on("mouseout", () => cbRef.current.onHover(undefined));
      marksRef.current.set(w.id, marker);
    }

    if (list.length === 0) {
      map.setView(RU_CENTER, 4);
      return;
    }
    // padding — чтобы крайние метки не прилипали к рамке, maxZoom — чтобы
    // единственный найденный склад не приближался до уровня отдельных гаражей.
    map.fitBounds(L.latLngBounds(list.map((w) => [w.lat, w.lng] as [number, number])), {
      padding: [36, 36],
      maxZoom: 11,
    });
  }, [signature, list]);

  // Подсветка активной метки — только класс, без перестройки слоя.
  useEffect(() => {
    for (const [id, marker] of marksRef.current) {
      const el = marker.getElement();
      if (el) el.classList.toggle("is-active", id === activeId);
    }
  }, [activeId, signature]);

  return <div ref={elRef} className="market-map size-full" />;
}
