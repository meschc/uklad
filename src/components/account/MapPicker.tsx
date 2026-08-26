import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

/**
 * Интерактивная карта выбора координат склада (OpenStreetMap через Leaflet).
 * Клик по карте или перетаскивание метки задаёт координаты; внешние правки
 * (поля ввода/геокодинг по адресу) двигают метку и центрируют карту.
 * Метка — divIcon (SVG), чтобы не тянуть картиночные ассеты Leaflet.
 */

const round = (n: number) => Math.round(n * 1e5) / 1e5;

const PIN_HTML = `<svg width="28" height="28" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 1px 2px rgba(0,0,0,.4))"><path d="M12 22s7-6.16 7-12A7 7 0 1 0 5 10c0 5.84 7 12 7 12z" fill="#2563eb"/><circle cx="12" cy="10" r="2.7" fill="#fff"/></svg>`;

export function MapPicker({
  lat,
  lng,
  onPick,
}: {
  lat?: number;
  lng?: number;
  onPick: (lat: number, lng: number) => void;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  // Инициализация карты один раз.
  useEffect(() => {
    if (!elRef.current || mapRef.current) return;
    const has = lat != null && lng != null;
    const start: [number, number] = [lat ?? 55.7558, lng ?? 37.6173];
    const map = L.map(elRef.current).setView(start, has ? 14 : 4);
    // Схематичная подложка (Carto Positron): меньше визуального шума, чем
    // стандартные тайлы OSM — карта здесь только для выбора точки.
    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
      {
        maxZoom: 19,
        attribution: "© OpenStreetMap © CARTO",
      },
    ).addTo(map);

    const icon = L.divIcon({
      html: PIN_HTML,
      className: "uklad-pin",
      iconSize: [28, 28],
      iconAnchor: [14, 26],
    });
    const marker = L.marker(start, {
      draggable: true,
      icon,
      opacity: has ? 1 : 0,
    }).addTo(map);

    marker.on("dragend", () => {
      const p = marker.getLatLng();
      marker.setOpacity(1);
      onPickRef.current(round(p.lat), round(p.lng));
    });
    map.on("click", (e: L.LeafletMouseEvent) => {
      marker.setLatLng(e.latlng);
      marker.setOpacity(1);
      onPickRef.current(round(e.latlng.lat), round(e.latlng.lng));
    });

    mapRef.current = map;
    markerRef.current = marker;
    // Модалка анимируется — пересчитать размер после появления.
    const id = window.setTimeout(() => map.invalidateSize(), 70);
    return () => {
      window.clearTimeout(id);
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Внешние правки координат → метка + центр карты (клик/драг не дёргаем).
  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;
    if (lat == null || lng == null) {
      marker.setOpacity(0);
      return;
    }
    const cur = marker.getLatLng();
    if (
      marker.options.opacity === 1 &&
      Math.abs(cur.lat - lat) < 1e-6 &&
      Math.abs(cur.lng - lng) < 1e-6
    ) {
      return; // метка уже на месте (пришло из клика/драга) — карту не двигаем
    }
    marker.setLatLng([lat, lng]);
    marker.setOpacity(1);
    // Без анимации: дальний «перелёт» с animate иногда не догружает плитки —
    // прямой прыжок вызывает нормальный moveend и полную сетку тайлов.
    map.invalidateSize();
    map.setView([lat, lng], Math.max(map.getZoom(), 13), { animate: false });
  }, [lat, lng]);

  return (
    <div
      ref={elRef}
      className="h-56 w-full overflow-hidden rounded-md border border-border"
    />
  );
}
