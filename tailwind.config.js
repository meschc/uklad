/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
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
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
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
      },
      animation: {
        "fade-in": "fade-in 120ms ease-out",
        "scale-in": "scale-in 150ms cubic-bezier(0.16, 1, 0.3, 1)",
        pop: "pop 160ms cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
  plugins: [],
};
