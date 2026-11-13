import {
  Children,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { POPOVER_PANEL, popoverStyle, useAnchoredPopover } from "./popover";

/**
 * Выпадающий список дизайн-системы вместо системного `<select>`.
 *
 * Кирилл (13 ноя 2026): «почему до сих пор нет элемента дропдауна». Системный
 * список рисует браузер: своя стрелка, свой шрифт, светлое меню в тёмной теме,
 * длинное значение обрезается без многоточия. Здесь меню наше — те же радиусы,
 * высоты строк и анимация, что у остального кабинета.
 *
 * Подключается вместо `<select>` без переписывания экрана: те же `value`,
 * `<option>`/`<optgroup>` детьми и `onChange` с `e.target.value`. Так замена
 * по всему коду — переименование тега, а не новая логика в каждом месте.
 * Линтер не пропускает голый `<select>` (`eslint.config.js`).
 *
 * Меню всплывает над всем (`./popover`): не обрезается краем боковой панели,
 * при нехватке места снизу раскрывается вверх.
 */

interface Item {
  value: string;
  label: ReactNode;
  text: string;
  disabled?: boolean;
  group?: string;
}

/** Событие в форме, которую ждут обработчики от `<select>`. */
interface SelectChange {
  target: { value: string };
  currentTarget: { value: string };
}

type Size = "sm" | "md" | "lg";
const HEIGHT: Record<Size, string> = { sm: "h-8", md: "h-9", lg: "h-10" };

function textOf(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return "";
}

function collect(children: ReactNode, group?: string, out: Item[] = []): Item[] {
  Children.forEach(children, (child) => {
    if (!isValidElement<Record<string, unknown>>(child)) return;
    const props = child.props;
    if (child.type === "optgroup") {
      collect(props.children as ReactNode, String(props.label ?? ""), out);
    } else if (child.type === "option") {
      const label = props.children as ReactNode;
      out.push({
        value: String(props.value ?? textOf(label)),
        label,
        text: textOf(label),
        disabled: Boolean(props.disabled),
        group,
      });
    } else if (props.children) {
      collect(props.children as ReactNode, group, out);
    }
  });
  return out;
}

export function Select({
  value,
  onChange,
  children,
  className,
  size,
  disabled,
  id,
  title,
  "aria-label": ariaLabel,
  "aria-invalid": ariaInvalid,
}: {
  value: string | number | undefined;
  onChange?: (e: SelectChange) => void;
  children: ReactNode;
  className?: string;
  /** Высота по сетке 32 / 36 / 40. Без размера — по классу `h-*` из `className`, иначе 36. */
  size?: Size;
  disabled?: boolean;
  id?: string;
  title?: string;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
}) {
  const items = collect(children);
  const current = items.find((i) => i.value === String(value ?? "")) ?? items[0];
  const [active, setActive] = useState(0);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLUListElement>(null);
  const listId = useId();
  const pop = useAnchoredPopover(trigger, menu);
  const { open, place } = pop;
  const setOpen = (v: boolean) => (v ? pop.show() : pop.close());

  const show = () => {
    if (disabled) return;
    setActive(Math.max(0, items.indexOf(current)));
    setOpen(true);
  };
  const pick = (item: Item | undefined) => {
    if (!item || item.disabled) return;
    setOpen(false);
    trigger.current?.focus();
    if (item.value !== String(value ?? ""))
      onChange?.({ target: { value: item.value }, currentTarget: { value: item.value } });
  };

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [open, active]);

  const step = (from: number, dir: 1 | -1) => {
    for (let i = from + dir; i >= 0 && i < items.length; i += dir) if (!items[i].disabled) return i;
    return from;
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        show();
      }
      return;
    }
    if (e.key === "Escape" || e.key === "Tab") {
      if (e.key === "Escape") e.preventDefault();
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => step(a, 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => step(a, -1));
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      setActive(e.key === "Home" ? step(-1, 1) : step(items.length, -1));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pick(items[active]);
    } else if (e.key.length === 1) {
      // Набор буквы — к первому пункту на неё, как в системном списке.
      const k = e.key.toLowerCase();
      const i = items.findIndex((it, n) => n > active && it.text.toLowerCase().startsWith(k));
      const j = i >= 0 ? i : items.findIndex((it) => it.text.toLowerCase().startsWith(k));
      if (j >= 0) setActive(j);
    }
  };

  const hasHeight = /(^|\s)h-\d/.test(className ?? "");

  return (
    <>
      <button
        ref={trigger}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid}
        title={title ?? current?.text}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKey}
        className={cn(
          "flex min-w-0 cursor-pointer items-center justify-between gap-2 rounded-md border border-input bg-background px-2.5 text-left text-sm shadow-sm transition-colors duration-fast",
          "hover:border-foreground/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          "aria-[invalid=true]:border-destructive",
          open && "border-primary ring-2 ring-ring/30",
          size ? HEIGHT[size] : !hasHeight && HEIGHT.md,
          className,
        )}
      >
        <span className="min-w-0 truncate">{current?.label ?? "—"}</span>
        <ChevronDown
          aria-hidden
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-base ease-out-soft",
            open && "rotate-180",
          )}
        />
      </button>
      {open &&
        place &&
        createPortal(
          <ul
            ref={menu}
            id={listId}
            role="listbox"
            aria-label={ariaLabel}
            style={popoverStyle(place)}
            className={cn(
              POPOVER_PANEL,
              "max-h-72 max-w-[min(28rem,calc(100vw-2rem))] overflow-auto",
              place.up ? "origin-bottom" : "origin-top",
            )}
          >
            {items.map((item, i) => {
              const selected = item === current;
              const header = item.group && item.group !== items[i - 1]?.group;
              return (
                <li key={`${item.group ?? ""}:${item.value}`} role="presentation">
                  {header && (
                    <div className="px-2.5 pb-1 pt-2 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {item.group}
                    </div>
                  )}
                  <div
                    role="option"
                    tabIndex={-1}
                    data-index={i}
                    aria-selected={selected}
                    aria-disabled={item.disabled || undefined}
                    onMouseEnter={() => !item.disabled && setActive(i)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(item)}
                    onKeyDown={onKey}
                    className={cn(
                      "flex h-8 cursor-pointer items-center gap-2 whitespace-nowrap rounded-md px-2.5 text-sm",
                      i === active && "bg-accent",
                      selected && "font-medium text-primary",
                      item.disabled && "cursor-not-allowed opacity-50",
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {selected && <Check aria-hidden className="size-3.5 shrink-0" />}
                  </div>
                </li>
              );
            })}
          </ul>,
          document.body,
        )}
    </>
  );
}
