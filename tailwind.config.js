/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./app/index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // Волосяные линии и подсветки — четыре роли, разбор в `src/index.css`.
        // Значение подставляется целиком, без `hsl(...)` вокруг: доля
        // прозрачности уже внутри переменной, и обёртка её бы сломала.
        hairline: "var(--hairline)",
        frame: "var(--frame)",
        stroke: {
          DEFAULT: "var(--stroke)",
          hover: "var(--stroke-hover)",
        },
        wash: "var(--wash)",
        // Складские модули — мягкая палитра (см. референсы)
        module: {
          section: "hsl(var(--m-section))",
          "section-fg": "hsl(var(--m-section-fg))",
          aisle: "hsl(var(--m-aisle))",
          "aisle-fg": "hsl(var(--m-aisle-fg))",
          stairs: "hsl(var(--m-stairs))",
          "stairs-fg": "hsl(var(--m-stairs-fg))",
          elevator: "hsl(var(--m-elevator))",
          "elevator-fg": "hsl(var(--m-elevator-fg))",
        },
      },
      // Шкала скруглений с шагом 2px от --radius (10px). Шаг равен типовому
      // отступу вложения (p-0.5 = 2px), поэтому вложенные углы получаются по
      // формуле «внутренний радиус = внешний − отступ» простым сдвигом на
      // ступень вниз: xl→lg→md→sm→DEFAULT.
      borderRadius: {
        DEFAULT: "calc(var(--radius) - 6px)", // 4px
        sm: "calc(var(--radius) - 4px)", // 6px
        md: "calc(var(--radius) - 2px)", // 8px
        lg: "var(--radius)", // 10px
        xl: "calc(var(--radius) + 2px)", // 12px
        "2xl": "calc(var(--radius) + 6px)", // 16px
      },
      // Кегли. Ключа `fontSize` здесь не было вовсе — и это не «шкала по
      // умолчанию», а две шкалы вперемешку. Tailwind давал чётный ряд
      // (12 / 14 / 16 / 18 / 20 / 24), а всё, чего в нём не хватало, набиралось
      // руками в квадратных скобках: 476 таких мест на 30 значений. Нечётные
      // ступени встали ВПЛОТНУЮ к чётным — `text-[11px]` стоял в той же роли,
      // что `text-xs` (12), а `text-[13px]` в той же, что `text-sm` (14).
      // Разница в пиксель не читается как иерархия, зато читается как небрежность.
      //
      // За основу взят кабинет: он набран именами, то есть чётным рядом, и
      // менять его — значит двигать 275 мест ради красоты числа. Ряд Tailwind
      // оставлен как есть и дополнен там, где его правда не хватало:
      //
      // `2xs` (10px) — плотный интерфейс. Ниже 12 у Tailwind нет ничего, а в
      // таблице склада нужна ступень под подписью колонки; отсюда и взялись
      // 68 ручных `text-[10px]`.
      // `5xl` и `6xl` укорочены с 48/60 до 44/56 — крупные кегли живут только
      // на витрине, там шаг между ними и так великоват, а 60px в первом экране
      // на ноутбуке уже переносил заголовок.
      //
      // Интерлиньяж вписан в ступень намеренно. Ручной `text-[11px]` не нёс
      // его вовсе — кегль менялся, а строки оставались от родителя, и это
      // чинилось потом отдельным `leading-*` (180 таких мест). Ступень,
      // которая приносит свой интерлиньяж, снимает половину из них.
      fontSize: {
        "2xs": ["10px", "14px"],
        xs: ["12px", "16px"],
        sm: ["14px", "20px"],
        base: ["16px", "24px"],
        lg: ["18px", "28px"],
        xl: ["20px", "28px"],
        "2xl": ["24px", "32px"],
        "3xl": ["30px", "36px"],
        "4xl": ["36px", "40px"],
        "5xl": ["44px", "1"],
        "6xl": ["56px", "1"],
      },
      fontFamily: {
        // Geist и в тексте, и в заголовках. До него здесь стоял Golos Text, а
        // до Golos — пара Inter + Onest. Условие к любой замене одно и то же:
        // настоящая кириллица, а не «латиница с дорисованными Я и Ж». У Geist
        // она есть — весь русский алфавит, ударение, «₽» и «№».
        //
        // Заголовки и текст одним шрифтом — намеренно: разделяет их вес и
        // трекинг, а не смена гарнитуры. Так страница читается как один голос,
        // а не как два.
        sans: ["Geist", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Geist", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      // Вес заголовка — 550, ступени между `medium` и `semibold` у Tailwind
      // нет. Начертание переменное, поэтому дробная ступень существует так же
      // честно, как круглая: 500 на крупном кегле выглядит вяло, 600 —
      // рекламно. Именованный класс, а не `font-[550]`: если вес однажды
      // поедет, он поедет в одном месте, а не в сорока пяти.
      fontWeight: {
        heading: "550",
      },
      // `tracking-tight` по умолчанию −0.025em. Подобрано −0.02em: с Geist
      // прежнее значение слипается на строчных. Ступень общая с кабинетом —
      // это и есть смысл держать её токеном.
      letterSpacing: {
        tight: "-0.02em",
      },
      // Интерлиньяж по ролям, а не по числам. До этого по витрине была
      // россыпь: 1.05, 1.08 и 1.1 на заголовках и 1.6, 1.7, 1.75 в правовых
      // документах — разные значения на одну и ту же задачу, набранные в
      // разные дни. Правило оптическое и простое: чем крупнее кегль, тем
      // теснее строки, потому что промежуток растёт вместе с буквой.
      //
      // `display` — крупные заголовки (30 px и выше). Ровно 1.0 не берём:
      // у кириллицы есть выносные вниз (у, р, д, ц, щ), на двух строках они
      // сталкиваются с верхними.
      // `title` — заголовки поменьше (24–28 px), им нужен воздух.
      // `prose` — длинный текст, который правда читают подряд: оферта,
      // политика, согласия.
      lineHeight: {
        display: "1.05",
        title: "1.1",
        prose: "1.7",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        // Модалки: мягкое проявление с лёгким приближением.
        "scale-in": {
          from: { opacity: "0", transform: "translateY(4px) scale(0.97)" },
          to: { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        // Модуль на плане: физическое «появление» при размещении/вставке.
        pop: {
          from: { opacity: "0", transform: "scale(0.9)" },
          to: { opacity: "1", transform: "scale(1)" },
        },

        /* --- Витрина. Медленные, «атмосферные» движения. --- */

        // Бесконечная лента логотипов. Сдвиг ровно на половину: в разметке
        // список продублирован, поэтому −50 % — это стык с самим собой.
        marquee: {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(-50%)" },
        },
        // Цветные пятна за первым экраном: дышат, а не мигают.
        aurora: {
          "0%, 100%": { transform: "translate3d(0,0,0) scale(1)" },
          "33%": { transform: "translate3d(6%,-4%,0) scale(1.12)" },
          "66%": { transform: "translate3d(-5%,3%,0) scale(0.94)" },
        },
        // Коробка «летит» на полку — акцент в демонстрации плана.
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        // Панель фильтров на телефоне: выезжает справа, оттуда же её и звали.
        "slide-in-right": {
          from: { transform: "translateX(100%)" },
          to: { transform: "translateX(0)" },
        },
        // Баннер cookie: выезжает снизу, оттуда же он и живёт.
        "slide-up": {
          from: { transform: "translateY(120%)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
        // Пульс метки на карте — «здесь есть свободные места».
        ping: {
          "0%": { transform: "scale(1)", opacity: "0.5" },
          "80%, 100%": { transform: "scale(2.4)", opacity: "0" },
        },
      },
      animation: {
        "fade-in": "fade-in 120ms ease-out",
        "scale-in": "scale-in 150ms cubic-bezier(0.16, 1, 0.3, 1)",
        pop: "pop 160ms cubic-bezier(0.16, 1, 0.3, 1)",
        marquee: "marquee 42s linear infinite",
        aurora: "aurora 18s ease-in-out infinite",
        float: "float 3.6s ease-in-out infinite",
        "slide-in-right": "slide-in-right 220ms cubic-bezier(0.16, 1, 0.3, 1)",
        "slide-up": "slide-up 420ms cubic-bezier(0.16, 1, 0.3, 1)",
        ping: "ping 2.4s cubic-bezier(0.16, 1, 0.3, 1) infinite",
      },
    },
  },
  plugins: [],
};
