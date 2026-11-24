import { useState } from "react";
import { Input } from "@/components/ui/input";
import { digitsFor } from "@/lib/numberLimits";
import { formatPrice, parsePrice } from "@/lib/priceText";

/** Поле цены услуги; как пишется цена — `lib/priceText`. */

const show = (n: number | null | undefined) =>
  n == null ? "" : formatPrice(String(n).replace(".", ","));

export function PriceInput({
  value,
  label,
  placeholder,
  onCommit,
}: {
  value: number | null | undefined;
  label: string;
  placeholder?: string;
  onCommit: (n: number | null) => void;
}) {
  const [text, setText] = useState(show(value));
  return (
    <Input
      inputMode="decimal"
      // «99 999,99»: цифры предела, запятая и пробел между тысячами.
      maxLength={digitsFor("price") + 1}
      aria-label={label}
      placeholder={placeholder}
      value={text}
      onChange={(e) => setText(formatPrice(e.target.value))}
      onBlur={() => onCommit(parsePrice(text))}
      className="ml-[26px] w-28 text-right tabular-nums sm:ml-0"
    />
  );
}
