import type { ModuleType } from "@/lib/types";
import { cn } from "@/lib/utils";

interface GlyphProps {
  type: ModuleType;
  className?: string;
}

/**
 * Единый набор линейных иконок для типов модулей.
 * viewBox 24×24, stroke = currentColor — совместимо с sizing кнопок shadcn.
 */
export function ModuleGlyph({ type, className }: GlyphProps) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: cn("size-4", className),
  };

  switch (type) {
    case "section":
      // Стеллаж-секция: рамка с полками.
      return (
        <svg {...common}>
          <rect x="4" y="3" width="16" height="18" rx="1.5" />
          <path d="M4 9h16M4 15h16" />
        </svg>
      );
    case "aisle":
      // Проход: коридор с пунктирной осью и стрелками.
      return (
        <svg {...common}>
          <path d="M7 3v18M17 3v18" />
          <path d="M12 6v12" strokeDasharray="2 2.5" />
          <path d="M9.8 8.5 12 6.2l2.2 2.3M9.8 15.5 12 17.8l2.2-2.3" />
        </svg>
      );
    case "stairs":
      // Лестница НА ПЛАНЕ (вид сверху): марш со ступенями и стрелка подъёма.
      return (
        <svg {...common}>
          <rect x="5" y="3" width="14" height="18" rx="1.5" />
          <path d="M5 8h14M5 12h14M5 16h14" strokeWidth="1.25" />
          <path d="M12 19.5V6m0 0-1.8 1.9M12 6l1.8 1.9" strokeWidth="1.25" />
        </svg>
      );
    case "elevator":
      // Лифт: кабина со стрелками вверх/вниз.
      return (
        <svg {...common}>
          <rect x="4" y="3" width="16" height="18" rx="1.5" />
          <path d="M12 3v18" />
          <path d="M8 11 6.4 8.8 4.8 11M6.4 8.8V15" />
          <path d="m15 13 1.6 2.2 1.6-2.2M16.6 15.2V9" />
        </svg>
      );
  }
}
