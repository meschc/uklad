# Codemap · стор (`src/lib/store/`)

Один Zustand-стор с `persist`, собранный из срезов. Импорт снаружи —
всегда `@/lib/store`.

```
index.ts   create<EditorState>()(persist(...))  + installHistory + демо-посев
           export: useEditor, resolveFloor, fieldValueKey, FLOOR_MAX,
                   GoodsConflict, EditorState
state.ts   интерфейсы всех срезов + EditorState (их пересечение)
           SliceCreator<T> — тип создателя среза
helpers.ts mutateActiveFloor, makeModule, clampSize, cloneModules, cloneFloor,
           renumberFloors, floorSourceId, resolveFloor, goodsAt, defaultShelves,
           nameForCells, nameForLayout, fieldValueKey, FLOOR_MAX
seed.ts    seedWarehouse/B, blankWarehouse, seedProducts, seedCategoryFields,
           seedTemplates, seedStaff, seedShipments, seedAccount,
           SEED_FIELD_VALUES
```

Персист: ключ `uklad-store-v1`, version 7, `partialize` перечисляет доменные
поля явно — **новое доменное поле нужно туда добавить руками**. `merge`
прогоняет восстановленное через `lib/data/sanitize.ts`: запись неверной формы
выбрасывается с предупреждением, а не роняет приложение.

## Срезы

| Файл | Состояние | Основные действия |
|---|---|---|
| `account.slice` | `appView, account, profile, warehouse, otherWarehouses` | `goToDashboard/Profile/Editor/View/Login`, `openWarehouse`, `updateProfile/Account`, `createWarehouse`, `updateWarehouse`, `deleteWarehouse`, `allWarehouses()` |
| `floors.slice` | `activeFloorId` | `activeFloor()`, `setActiveFloor`, `duplicateFloor`, `deleteFloor`, `moveFloor`, `setFloorPosition/Number`, `replicateActiveFloor`, `toggleFloorLink` |
| `catalog.slice` | `products, search, categoryFields, fieldValues` | `addProduct`, `updateProduct`, `deleteProduct(s)`, `setProductsCategory`, `importProducts`, `addCategoryField`, `removeCategoryField`, `setFieldValue`, `setSearch`, `searchInTable` |
| `placement.slice` | `placements, pendingConflict, conflictResult` | `placeProduct`, `clearPlacement(s)`, `relocateProducts`, `resolveConflict`, `cancelConflict` |
| `modules.slice` | `tool, selection, clipboard, pasteAnchor` | `setTool`, `select`, `toggleSelect`, `addModule(s)`, `updateModule`, `setModuleRect`, `moveSelection`, `rotateModule/Selection`, `deleteSelection`, `copy/cut/paste/duplicate/cloneSelectionInPlace` |
| `shelves.slice` | `activeShelf, templates, layoutTemplates, stampTemplateId` | `setShelfCount/Cells/Number`, `setShelfPicking`, `applyShelvesToSelection`, `add/removeTemplate`, `applyTemplateToSelection`, `add/removeLayoutTemplate`, `setStampTemplate`, `stampLayoutTemplate` |
| `rows.slice` | `addressing, rowProposal` | `updateAddressing`, `applyRows`, `setModuleRow`, `setRowForSelection`, `setRowConfig`, `cloneRow`, `resetRowNumbers`, `renumberFloorRows`, `toggle/apply/dismissRowProposal`, `setModuleNumber`, `autoNumberFloor` |
| `view.slice` | `mode, zoom, pan, toast` | `setMode`, `setZoom/View/Pan`, `showToast` |
| `onboarding.slice` | `seenHints, activeHint` | `showHint`, `dismissHint`, `resetHints` |
| `history.slice` | `past, future` | `undo`, `redo`; `installHistory(store)` вешает подписку, `flushHistory()` |
| `fulfillment.slice` | `expectedShipments, receivingEvents, boxes, pallets, boxSeq, palletSeq` | `createExpectedShipment`, `setShipmentStatus`, `setCrossDock`, `closeShipment`, `receiveProduct`, `createBox`, `placeBox`, `attachBoxToPallet`, `createPallet`, `removeFromBox` |
| `requests.slice` | `requests, shipments` | `createRequest(s)`, `updateRequestStatus`, `startPicking`, `recordPick`, `completeRequest`, `shipRequests`, `reserveRequest`, `releaseReservation`, `applyCrossDock` |
| `session.slice` | `session` | `setRole`; `selectRole(s)` — единственный способ спросить роль, `makeSession(role, warehouseId)` |
| `labels.slice` | `labelTemplates` | `saveLabelTemplate` (создаёт или перезаписывает по `id`), `removeLabelTemplate` |
| `staff.slice` | (в `warehouse.staff`) | `addStaffMember`, `updateStaffMember`, `removeStaffMember` |

## Правила

- Иммутабельность: новый объект вместо мутации существующего.
- Правка активного этажа — **только** через `mutateActiveFloor` (она уводит
  запись в этаж-источник, если активный этаж — алиас).
- Многошаговые действия перечитывают `get()` на каждой итерации
  (`relocateProducts`, `receiveProduct`), иначе два товара уедут в одну ячейку.
- Групповые операции — одним `set`, иначе история разложит группу по одному.
- История пишется подпиской, не в редьюсерах; всплеск склеивается 450 мс.
- Операция, уничтожающая ячейки с товаром, сначала кладёт `pendingConflict`
  с `commit`-замыканием и ждёт ответа пользователя.
- Роль читается только через `selectRole` — поля `currentRole` больше нет.
- Экраны и срезы не ходят в `localStorage` напрямую: доступ к данным —
  через `lib/data/*Repository.ts` (см. `docs/CODEMAPS/domain.md`).
- Посев работает только при первом запуске: `seed.ts` — склады, каталог,
  паспорт, персонал и партнёры — ТРИ склада намеренно разного качества:
  активный класса B+ (на нём вся история), убитый C и образцовый A+; `seedHistory.ts` — поставки, приёмки, тара,
  заявки и рейсы за последние 70 дней (детерминированный ГПСЧ, фиксированное
  зерно). Перезагрузить демо-данные вручную — «Профиль → Демо-данные».
