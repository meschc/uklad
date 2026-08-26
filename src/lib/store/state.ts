import type { StateCreator } from "zustand";
import type {
  Account,
  AddressingConfig,
  AppView,
  Box,
  CategoryField,
  CellAddress,
  Discrepancy,
  ExpectedShipment,
  Shipment,
  FieldType,
  Floor,
  FulfillmentRequest,
  LabelTemplate,
  Pallet,
  ReceivingEvent,
  RequestStatus,
  Session,
  ShipmentSource,
  ShipmentStatus,
  StaffMember,
  UserRole,
  LayoutTemplate,
  ModuleType,
  PlacedModule,
  Product,
  Partner,
  ProductCategory,
  Profile,
  RowConfig,
  RowProposal,
  ShelfTemplate,
  Tool,
  ViewMode,
  Warehouse,
  WarehouseKind,
  WarehouseSpec,
  XY,
} from "../types";
import type { IntegrationConfig } from "../integrations";
import type { HistorySnapshot } from "./history.slice";

/**
 * Форма стора, собранная из срезов (slices pattern). Каждый срез объявляет свой
 * кусок состояния и действий здесь же рядом с реализацией; `EditorState` — их
 * пересечение. Разбиение чисто структурное: стор остаётся одним объектом, любой
 * срез видит и правит соседние поля через общий `set`/`get`.
 */

/** Тип создателя среза: общее состояние + persist-мутатор. */
export type SliceCreator<T> = StateCreator<
  EditorState,
  [["zustand/persist", unknown]],
  [],
  T
>;

/**
 * Конфликт «на полке товар». Возникает, когда правка плана уничтожает ячейки,
 * в которых лежит товар. Это не геометрическая проверка, а предупреждение:
 * решает пользователь.
 *
 * `commit` — замыкание с самой операцией. Хранить функцию в состоянии проще,
 * чем описывать каждую правку плана отдельным сериализуемым типом.
 */
export interface GoodsConflict {
  /** Ключ i18n заголовка алерта (что за операция) + подстановки. */
  titleKey: string;
  titleVars?: Record<string, string | number>;
  /** Товары, которые потеряют своё место. */
  productIds: string[];
  commit: () => void;
}

// --- Аккаунт, профиль, склады (ТЗ, разд. 3.1–3.4) ----------------------------

export interface AccountSlice {
  /** Текущий экран приложения. Старт — личный кабинет. */
  appView: AppView;
  /** Аккаунт: личный или компании (ТЗ, разд. 3.2). */
  account: Account;
  /** Настройки профиля: имя, тема, язык (ТЗ, разд. 3.3). */
  profile: Profile;
  warehouse: Warehouse;
  /** Неактивные склады. Активный — `warehouse`; всегда активен ровно один. */
  otherWarehouses: Warehouse[];

  /** Все склады аккаунта, активный первым (для списка в кабинете). */
  allWarehouses: () => Warehouse[];

  goToDashboard: () => void;
  goToProfile: () => void;
  goToEditor: () => void;
  /** Открыть произвольный экран приложения — из бокового рельса навигации. */
  goToView: (view: AppView) => void;
  /** Выход из аккаунта: экран входа/регистрации. Данные склада не трогаем
   *  (авторизации в прототипе нет — это условный «выход»). */
  goToLogin: () => void;
  /** Открыть склад в редакторе: делает его активным (свапом), сбрасывает вид. */
  openWarehouse: (id: string) => void;
  updateProfile: (patch: Partial<Profile>) => void;
  /** Правка данных аккаунта (напр. название компании). */
  updateAccount: (patch: Partial<Account>) => void;

  /** Создать пустой склад (в список неактивных). Возвращает id. */
  createWarehouse: (
    name: string,
    kind: WarehouseKind,
    address: string,
    coords?: { lat?: number; lng?: number },
  ) => string;
  /** Переименовать / сменить тип / адрес — активного или любого из списка. */
  updateWarehouse: (
    id: string,
    patch: Partial<
      Pick<
        Warehouse,
        "name" | "kind" | "address" | "lat" | "lng" | "storageRatePerCell"
      >
    >,
  ) => void;
  /** Удалить склад. Нельзя удалить последний; размещения на нём — очищаются. */
  deleteWarehouse: (id: string) => void;
}

// --- Этажи / тиражирование (ТЗ, разд. 3.5) -----------------------------------

export interface FloorsSlice {
  activeFloorId: string;
  activeFloor: () => Floor;
  setActiveFloor: (id: string) => void;
  duplicateFloor: (id: string) => string;
  deleteFloor: (id: string) => void;
  /** Переставить этаж на позицию выше (-1) или ниже (+1). */
  moveFloor: (id: string, dir: -1 | 1) => void;
  /** Поставить этаж на позицию pos (1-based) — номер этажа = позиция. */
  setFloorPosition: (id: string, pos: number) => void;
  /** Собственный номер этажа в адресе (любой, не привязан к позиции). */
  setFloorNumber: (id: string, n: number | undefined) => void;
  replicateActiveFloor: (totalCount: number) => void;
  /**
   * Связать/развязать этаж с первым («основным блоком»). Связанный этаж —
   * алиас: зеркалит раскладку первого этажа, правки общие. Разрыв связи
   * материализует независимую копию текущего зеркала.
   */
  toggleFloorLink: (id: string) => void;
}

// --- Номенклатура и доп.поля (ТЗ, разд. 2.5, 3.8) ----------------------------

export interface CatalogSlice {
  /** Номенклатура (ТЗ, разд. 2.5). */
  products: Product[];
  /**
   * Поисковый запрос по товарам. Живёт в сторе, а не в таблице: искать можно
   * и из 3D, но результат всегда показывается в таблице (ТЗ, разд. 3.6).
   */
  search: string;
  /** Список категорий склада — редактируемый (п.15). */
  categories: ProductCategory[];
  /** Доп.поля категорий (ТЗ, разд. 3.8). */
  categoryFields: CategoryField[];
  /** Значения доп.полей: ключ `productId:fieldId` → значение. */
  fieldValues: Record<string, string>;

  setSearch: (q: string) => void;
  /** Поиск из 3D: запрос + переход в таблицу (ТЗ, разд. 3.6). */
  searchInTable: (q: string) => void;

  /** Добавить поле. Имя должно быть уникальным в категории (ТЗ, разд. 4). */
  addCategoryField: (
    category: ProductCategory,
    name: string,
    type: FieldType,
    options?: string[],
  ) => {
    ok: boolean;
    errorKey?: string;
    errorVars?: Record<string, string | number>;
  };
  /** Удалить поле вместе со всеми значениями. */
  removeCategoryField: (id: string) => void;
  setFieldValue: (productId: string, fieldId: string, value: string) => void;

  /** Добавить товар вручную. Возвращает id нового товара. */
  addProduct: (p: Omit<Product, "id">) => string;
  updateProduct: (id: string, patch: Partial<Omit<Product, "id">>) => void;
  /** Удалить товар: снимаем его размещение и значения доп.полей. */
  deleteProduct: (id: string) => void;
  deleteProducts: (ids: string[]) => void;
  setProductsCategory: (ids: string[], category: ProductCategory) => void;
  setProductsPartner: (ids: string[], partnerId: string | undefined) => void;

  /** Добавить категорию. Дубликаты по имени отклоняются. */
  addCategory: (name: string) => boolean;
  /** Переименовать категорию вместе со всеми товарами и доп.полями. */
  renameCategory: (from: ProductCategory, to: string) => boolean;
  /** Удалить категорию: товары переезжают в первую оставшуюся. */
  removeCategory: (name: ProductCategory) => void;
  importProducts: (items: Omit<Product, "id">[]) => void;
}

// --- Размещение товара и конфликты (ТЗ, разд. 3.6, 4) ------------------------

export interface PlacementSlice {
  /** Размещение: productId → адрес ячейки. Товар лежит максимум в одной ячейке. */
  placements: Record<string, CellAddress>;
  /** Висящий вопрос «на полке товар, как поступить?» (ТЗ, разд. 4). */
  pendingConflict: GoodsConflict | null;
  /** Итог переноса — чтобы не потерять товары молча. */
  conflictResult: { moved: string[]; failed: string[] } | null;

  placeProduct: (productId: string, addr: CellAddress) => void;
  clearPlacement: (productId: string) => void;
  clearPlacements: (ids: string[]) => void;
  /** Пристроить товары в свободные подходящие ячейки. Возвращает неудачи. */
  relocateProducts: (productIds: string[]) => string[];

  resolveConflict: (how: "unplace" | "relocate") => void;
  cancelConflict: () => void;
}

// --- Модули, выделение, буфер обмена ------------------------------------------

export interface ModulesSlice {
  tool: Tool;
  selection: string[];
  /** Буфер обмена модулей (копировать/вставить между этажами). */
  clipboard: PlacedModule[];
  /**
   * Явно указанная точка вставки: клик по пустому месту холста. Без неё
   * «вставить сюда» работало бы только поверх существующего модуля.
   */
  pasteAnchor: XY | null;

  setTool: (tool: Tool) => void;
  select: (ids: string[]) => void;
  toggleSelect: (id: string, additive: boolean) => void;
  clearSelection: () => void;

  addModule: (
    type: ModuleType,
    x: number,
    y: number,
    size?: { w: number; h: number },
  ) => string;
  /** Несколько модулей одним шагом истории (штамп шаблона раскладки, #38). */
  addModules: (
    specs: { type: ModuleType; x: number; y: number; w: number; h: number }[],
  ) => string[];
  updateModule: (id: string, patch: Partial<PlacedModule>) => void;
  setModuleRect: (
    id: string,
    rect: { x: number; y: number; w: number; h: number },
  ) => void;
  moveSelection: (dx: number, dy: number) => void;
  rotateModule: (id: string) => void;
  rotateSelection: () => void;
  deleteSelection: () => void;

  copySelection: () => void;
  cutSelection: () => void;
  /** `at` — клетка, в которую лечь левым верхним углом. Без неё — каскад. */
  pasteClipboard: (at?: XY) => void;
  setPasteAnchor: (cell: XY | null) => void;
  duplicateSelection: () => void;
  /** Клонировать выделение на месте (для Alt/Cmd-перетаскивания) → id копий. */
  cloneSelectionInPlace: () => string[];
  /**
   * Показать ячейку на плане: открыть 2D-план нужного этажа, выделить секцию
   * и раскрыть её полку. Возвращает false, если адрес больше не существует.
   */
  revealOnPlan: (addr: CellAddress) => boolean;
}

// --- Полки, ячейки, библиотеки шаблонов (ТЗ, разд. 2.3) ----------------------

export interface ShelvesSlice {
  /** Раскрытая полка секции (для 2D-вида полки в инспекторе/на плане). */
  activeShelf: { moduleId: string; index: number } | null;
  /** Библиотека шаблонов раскладок полок/ячеек (ТЗ, разд. 2.3). */
  templates: ShelfTemplate[];
  /** Библиотека шаблонов раскладки модулей — группа секций/проходов (#38). */
  layoutTemplates: LayoutTemplate[];
  /** Выбранный для штампа шаблон раскладки: план ждёт клик по месту. Транзиент. */
  stampTemplateId: string | null;

  setShelfCount: (id: string, count: number) => void;
  setShelfCells: (id: string, index: number, cells: number) => void;
  applyShelvesToSelection: (cells: number[]) => void;
  setActiveShelf: (moduleId: string, index: number) => void;
  clearActiveShelf: () => void;
  /** Задать/снять собственный номер полки внутри секции. */
  setShelfNumber: (
    moduleId: string,
    index: number,
    number: number | undefined,
  ) => void;
  /**
   * Приоритет отбора и доступность полки (п.10.2). `undefined` в приоритете —
   * вернуть обычное значение; `pickable: false` — исключить из автоподбора,
   * не трогая то, что уже лежит.
   */
  setShelfPicking: (
    moduleId: string,
    index: number,
    patch: { pickPriority?: number | undefined; pickable?: boolean },
  ) => void;

  addTemplate: (cells: number[], name?: string) => string;
  removeTemplate: (id: string) => void;
  applyTemplateToSelection: (templateId: string) => void;

  /** Сохранить текущее выделение как шаблон раскладки. "" если выделение пусто. */
  addLayoutTemplate: (name?: string) => string;
  removeLayoutTemplate: (id: string) => void;
  setStampTemplate: (id: string | null) => void;
  /** Поставить шаблон: левый верхний угол габарита группы в клетку `at`. */
  stampLayoutTemplate: (id: string, at: XY) => void;
}

// --- Ряды, адресация, автонумерация (ТЗ, разд. 2.1) --------------------------

export interface RowsSlice {
  /** Настройки адресации склада (уровни, направление полок, разделитель). */
  addressing: AddressingConfig;
  /**
   * Предложение «продолжить ряды по образцу»: возникает после закрепления ряда,
   * если на этаже есть такие же по форме нераспределённые группы секций.
   * Состояние временное — в persist не попадает.
   */
  rowProposal: RowProposal | null;

  updateAddressing: (patch: Partial<AddressingConfig>) => void;
  /** Проставить номера рядов по подтверждённой пользователем группировке. */
  applyRows: (rows: string[][]) => void;
  setModuleRow: (id: string, row: number | undefined) => void;
  /**
   * Закрепить ряд за всем выделением: «вот это — ряд N». Остальные ряды
   * пересчитаются вокруг этого якоря автоматически.
   */
  setRowForSelection: (row: number | undefined) => void;
  setRowConfig: (row: number, patch: Partial<Omit<RowConfig, "number">>) => void;
  /**
   * Клонировать ряд целиком: копия всех его секций встаёт параллельно рядом
   * и получает следующий номер ряда по направлению нумерации.
   */
  cloneRow: (row: number, side?: "before" | "after") => void;
  /** Сбросить ручные номера секций ряда — вернуть авто-адресацию (п.4). */
  resetRowNumbers: (row: number) => void;
  /** Пересчитать ряды этажа по геометрии от закреплённого якоря. */
  renumberFloorRows: () => number;
  toggleRowProposal: (index: number) => void;
  applyRowProposal: () => void;
  dismissRowProposal: () => void;

  /** Задать/снять собственный номер секции в адресе (ТЗ, разд. 2.1). */
  setModuleNumber: (id: string, number: number | undefined) => void;
  /**
   * Пронумеровать секции активного этажа: слева от прохода нечёт, справа чёт.
   * Ручные номера сохраняются.
   */
  autoNumberFloor: () => { changed: number; keptManual: number };
}

// --- Вид: режим экрана, камера, тосты ----------------------------------------

export interface ViewSlice {
  /** Активный экран склада (ТЗ, разд. 3.5–3.7). */
  mode: ViewMode;
  zoom: number;
  pan: { x: number; y: number };
  /** Транзиентное уведомление: локализуется в UI по ключу + переменным. */
  toast: {
    id: number;
    key: string;
    vars?: Record<string, string | number>;
  } | null;

  setMode: (mode: ViewMode) => void;
  setZoom: (zoom: number) => void;
  setView: (zoom: number, pan: { x: number; y: number }) => void;
  setPan: (pan: { x: number; y: number }) => void;
  showToast: (key: string, vars?: Record<string, string | number>) => void;
}

// --- Разовые подсказки онбординга --------------------------------------------

export interface PrintSlice {
  /** Открыт ли предпросмотр печати плана (п.6). */
  printPreviewOpen: boolean;
  setPrintPreview: (open: boolean) => void;
}

export interface OnboardingSlice {
  /**
   * Какие подсказки уже показывали (сохраняется), и какая висит сейчас
   * (транзиентная). Механика редактора хорошая, но неочевидная — подсказываем
   * в момент первого столкновения, а не туром в начале.
   */
  seenHints: string[];
  activeHint: string | null;
  /** Показать подсказку, если её ещё не видели и сейчас ничего не висит. */
  showHint: (key: string) => void;
  /** Закрыть подсказку и запомнить, что её уже видели. */
  dismissHint: () => void;
  resetHints: () => void;
}

// --- История изменений (отмена/повтор) ---------------------------------------

export interface HistorySlice {
  /** История изменений для отмены/повтора. Не сохраняется между сессиями. */
  past: HistorySnapshot[];
  future: HistorySnapshot[];
  undo: () => void;
  redo: () => void;
}

// --- Фулфилмент: ожидаемые поставки, приёмка, коробки, паллеты ---------------

/** Что оператор передаёт в `receiveProduct` — один подтверждённый факт приёмки. */
export interface ReceiveInput {
  productId: string;
  qty: number;
  boxId: string;
  shipmentId?: string;
  lineId?: string;
  staffId?: string;
  /** Проставляется, только если оператор осознанно записал расхождение. */
  discrepancy?: Discrepancy;
}

export interface FulfillmentSlice {
  expectedShipments: ExpectedShipment[];
  receivingEvents: ReceivingEvent[];
  boxes: Box[];
  pallets: Pallet[];
  /** Счётчики ярлыков: номер печатается на коробке/паллете и не переиспользуется. */
  boxSeq: number;
  palletSeq: number;

  /** Создать ожидаемую поставку. Возвращает id. */
  createExpectedShipment: (
    source: ShipmentSource,
    lines: { productId: string; expectedQty: number }[],
    title?: string,
    opts?: { crossDock?: boolean },
  ) => string;
  /** Кроссдокинг: товар этой поставки на полку не встаёт (п.10.1). */
  setCrossDock: (id: string, on: boolean) => void;
  setShipmentStatus: (id: string, status: ShipmentStatus) => void;
  /** Завершить поставку — по факту набора всех строк или досрочно. */
  closeShipment: (id: string) => void;

  /**
   * Принять позицию: дописать строку в коробку, поднять `receivedQty` строки
   * поставки и записать `ReceivingEvent` (с расхождением, если оператор его
   * подтвердил). Возвращает id события.
   */
  receiveProduct: (input: ReceiveInput) => string;

  /** Новая коробка со свежим ярлыком Code128. Возвращает её. */
  createBox: () => Box;
  /** Поставить коробку в ячейку. */
  placeBox: (boxId: string, addr: CellAddress) => void;
  createPallet: () => Pallet;
  attachBoxToPallet: (boxId: string, palletId: string) => void;
  /** Снять единицы товара с коробки (сборка). Возвращает, сколько сняли. */
  removeFromBox: (boxId: string, productId: string, qty: number) => number;
}

// --- Заявки продавца и роль пользователя -------------------------------------

export interface RequestsSlice {
  requests: FulfillmentRequest[];
  /** Отгруженные рейсы: журнал вывоза для склада и продавца. */
  shipments: Shipment[];

  /** Одна заявка. Возвращает id. */
  createRequest: (
    input: Omit<
      FulfillmentRequest,
      "id" | "status" | "createdAt" | "updatedAt"
    >,
  ) => string;
  /** Пакет заявок из импорта: общая дата машины на весь пакет. */
  createRequests: (
    items: {
      productId: string;
      qty: number;
      note?: string;
      vehicle?: string;
    }[],
    truckDate?: number,
  ) => string[];
  /**
   * Дропшиппинг (п.10.1): забронировать заявку под ещё не приехавшую поставку.
   * Возвращает id поставки или null, если бронировать не под что.
   */
  reserveRequest: (id: string) => string | null;
  /** Снять бронь (заявку отменили или закрыли иначе). */
  releaseReservation: (id: string) => void;
  /**
   * Кроссдокинг: принятый товар раздаётся ждущим заявкам, минуя полку.
   * Возвращает, сколько единиц ушло в заявки (остальное — на склад как обычно).
   */
  applyCrossDock: (
    productId: string,
    qty: number,
    shipmentId?: string,
  ) => number;
  updateRequestStatus: (id: string, status: RequestStatus) => void;
  /** Взять заявку в работу (экран «Сборка»): статус + отметка времени. */
  startPicking: (id: string) => void;
  /**
   * Отметить собранную единицу и списать её с места. Возвращает, сколько
   * собрано всего по заявке.
   */
  recordPick: (id: string, productId: string, addr: CellAddress) => number;
  /** Закрыть заявку: полностью или частично (собрали меньше запрошенного). */
  completeRequest: (id: string, partial?: boolean) => void;
  /**
   * Отгрузить рейс: собранные заявки одного назначения уезжают одной машиной.
   * Возвращает id рейса (или null, если отгружать нечего).
   */
  shipRequests: (
    requestIds: string[],
    info?: { vehicle?: string; staffId?: string },
  ) => string | null;
}

// --- Сессия и наборы -----------------------------------------------------------

export interface SessionSlice {
  /**
   * Кто сейчас работает. Роль читается ТОЛЬКО отсюда (`selectRole`) — отдельного
   * поля `currentRole` больше нет, чтобы источник правды был один.
   */
  session: Session;
  setRole: (role: UserRole) => void;
}

// --- Персонал склада ----------------------------------------------------------

export interface LabelsSlice {
  /** Сохранённые шаблоны наклеек (п.6). */
  labelTemplates: LabelTemplate[];
  /**
   * Сохранить шаблон: с `id` — перезаписать существующий, без него — создать
   * новый. Возвращает id, чтобы экран сразу выбрал сохранённый шаблон.
   */
  saveLabelTemplate: (
    tpl: Omit<LabelTemplate, "id" | "createdAt"> & { id?: string },
  ) => string;
  removeLabelTemplate: (id: string) => void;
}

export interface IntegrationsSlice {
  /** Подключения к внешним системам: id интеграции → настройки (п.22). */
  integrations: Record<string, IntegrationConfig>;
  updateIntegration: (id: string, patch: IntegrationConfig) => void;
}

export interface StaffSlice {
  /** Добавить сотрудника активного склада. Возвращает id. */
  addStaffMember: (member: Omit<StaffMember, "id">) => string;
  updateStaffMember: (id: string, patch: Partial<Omit<StaffMember, "id">>) => void;
  removeStaffMember: (id: string) => void;
  /** Контакты склада: телефон, email, ответственное лицо. */
  updateWarehouseContacts: (
    id: string,
    patch: Pick<Warehouse, "phone" | "email" | "contactPerson">,
  ) => void;
  /** Паспорт склада: режим работы, условия хранения, пожарная безопасность. */
  updateWarehouseSpec: (id: string, patch: Partial<WarehouseSpec>) => void;

  /** Ответственное лицо склада — карточка по шаблону сотрудника (п.24). */
  updateManager: (patch: Partial<Omit<StaffMember, "id">>) => void;
  /** Партнёры-продавцы склада (п.15). */
  addPartner: (partner: Omit<Partner, "id">) => string;
  updatePartner: (id: string, patch: Partial<Omit<Partner, "id">>) => void;
  removePartner: (id: string) => void;
}

export type EditorState = AccountSlice &
  SessionSlice &
  IntegrationsSlice &
  LabelsSlice &
  FulfillmentSlice &
  RequestsSlice &
  StaffSlice &
  FloorsSlice &
  CatalogSlice &
  PlacementSlice &
  ModulesSlice &
  ShelvesSlice &
  RowsSlice &
  ViewSlice &
  PrintSlice &
  OnboardingSlice &
  HistorySlice;
