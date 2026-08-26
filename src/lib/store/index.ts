import { create } from "zustand";
import { persist } from "zustand/middleware";
import { uid } from "../utils";
import { buildCatalog } from "../catalog";
import { autoPlace } from "../autoPlace";
import { setAddressingConfig } from "../address";
import { PRODUCT_CATEGORIES } from "../types";
import type {
  CellAddress,
  Floor,
  Product,
  UserRole,
  Warehouse,
} from "../types";
import type { EditorState } from "./state";
import { fieldValueKey } from "./helpers";
import { SEED_FIELD_VALUES, seedStaff } from "./seed";
import { seedHistory } from "./seedHistory";
import { createAccountSlice } from "./account.slice";
import { createIntegrationsSlice } from "./integrations.slice";
import { createLabelsSlice } from "./labels.slice";
import { createFloorsSlice } from "./floors.slice";
import { createCatalogSlice } from "./catalog.slice";
import { createPlacementSlice } from "./placement.slice";
import { createModulesSlice } from "./modules.slice";
import { createShelvesSlice } from "./shelves.slice";
import { createRowsSlice } from "./rows.slice";
import { createPrintSlice, createViewSlice } from "./view.slice";
import { createOnboardingSlice } from "./onboarding.slice";
import { createHistorySlice, installHistory } from "./history.slice";
import { createFulfillmentSlice } from "./fulfillment.slice";
import { createRequestsSlice } from "./requests.slice";
import { createSessionSlice, makeSession } from "./session.slice";
import { createStaffSlice } from "./staff.slice";
import { sanitizeDomains } from "../data/sanitize";

/**
 * Сборка стора из срезов (slices pattern). Каждый срез — отдельный файл рядом;
 * здесь только склейка, persist и разовая инициализация демо-данных.
 */

export { fieldValueKey, resolveFloor, FLOOR_MAX } from "./helpers";
export { selectRole } from "./session.slice";
export type { GoodsConflict, EditorState } from "./state";

/** Ключ автосохранения в localStorage (ТЗ: изменения сохраняются сами). */
export const PERSIST_KEY = "uklad-store-v1";

/** Форма персиста (см. partialize ниже) — минимум, нужный миграции. */
type PersistedState = {
  warehouse?: Warehouse;
  otherWarehouses?: Warehouse[];
  [k: string]: unknown;
};

/**
 * Было ли сохранённое состояние на момент загрузки. Если да — демо-раздачу
 * размещений НЕ применяем (иначе она перезатёрла бы реальные данные польз.).
 */
const HAD_PERSISTED =
  typeof localStorage !== "undefined" &&
  localStorage.getItem(PERSIST_KEY) != null;

export const useEditor = create<EditorState>()(
  persist(
    (...a) => ({
      ...createAccountSlice(...a),
      ...createIntegrationsSlice(...a),
      ...createLabelsSlice(...a),
      ...createFloorsSlice(...a),
      ...createCatalogSlice(...a),
      ...createPlacementSlice(...a),
      ...createModulesSlice(...a),
      ...createShelvesSlice(...a),
      ...createRowsSlice(...a),
      ...createViewSlice(...a),
      ...createPrintSlice(...a),
      ...createOnboardingSlice(...a),
      ...createHistorySlice(...a),
      ...createFulfillmentSlice(...a),
      ...createRequestsSlice(...a),
      ...createSessionSlice(...a),
      ...createStaffSlice(...a),
    }),
    {
      name: PERSIST_KEY,
      version: 8,
      // v1 → v2: модель «проход как объект» заменена на «пол как проход».
      // Проходы больше нельзя ни создать, ни увидеть, но их прямоугольники
      // остаются в старых сохранениях — ловят наложение в overlap.ts и висят
      // в списке «Объекты». Вырезаем type === "aisle" из всех складов/этажей.
      // v2 → v3: демо-номенклатура расширена (варианты размеров/объёмов), а
      // раскладка стала осмысленной. Миграция только ДОБАВЛЯЕТ: дописывает
      // отсутствующие позиции каталога по артикулу и раскладывает товары без
      // места. Существующие товары и их размещения не трогаются.
      migrate: (persisted, version) => {
        let state = persisted as PersistedState;

        if (version < 2) {
          const stripFloor = (f: Floor): Floor => ({
            ...f,
            modules: f.modules.filter((m) => m.type !== "aisle"),
          });
          const stripWarehouse = (w: Warehouse): Warehouse => ({
            ...w,
            floors: w.floors.map(stripFloor),
          });
          state = {
            ...state,
            warehouse: state.warehouse
              ? stripWarehouse(state.warehouse)
              : state.warehouse,
            otherWarehouses: (state.otherWarehouses ?? []).map(stripWarehouse),
          };
        }

        if (version < 3) {
          const products = [...((state.products as Product[]) ?? [])];
          const known = new Set(products.map((p) => p.sku.toLowerCase()));
          for (const p of buildCatalog(() => uid("prod"))) {
            if (!known.has(p.sku.toLowerCase())) products.push(p);
          }
          const placements = {
            ...((state.placements as Record<string, CellAddress>) ?? {}),
          };
          if (state.warehouse) {
            Object.assign(
              placements,
              autoPlace(state.warehouse, products, placements),
            );
          }
          state = { ...state, products, placements };
        }

        // v3 → v4: появился фулфилмент-контур. Складам из старых сохранений
        // дописываем пустой список персонала, чтобы экран «Склад и персонал»
        // открывался в рабочем виде, а не как незаполненная заглушка.
        if (version < 4) {
          const withStaff = (w: Warehouse): Warehouse =>
            w.staff ? w : { ...w, staff: seedStaff() };
          state = {
            ...state,
            warehouse: state.warehouse ? withStaff(state.warehouse) : state.warehouse,
            otherWarehouses: (state.otherWarehouses ?? []).map(withStaff),
          };
        }

        // v4 → v5: категории стали редактируемыми и переехали в стор; складам
        // из старых сохранений дописываем стартовый список.
        if (version < 5) {
          state = {
            ...state,
            categories: (state.categories as string[]) ?? [...PRODUCT_CATEGORIES],
          };
        }

        // v5 → v6: роль переехала из отдельного поля `currentRole` в сессию
        // (п.0.5). Форма данных теперь та же, что будет у настоящего логина;
        // сам вход с паролем по-прежнему не появился.
        if (version < 6) {
          const role = (state.currentRole as UserRole) ?? "warehouse";
          const warehouseId = (state.warehouse as Warehouse | undefined)?.id ?? "";
          const { currentRole: _dropped, ...rest } = state;
          state = { ...rest, session: makeSession(role, warehouseId) };
        }

        // v6 → v7: наборы убраны из продукта. Выкидываем и сам список, и
        // ссылку `kitId` в заявках — иначе на экране сборки осталась бы
        // подзадача, ведущая в никуда.
        if (version < 7) {
          const { kits: _kits, ...rest } = state;
          const requests = Array.isArray(rest.requests) ? rest.requests : [];
          state = {
            ...rest,
            requests: requests.map((r) => {
              const { kitId: _kitId, ...req } = r as Record<string, unknown>;
              return req;
            }),
          };
        }

        // v7 → v8: наклейка научилась ориентации, типу кода и логотипу, а доля
        // под код перестала быть «долей под QR». Старые шаблоны — вертикальные
        // с QR: ровно то, чем они и были.
        if (version < 8) {
          const list = Array.isArray(state.labelTemplates)
            ? (state.labelTemplates as Record<string, unknown>[])
            : [];
          state = {
            ...state,
            labelTemplates: list.map((tpl) => {
              const { qrScale, ...rest } = tpl;
              return {
                ...rest,
                layout: rest.layout ?? "vertical",
                codeType: rest.codeType ?? "qr",
                codeScale:
                  typeof rest.codeScale === "number"
                    ? rest.codeScale
                    : typeof qrScale === "number"
                      ? qrScale
                      : 0.6,
              };
            }),
          };
        }

        return state;
      },
      /**
       * Шов между хранилищем и приложением (п.0.4): всё, что пришло из
       * localStorage, проходит проверку формы. Испорченный домен теряет свои
       * битые записи, а не роняет приложение целиком — завтра здесь же
       * встретится первый неожиданный ответ настоящего backend.
       */
      merge: (persisted, current) => ({
        ...current,
        ...sanitizeDomains(persisted as Record<string, unknown>),
      }),
      // Сохраняем только доменные данные. Транзиентное (инструмент, выделение,
      // буфер, зум/пан, диалоги, поиск, экран) — не персистим.
      partialize: (s) => ({
        warehouse: s.warehouse,
        otherWarehouses: s.otherWarehouses,
        activeFloorId: s.activeFloorId,
        products: s.products,
        placements: s.placements,
        categories: s.categories,
        categoryFields: s.categoryFields,
        fieldValues: s.fieldValues,
        templates: s.templates,
        layoutTemplates: s.layoutTemplates,
        account: s.account,
        profile: s.profile,
        seenHints: s.seenHints,
        addressing: s.addressing,
        // Фулфилмент-контур. Новое доменное поле нужно добавлять сюда явно —
        // иначе оно просто не переживёт перезагрузку страницы.
        expectedShipments: s.expectedShipments,
        receivingEvents: s.receivingEvents,
        boxes: s.boxes,
        pallets: s.pallets,
        boxSeq: s.boxSeq,
        palletSeq: s.palletSeq,
        requests: s.requests,
        shipments: s.shipments,
        session: s.session,
        integrations: s.integrations,
        labelTemplates: s.labelTemplates,
      }),
    },
  ),
);

// Пишем историю подпиской — см. installHistory.
installHistory(useEditor);

// Доступ к стору из консоли в дев-режиме: сценарии редактора (вставка в
// выбранное место, нумерация рядов, адресация) проверяются на реальном плане
// вызовом действий, а не долгой ручной пантомимой мышью. В сборку не попадает.
if (import.meta.env.DEV) {
  (window as unknown as { __uklad: typeof useEditor }).__uklad = useEditor;
}

// Схема адресации могла восстановиться из хранилища — прокидываем её в address.ts,
// иначе адреса форматировались бы по значениям по умолчанию.
setAddressingConfig(useEditor.getState().addressing);

// Сессия создаётся до того, как склад собран, — привязываем её к активному
// складу на старте (и после миграции старых сохранений).
useEditor.setState((s) =>
  s.session.user.warehouseId === s.warehouse.id
    ? {}
    : {
        session: {
          ...s.session,
          user: { ...s.session.user, warehouseId: s.warehouse.id },
        },
      },
);

// Демо-раздача применяется только при первом запуске. Если состояние уже
// восстановлено из localStorage — оставляем данные пользователя как есть.
if (!HAD_PERSISTED)
  useEditor.setState((s) => {
    const floor = s.warehouse.floors[0];
    // Раскладываем каталог по складским правилам (категория → своя зона,
    // тяжёлое вниз, товар в самую тесную подходящую ячейку), а не по таблице
    // фиксированных адресов: она разъезжалась при любой правке плана.
    const placements = autoPlace(s.warehouse, s.products, {});

    const fieldValues: Record<string, string> = {};
    for (const fv of SEED_FIELD_VALUES) {
      const prod = s.products.find((p) => p.sku === fv.sku);
      const field = s.categoryFields.find(
        (f) => f.category === prod?.category && f.name === fv.field,
      );
      if (prod && field) fieldValues[fieldValueKey(prod.id, field.id)] = fv.value;
    }

    return { activeFloorId: floor.id, placements, fieldValues };
  });

// История работы склада — тоже только при первом запуске: поставки, приёмки,
// тара, заявки и рейсы за последние два месяца (п.8). Без неё аналитика,
// задания и документы открываются пустыми, и оценить их невозможно.
if (!HAD_PERSISTED) {
  const s = useEditor.getState();
  useEditor.setState(seedHistory(s.warehouse, s.products, s.placements));
  // История правок не должна начинаться со снимка «до посева»: демо-данные —
  // это стартовое состояние, а не правка пользователя.
  useEditor.setState({ past: [], future: [] });
}
