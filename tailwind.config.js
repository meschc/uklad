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
      fontFamily: {
        // Golos Text и в тексте, и в заголовках. Раньше здесь стояла пара
        // Inter + Onest — латинский шрифт с дорисованной кириллицей плюс
        // второй такой же для заголовков. Golos рисовался от кириллицы, и
        // разница видна там, где её обычно и видно: в «д», «з», «ф» и в
        // плотности строчного текста.
        //
        // Заголовки и текст одним шрифтом — намеренно: разделяет их вес
        // (800–900 против 400–500) и трекинг, а не смена гарнитуры. Так
        // страница читается как один голос, а не как два.
        sans: ["Golos Text", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Golos Text", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
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
