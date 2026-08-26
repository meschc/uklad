# Codemap · доменный слой (`src/lib`)

Чистые модули без React. UI импортирует их, они UI — никогда.

## types.ts — вся модель данных

```
ModuleType = "section" | "aisle" | "stairs" | "elevator"
Tool = "select" | "pan" | ModuleType
ViewMode = "2d" | "table" | "3d"
AppView = "login" | "dashboard" | "editor" | "profile"
        | "receiving" | "labels" | "documents" | "lookup" | "integrations"
        | "tasks" | "picking" | "staff" | "analytics" | "spec" | "seller"
UserRole = "warehouse" | "seller"
User { id, email, role, warehouseId, name? }
Session { user, token, startedAt }          // token — локальный мок, не JWT

PlacedModule { id, type, x, y, w, h, rotation, real{Width,Depth,Height}Cm?,
               label?, number?, row?, shelves?: ShelfConfig[] }   // x/y/w/h — КЛЕТКИ
ShelfConfig { id, cells, number?, pickPriority?, pickable? }  // меньше = ближе
Floor { id, name, modules, number?, rows?: RowConfig[], aliasOf? }
Warehouse { id, name, kind, address?, lat?, lng?, phone?, email?,
            contactPerson?, staff?: StaffMember[], spec?, partners?, manager?,
            storageRatePerCell?, floors }
CellAddress { floorId, moduleId, shelfIndex, cellIndex }          // индексы с 0
AddressingConfig { useFloor?, useRows, shelfOrder, separator, configured }
Product { id, sku, barcode, name, category, width/height/depthCm, weightKg?, url? }
CategoryField { id, category, name, type, options? }
ShelfTemplate { id, name, cells: number[] }
LayoutTemplate { id, name, modules: LayoutModuleSpec[] }

// фулфилмент
Box { id, barcode, createdAt, lines: BoxLine[], palletId?, address? }
BoxLine { productId, qty }
Pallet { id, barcode, createdAt, boxIds, address? }
ExpectedShipment { id, source, lines, createdAt, status, title?, closedAt?,
                   crossDock? }            // crossDock — минуя полку, в заявку
ExpectedShipmentLine { id, productId, expectedQty, receivedQty, reservedFor? }
ReceivingEvent { id, productId, qty, boxId, staffId?, timestamp,
                 expectedShipmentLineId?, discrepancy? }
StaffMember { id, name, role, phone?, email? }
FulfillmentRequest { id, productId, qty, targetAddress?, note?, truckDate?,
                     status, createdAt, updatedAt, startedAt?, pickedQty?,
                     partial?, vehicle?, shipmentId?, shippedAt?,
                     reservedShipmentId? }
LabelTemplate { id, name, widthMm, heightMm, layout, codeType,
                elements: LabelElement[], codeScale, note?, logoUrl?, createdAt }
LabelLayout = "vertical" | "horizontal"    // код снизу или слева
LabelCodeType = "qr" | "barcode"           // QR или Code128
LabelElement = logo|title|warehouse|seq|code|date|fragile|mark|note
WarehouseSpec { …здание (класс, площадь, высота, полы, стеллажи, паллетоместа),
                режим (часы, доки, рампа, парковка, ж/д), климат, оснащение
                (техника, WMS, связь), пожарные нормы, охрана (пост, камеры,
                СКУД), ограничения, документы (страховка, лицензии, услуги) }

MODULE_SPECS: Record<ModuleType, ModuleSpec>   // min/max стороны, defaultSize, hint
SHELF_MIN/MAX = 1/10   CELLS_MIN/MAX = 1/10   DEFAULT_SECTION_HEIGHT_CM = 200
PRODUCT_CATEGORIES = [Одежда, Электроника, Бытовая техника, Продукты,
                      Инструменты, Мебель]
```

## address.ts — адрес места хранения

```
setAddressingConfig(cfg)                  // стор синхронизирует сюда схему
floorNumber(floor, idx) -> number
rowOf(floor, moduleId) -> number
shelfNumber(mod, shelfIndex, cfg?) -> number
sectionNumber(floor, moduleId, cfg?) -> number
formatAddress(warehouse, addr, cfg?) -> string | null    // «2-19-20-3»
parseAddress(warehouse, input, cfg?) -> CellAddress | null   // обратен format
addressKey(addr) -> `${moduleId}:${shelfIndex}:${cellIndex}`
cellDimsCm(mod, shelfIndex) -> CellDims | null   // ячейки делят ДЛИННУЮ сторону
round1(n), cm(n)
```

## placement.ts — занятость и подбор ячейки

```
Occupancy = Record<cellKey, productId>
buildOccupancy(placements, boxes?) -> Occupancy    // разворачивает Box.lines
checkFit(product, cell) -> { fits, failed: FitAxis[] }
allCells(warehouse) -> CellCandidate[]
hasStorage(warehouse) -> boolean
tightestFittingCell(warehouse, product) -> CellCandidate | null
firstFreeCell(warehouse, occupancy, preferFloorId?) -> CellCandidate | null
suggestCell(warehouse, occupancy, product, opts?) -> CellCandidate | null
```

`buildOccupancy` — единственный источник занятости для тепловой карты,
`AssignDialog` и проверок конфликтов. Товар может лежать в ячейке напрямую
ИЛИ внутри коробки, у которой есть `address`. Тара без адреса (кроссдок) в
занятость не попадает — она физически не хранится.

`CellCandidate` несёт `pickPriority` и `pickable` полки: `suggestCell`
сортирует сначала по приоритету (меньше — ближе к проходу), потом по объёму,
и полностью пропускает `pickable: false`.

## numbering.ts — ряды и автонумерация

```
detectRows(floor) -> PlacedModule[][]     // линии секций, разделённые проходом
rowNumbers(floor) -> Map<moduleId, row>
rowSides(...)                             // сторона прохода (нечёт/чёт)
rowSectionNumbers(floor, row, cfg?) -> Map<moduleId, number>
findRowContinuation(floor, row) -> RowCandidate[]   // «такие же» группы
autoNumberSections(floor) -> { assigned, keptManual }
```

## barcode.ts — номера и коды

```
EAN-13 (номер товара): ean13CheckDigit, toEan13, isValidEan13, generateEan13
Code128 B (наклейки тары): code128Modules(text) -> string|null  // null, если
                 в строке кириллица — подмножество B её не кодирует
generateBoxBarcode(seq)    -> "UK-BOX-000123"
generatePalletBarcode(seq) -> "UK-PLT-000045"
cellBarcode(warehouse, addr) -> string | null      // = formatAddress
normalizeCode(raw)       -> код в верхнем регистре, «УК-» → «UK-»
parseHonestSignMock(raw) -> HonestSignScan { raw, gtin, serial, isMocked }

## qr.ts — единственный печатаемый код (п.5)

qrMatrix(value, ecc?) -> boolean[][]     // модули, true = чёрный
qrPath(matrix) -> string                 // один <path> вместо сотен <rect>
QR_QUIET_ZONE = 4

Обёртка над `qrcode-generator`. Кодировщик байтов подменён на UTF-8: штатный
режет `charCode & 0xff` и ломает кириллицу.

## documents.ts — складские документы (п.12)

DocKind = "pick" | "shipment" | "receiving"
docNumber(kind, sourceId, date) -> "РН-260820-3F7A"   // детерминированный
buildPickDoc(requests, products, warehouse, placements, boxes, sourceId)
buildShipmentDoc(shipment, requests, products)
buildReceivingDoc(shipment, events, products, warehouse, boxes)

Модель документа, без вёрстки: печатная форма — `DocumentSheet`. Формы не
выдают себя за унифицированные ТОРГ-12 / М-4 — это внутренние рабочие листы.
```

## Прочее

```
catalog.ts        buildCatalog(makeId) -> Product[]         // демо-номенклатура
autoPlace.ts      autoPlace(warehouse, products, existing) -> placements
importProducts.ts parseImportText / parseImportFile / parseRows / rowsToProducts
                  TEMPLATE_HEADERS, EXAMPLE_ROWS, IMPORT_EXAMPLE
shipmentSources.ts SHIPMENT_SOURCES, parseShipmentRows(source, matrix, products)
fulfillment.ts    stockByProduct / stockAt / groupRequestsByTarget /
                  receivingStats / pickingStats / requestStats / occupancyStats
                  freeToReserve / canReserve /
                  requestsByDay (календарь) / storageCost / staffWorkload
                  (в groupRequestsByTarget даты машин считаются только по
                  НЕзакрытым заявкам — иначе группа вечно «просрочена»)
data/             репозитории (п.0.4): productsRepository, placementRepository,
                  fulfillmentRepository, requestsRepository, staffRepository —
                  async-контракт поверх стора; guards.ts — проверки формы;
                  sanitize.ts — разбор восстановленного персиста
lookup.ts         lookup(code, data) -> товар | тара | паллета | ячейка | none
                  («Что это?»: один скан отвечает на вопрос «что это такое»)
overlap.ts        rectsOverlap, isOverlapConflict, overlappingIds
planRules.ts      floorsWithoutVerticalLink(warehouse) -> Floor[]
useScannerInput.ts useScannerInput({ onScan, enabled? })   // HID, ~50мс/символ
i18n.ts           useT() -> TFunc; translate(lang, key, vars); plural(...)
                  noOrphans() — неразрывный пробел после коротких слов
                  (вторая половина запрета висячих строк; первая — CSS)
platform.ts       IS_MAC, MOD_KEY, ALT_KEY, DEL_KEY, SHIFT_KEY, combo()
utils.ts          cn(), clamp(), uid(prefix)
```
