# Дизайн-система «Уклада» — спецификация для Figma

Источник истины — код: `src/index.css` (токены-переменные), `tailwind.config.js`
(шкалы) и `src/components/ui/*` (примитивы). Этот документ + `design-tokens.json`
нужны, чтобы собрать в Figma библиотеку, которая совпадает с кодом один в один,
и дальше держать их синхронными.

## Как перенести токены в Figma

1. Плагин **Tokens Studio for Figma** → Import → `docs/design/design-tokens.json`.
2. Наборы: `color/light`, `color/dark` — два режима (Figma Variables → Modes),
   `radius`, `size`, `spacing`, `typography`.
3. В Figma создать Variable Collection «Уклад» с режимами **Light / Dark** —
   имена переменных совпадают с CSS: `background`, `foreground`, `primary`,
   `muted`, `border`, `ring`, `destructive`, `m-section`, `canvas-bg` и т. д.
4. После правок в `index.css` перегенерировать файл: `npm run tokens`.

## Семантика цвета

Цвета названы по роли, а не по оттенку — это уже семантические токены:

| Токен | Роль |
|---|---|
| `background` / `foreground` | фон страницы и основной текст |
| `card` / `card-foreground` | поверхность карточки, панели, диалога |
| `popover` | всплывающие слои (меню, тултип) |
| `primary` | основное действие, активный пункт, выделение |
| `secondary` | второстепенная заливка |
| `muted` / `muted-foreground` | приглушённый фон и подписи |
| `accent` | ховер-подсветка строк и пунктов |
| `destructive` | удаление, ошибка, «не влезает» |
| `border` / `input` / `ring` | контуры, поля, фокус |
| `canvas-bg`, `grid-minor`, `grid-major` | холст плана и сетка |
| `floor`, `floor-edge` | плита пола (проход = пол) |
| `m-section`, `m-stairs`, `m-elevator` (+ `-fg`) | типы модулей плана |

Статусные цвета вне переменных (используются классами Tailwind):
успех — `emerald-500`, предупреждение/расхождение — `amber-500`,
ошибка — `destructive`.

## Шкала скруглений

`--radius: 10px` — база. Ступени: `sm 6` · `DEFAULT 8` · `md 8` · `lg 10` ·
`xl 12` · `2xl 16` · `full`.

Правило вложения: **внутренний радиус = внешний − отступ**. Контейнер `rounded-lg`
(10) с `p-0.5` (2) → вложенный элемент `rounded-md` (8).

## Высоты контролов (главное правило)

Одна строка интерфейса — одна высота. Только три ступени:

| Ступень | Высота | Кто использует |
|---|---|---|
| `sm` | **32px** | `Button size="sm"`, `Input` по умолчанию, `Segmented size="sm"`, иконка-кнопка `icon-sm` |
| `md` | **36px** | `Button` (default), `Segmented size="md"`, поля форм с `className="h-9"`, `<select>` |
| `lg` | **40px** | `Button size="lg"` |
| особое | **44px** | `ScanField` — под палец и сканер |

Если в одной полке стоят кнопка, поле и переключатель — они обязаны быть одной
ступени. В Figma это варианты компонента `Control / Size = sm | md | lg`.

## Компоненты и их варианты

### Button (`src/components/ui/button.tsx`)

- **variant**: `default` · `destructive` · `outline` · `secondary` · `ghost` · `link`
- **size**: `sm (32)` · `default (36)` · `lg (40)` · `icon (36×36)` · `icon-sm (32×32)`
- **состояния**: rest · hover · focus-visible (ring 2px `ring` + offset 1px) ·
  active (scale 0.97) · disabled (opacity 0.5, без событий)
- иконка внутри — 16px, зазор 8px, скругление по размеру (`md` для sm)

### Input (`ui/input.tsx`)

- высота 32 (по умолчанию) или 36 (`h-9`), радиус `md`, `border: input`,
  тень `shadow-sm`
- состояния: rest · focus (ring 2px) · disabled · **error** (`border-destructive`
  + подпись 11px `destructive` под полем)
- варианты содержимого: текст · моно (адрес/артикул) · числовой (табличные цифры,
  спиннеры скрыты)

### Segmented (`ui/segmented.tsx`)

Единственный вид «кнопок-табов»: роль, режим просмотра, фильтр, тема, язык.

- контейнер: `bg-muted`, радиус `lg`, `p-0.5`, высота 32/36
- сегмент: активный — `bg-background` + `shadow-sm`, неактивный —
  `muted-foreground`, ховер → `foreground`
- **grow** — сегменты делят ширину поровну (контрол во всю строку)

### Field / Labeled

Подпись — `typography.label` (11px, 600, uppercase, `muted-foreground`),
зазор 6px до контрола, ошибка — 11px `destructive` под контролом.

### Card / Panel

`bg-card`, `border`, радиус `xl` (12), тень `shadow-sm`; заголовок секции —
`titleSection` (14/600). Плавающие панели редактора — радиус `xl`, `shadow-lg`.

### Dialog

Backdrop `black/40` + `backdrop-blur-[1px]`, карточка `max-w-lg`, радиус `xl`,
`shadow-2xl`; шапка и подвал разделены `border`, подвал — `bg-muted/30`.
Анимации: `animate-fade-in` (backdrop), `animate-scale-in` (карточка).

### Alert (единый паттерн предупреждения)

Шапка со штриховкой `hazard-stripes` (полосы прижаты к правому краю и гаснут к
центру) + `bg-amber-500/10`, иконка `AlertTriangle`. Два **равноценных** действия
рядом — «Перепроверить» / «Записать как есть»: интерфейс не решает за человека.
Ошибка-факт (например «разместить не удалось») — тот же паттерн + кнопка
«Понятно».

### Toast, Badge, Table

- Toast: `popover`, радиус `lg`, `shadow-lg`, появление `animate-pop`
- Badge/чип: 11px, радиус `sm`/`DEFAULT`, `bg-muted` либо `bg-primary/10 text-primary`
- Таблица: строка 32–36px, шапка `bg-muted/50` 12px, ховер строки `accent/40`,
  выбранная строка `primary/5`, моно-колонки для артикула, адреса и штрихкода

## Иконки

`lucide-react`, штрих 2px. Размеры: 14px (в тексте и мелких кнопках), 16px
(кнопки и поля), 18–20px (навигация и пустые состояния). В Figma — библиотека
Lucide, тот же набор имён.

## Тёмная тема

Не отдельная библиотека, а второй режим переменных: любой компонент собран на
семантических токенах и переключается вместе с коллекцией.

## Что синхронизировать при правках

| Изменилось в коде | Что править в Figma |
|---|---|
| `--*` в `index.css` | перегенерировать токены (`npm run tokens`) и переимпортировать |
| высоты в `button.tsx` / `segmented.tsx` | варианты `Size` у соответствующих компонентов |
| новый примитив в `ui/` | новый компонент + запись в этот файл |
